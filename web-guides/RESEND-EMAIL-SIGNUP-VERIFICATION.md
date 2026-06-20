# Resend — transactional email, signup notifications & email verification codes

Reusable pattern for sending email and confirming a user's address with a
**6-digit code** (layered on top of Firebase Auth). Distilled from a production
build. Copy the structure; the copy/templates/limits are yours to tune.

---

## Mental model

- **Resend = the SMTP/transactional layer.** One API key, send HTML emails from a
  **verified domain**. Used for: the verification code, signup/order notifications
  to the admin, receipts, etc.
- **Why a custom 6-digit code** (instead of Firebase's built-in email-link)?
  Full control of the UX and branding, works inside a multi-step form, and the
  *server* decides when `emailVerified` flips — which you then enforce on every
  sensitive route (`requireVerifiedEmail`).
- **The code is a secret you never store in plaintext.** Store a **salted hash**,
  short TTL, rate-limit both sending and guessing, in a collection the client
  cannot read. On success, set `emailVerified` via the Admin SDK and delete it.

---

## Environment variables

| Var | Notes |
|---|---|
| `RESEND_API_KEY` | From the Resend dashboard. Secret (server only). |
| `RESEND_FROM_EMAIL` | e.g. `contact@yourdomain.com` — must be on a **verified** Resend domain. |
| `ADMIN_EMAIL` | Where signup/order notifications go. |
| `JWT_SECRET` | Reused here as a **pepper** for hashing codes (any high-entropy server secret works). |

## Domain setup (once)

1. Resend dashboard → **Domains → Add domain** → add the DNS records it gives you
   (SPF `TXT`, DKIM `CNAME`/`TXT`, optional DMARC) at your DNS provider.
2. Wait for **Verified**. Until then, `from:` on that domain will bounce/spam.
3. Set `RESEND_FROM_EMAIL` to an address on that domain. Use a real, monitored
   reply-to if you expect replies.

## Client

```ts
import { Resend } from "resend";
const key = process.env.RESEND_API_KEY;
export const resend = key && key !== "later" ? new Resend(key) : null;     // null when unconfigured
export const isEmailConfigured = () => resend !== null;
```

Sending is one call:

```ts
await resend!.emails.send({ from: `Brand <${process.env.RESEND_FROM_EMAIL}>`, to, subject, html });
```

---

## Email verification code — the core pattern

State lives in `emailVerifications/{uid}` (locked to server-only by Firestore
rules — see the Firebase doc). Tunables:

```ts
const CODE_TTL_MS = 10 * 60_000;     // code valid 10 min
const MAX_ATTEMPTS = 5;              // wrong guesses before the code is burned
const MAX_SENDS_PER_WINDOW = 5;      // codes per rolling hour
const SEND_WINDOW_MS = 60 * 60_000;
const MIN_RESEND_INTERVAL_MS = 45_000; // min gap between sends
```

Helpers — generate, hash (salted + peppered), constant-time compare:

```ts
import crypto from "node:crypto";
const generateCode = () => crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
const hashCode = (code: string, uid: string) =>
  crypto.createHash("sha256").update(`${code}:${uid}:${process.env.JWT_SECRET || ""}`).digest("hex");
const hashesEqual = (a: string, b: string) =>
  a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
```

**Send** — rate-limit + persist the hash in one transaction, then email the code:

```ts
export async function sendVerificationCode(uid, email, req) {
  if (!isEmailConfigured()) return { ok: false, status: 503, error: "Email not configured" };
  const ref = firestore.collection("emailVerifications").doc(uid);
  const now = Date.now(), code = generateCode();

  const gate = await firestore.runTransaction(async (tx) => {
    const d = (await tx.get(ref)).data() ?? {};
    let sends = d.sends ?? 0, windowStart = d.windowStart?.toMillis?.() ?? now;
    const lastSent = d.lastSentAt?.toMillis?.() ?? 0;
    if (now - windowStart > SEND_WINDOW_MS) { sends = 0; windowStart = now; }
    if (now - lastSent < MIN_RESEND_INTERVAL_MS) return { ok: false, status: 429, error: "Please wait before requesting another code." };
    if (sends >= MAX_SENDS_PER_WINDOW)         return { ok: false, status: 429, error: "Too many codes requested. Try later." };
    tx.set(ref, {
      codeHash: hashCode(code, uid),
      expiresAt: admin.firestore.Timestamp.fromMillis(now + CODE_TTL_MS),
      attempts: 0, sends: sends + 1,
      windowStart: admin.firestore.Timestamp.fromMillis(windowStart),
      lastSentAt: admin.firestore.Timestamp.fromMillis(now),
    }, { merge: true });
    return { ok: true };
  });
  if (!gate.ok) return gate;

  await resend!.emails.send({ from: `Brand <${process.env.RESEND_FROM_EMAIL}>`, to: email,
    subject: "Your verification code", html: verificationHtml(code) });
  return { ok: true };
}
```

**Verify** — check TTL + attempts, compare hashes constant-time, then flip the
Firebase flag and delete the record:

```ts
export async function verifyCode(uid, code, req) {
  if (!/^\d{6}$/.test(code)) return { ok: false, status: 400, error: "Enter the 6-digit code." };
  const ref = firestore.collection("emailVerifications").doc(uid);
  const now = Date.now(), expected = hashCode(code, uid);

  const out = await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, status: 410, error: "No active code. Request a new one." };
    const d = snap.data()!;
    if (now > (d.expiresAt?.toMillis?.() ?? 0)) return { ok: false, status: 410, error: "Code expired." };
    if ((d.attempts ?? 0) >= MAX_ATTEMPTS)      return { ok: false, status: 429, error: "Too many attempts." };
    if (!hashesEqual(d.codeHash ?? "", expected)) {
      tx.update(ref, { attempts: (d.attempts ?? 0) + 1 });
      return { ok: false, status: 400, error: "Incorrect code." };
    }
    tx.delete(ref);
    return { ok: true };
  });

  if (out.ok) await firebaseAuth.updateUser(uid, { emailVerified: true });  // server is source of truth
  return out;
}
```

**Routes** (all behind `requireAuth`; short-circuit if already verified):

```
POST /api/auth/send-verification-code   → sendVerificationCode(req.uid, req.userEmail, req)
POST /api/auth/verify-code  { code }     → verifyCode(req.uid, code, req)
```

**Client flow:** after signup → call send-verification-code → user types code on a
`verify-email` screen → call verify-code → on success
`await user.reload(); await user.getIdToken(true);` so `email_verified` is in the
next request, then proceed (to dashboard / payment).

## Email template

Keep templates as plain functions returning HTML strings (no heavy deps). Inline
styles only (email clients ignore `<style>`/external CSS). Big, copyable code:

```ts
export const verificationHtml = (code: string) => `
  <div style="font-family:Georgia,serif;max-width:480px;margin:auto;padding:32px;color:#1a1714">
    <h1 style="font-size:18px;letter-spacing:.04em">Confirm your email</h1>
    <p>Enter this code to continue. It expires in 10 minutes.</p>
    <div style="font:600 34px/1 'IBM Plex Mono',monospace;letter-spacing:.3em;
                background:#f4f0e6;border:1px solid #c9c0ac;padding:16px;text-align:center">${code}</div>
    <p style="color:#8a877f;font-size:12px">If you didn't request this, ignore this email.</p>
  </div>`;
```

## Admin / ops notifications

A thin `notifications.ts` that fires on signup and on order-created, emailing
`ADMIN_EMAIL` (and optionally syncing to Notion/Slack). Keep them best-effort
(wrap in try/catch; never let a notification failure break the user's request).

---

## Checklist / gotchas

- [ ] Domain **verified** in Resend before going live; `from:` on that domain.
- [ ] **Never** store the raw code — only a salted+peppered hash; compare with `timingSafeEqual`.
- [ ] Lock `emailVerifications/{uid}` to server-only in Firestore rules.
- [ ] Rate-limit **sends** (per-window + min-interval) *and* **guesses** (max attempts); burn the code after.
- [ ] Server flips `emailVerified` via Admin SDK; client must refresh its token afterward.
- [ ] Enforce `requireVerifiedEmail` on every sensitive route — the email gate is server-side, not just UI.
- [ ] Notifications are best-effort; don't couple them to the success path.

See also: `FIREBASE-AUTH-AND-DB.md`, `STRIPE-PAYMENTS-AND-ELEMENTS.md`.
