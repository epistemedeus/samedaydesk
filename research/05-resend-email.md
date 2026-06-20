# Resend Transactional Email — Implementation Playbook for samedaydesk.com

**Scope:** Resend Node SDK usage, domain verification DNS (SPF/DKIM/DMARC), sending from `contact@samedaydesk.com`, react-email vs raw HTML, sandbox/testing, rate limits, deliverability, bounce webhooks, idempotency, and — critically — **how Resend sending DNS coexists with Hostinger receiving mail (MX) on the same `samedaydesk.com` domain**, including the single-SPF-record merge problem.

**Researched:** 2026-06-20. SDK pin target: `resend@^6.13.0` (released 2026-06-17, [resend/resend-node](https://github.com/resend/resend-node)).

**Build phasing note (per project plan):** Phase 1 = signup WITHOUT email verification (signup notification + Stripe receipts). Phase 2 = add a hashed 6-digit email verification code. This report supports both; Section 11 covers the code specifically.

---

## 0. TL;DR / Decisions for the builder

1. **Install** `resend@^6.13.0`. Initialize once per Node process with `new Resend(process.env.RESEND_API_KEY)`.
2. **Verify the domain** `samedaydesk.com` in the Resend dashboard. Resend issues records on a **`send` subdomain** (e.g. `send.samedaydesk.com`) for SPF + MX bounce feedback, plus a DKIM record at `resend._domainkey.samedaydesk.com`. Add a DMARC TXT at `_dmarc.samedaydesk.com`.
3. **Send from** `SameDayDesk <contact@samedaydesk.com>` once verified. Set `replyTo` to the Gmail-forwarded address if you want replies in Gmail.
4. **Hostinger receiving + Resend sending coexist cleanly** because Resend's MX/SPF live on the `send.` subdomain, NOT the apex. Hostinger keeps the **apex MX** for receiving. The ONE collision point is the apex SPF TXT — but Resend's SPF is on `send.`, not apex, so in the default flow there is **no apex SPF merge needed**. If you ever add apex-level SPF for Resend (custom return-path) you must merge into a single TXT (Section 8).
5. **Idempotency:** pass `{ idempotencyKey: 'signup-welcome/<uid>' }` to every transactional send so webhook/retry storms never double-send.
6. **Templates:** use **react-email** (`@react-email/components` + `render()`), not hand-written HTML — table-based output survives Outlook.
7. **Webhooks:** subscribe to `email.bounced` / `email.complained`, verify with the **Svix** signature (or `resend.webhooks.verify()`), use the raw body.
8. **Testing before DNS verifies:** send `from: 'onboarding@resend.dev'` and `to:` **your own account email only**. Use `delivered@resend.dev`, `bounced@resend.dev`, `complained@resend.dev` to simulate events.

---

## 1. Install & initialize (Node SDK)

```bash
npm install resend
```

Latest: **`resend@6.13.0`** (2026-06-17). ([github.com/resend/resend-node](https://github.com/resend/resend-node))

```ts
// src/server/email/resend.ts
import { Resend } from 'resend';

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY is not set');
}

// One instance per process. The SDK is a thin fetch wrapper — reuse it.
export const resend = new Resend(process.env.RESEND_API_KEY);
```

API key: create in **Resend Dashboard → API Keys → Create**. Shown **once** — store as `RESEND_API_KEY`. Give it **Sending access** scope (not full access) for the server. ([resend.com/docs/send-with-nodejs](https://resend.com/docs/send-with-nodejs))

This fits the project's single-Node-process model (Express `/api/*` + built Vite SPA): the Resend client lives server-side only; the API key is never shipped to the browser.

---

## 2. Sending — `resend.emails.send()`

The SDK **does not throw** on API errors. It returns `{ data, error }`. Always check both. ([resend.com/docs/send-with-nodejs](https://resend.com/docs/send-with-nodejs))

```ts
const { data, error } = await resend.emails.send(
  {
    from: 'SameDayDesk <contact@samedaydesk.com>', // friendly-name format
    to: ['customer@example.com'],                   // string | string[], max 50
    subject: 'Your SameDayDesk order is confirmed',
    react: OrderReceiptEmail({ name, orderId, items, total }), // OR html / text
    replyTo: 'contact@samedaydesk.com',
    headers: { 'X-Entity-Ref-ID': orderId },        // optional dedupe hint
    tags: [{ name: 'category', value: 'receipt' }], // metadata for analytics
  },
  { idempotencyKey: `receipt/${orderId}` },          // 2nd arg = request options
);

if (error) {
  // log error.name + error.message; do NOT assume the email went out
  console.error('Resend send failed', error);
  throw new Error(`email_send_failed:${error.name}`);
}
// data.id is the Resend email id (use it to correlate with webhooks)
```

**Parameters** ([resend.com/docs/send-with-nodejs](https://resend.com/docs/send-with-nodejs)):

| Param | Notes |
|---|---|
| `from` | **Required.** `Name <addr@domain>`. Domain must be verified (or `onboarding@resend.dev` in test). |
| `to` | **Required.** string or array, **max 50** recipients. |
| `subject` | **Required.** |
| `html` / `text` / `react` | **At least one required.** `react` takes a rendered component instance. |
| `cc`, `bcc` | optional |
| `replyTo` | string or array. Point at the Gmail-forwarded inbox. |
| `scheduledAt` | ISO 8601 or natural language ("in 1 hour"). |
| `headers` | custom headers (e.g. `List-Unsubscribe`). |
| `tags` | `{name,value}[]` for filtering/analytics. |
| `attachments` | files, **40 MB** total cap. |
| `idempotencyKey` | passed in the **2nd arg** options object. Max 256 chars, 24h window. |

**Response shape:** success `{ data: { id }, error: null }`; failure `{ data: null, error: { name, message } }`.

**Batch send** (`resend.batch.send([...])`) exists for up to 100 messages in one call — useful for fan-out but not needed for one-off transactional sends here.

---

## 3. Idempotency (do this from day one)

Idempotency keys prevent duplicate sends across retries (network blips, Stripe webhook redelivery, Firestore function retries). ([resend.com/docs/dashboard/emails/idempotency-keys](https://resend.com/docs/dashboard/emails/idempotency-keys))

- **How it works:** Resend stores the key for **24 hours**. Same key + **same payload** → returns the original response **without resending**. Same key + **different payload** → `409 invalid_idempotent_request`.
- **Max length:** 256 chars.
- **Recommended format:** `<event-type>/<entity-id>`, e.g. `welcome-user/123456789`, or a UUID.

Concrete keys for this site:

| Email | Idempotency key |
|---|---|
| Signup welcome | `signup-welcome/${firebaseUid}` |
| Stripe receipt | `receipt/${stripePaymentIntentId}` (PI id is naturally unique) |
| Verification code (phase 2) | `verify-code/${firebaseUid}/${codeBatchId}` — must change per **new** code so a resend actually re-sends |

> Gotcha: for the verification code, if you reuse the *same* key when the user clicks "resend code", Resend returns the cached response and the new code never goes out. Generate a fresh code id per issuance and fold it into the key.

---

## 4. Domain verification — exact DNS records

In the Resend dashboard: **Domains → Add Domain → `samedaydesk.com`**, pick a **region** (e.g. `us-east-1`; region appears in the MX feedback host). Resend then generates per-domain records. ([resend.com/docs/dashboard/domains/introduction](https://resend.com/docs/dashboard/domains/introduction), [New Domain Verification Experience](https://resend.com/blog/new-domain-verification-experience))

Resend's pattern (confirmed against [dmarc.wiki/resend](https://dmarc.wiki/resend) and Resend's create-domain API) puts the **return-path / bounce + SPF on a `send` subdomain**, and DKIM at the `resend._domainkey` selector:

### The record set Resend issues (values are representative — copy the EXACT ones from YOUR dashboard, the DKIM key and region are per-domain)

| Type | Name / Host | Value | Priority/TTL |
|---|---|---|---|
| **MX** | `send.samedaydesk.com` | `feedback-smtp.us-east-1.amazonses.com` | priority **10**, TTL auto |
| **TXT (SPF)** | `send.samedaydesk.com` | `v=spf1 include:amazonses.com ~all` | TTL auto |
| **TXT (DKIM)** | `resend._domainkey.samedaydesk.com` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4...` (long RSA public key, per-domain) | TTL auto |

> The MX feedback host is region-specific: `feedback-smtp.<region>.amazonses.com`. Confirm the region in your dashboard. ([search corroboration](https://yomotherboard.com/question/how-to-add-mx-records-for-resend-without-conflicting-with-existing-ones/))

Older/alternative Resend setups present DKIM as **3 CNAME** records (`xxxx._domainkey` → `xxxx.dkim.amazonses.com`); the current dashboard typically issues a **single TXT** DKIM at `resend._domainkey`. **Use whatever the dashboard shows** — it varies by signup cohort. ([dmarcdkim.com guide](https://dmarcdkim.com/setup/how-to-setup-resend-spf-dkim-and-dmarc-records))

### DMARC — add this yourself (Resend recommends but doesn't auto-issue)

| Type | Name / Host | Value |
|---|---|---|
| **TXT (DMARC)** | `_dmarc.samedaydesk.com` | `v=DMARC1; p=none; rua=mailto:dmarc@samedaydesk.com; adkim=r; aspf=r;` |

Start at `p=none` (monitor only), then progress to `p=quarantine`, then `p=reject` once reports show clean auth for ~2 weeks. ([resend.com/docs/dashboard/domains/dmarc](https://resend.com/docs/dashboard/domains/dmarc), [Resend email-auth guide](https://resend.com/blog/email-authentication-a-developers-guide))

**Alignment fact that matters here:** Resend gets **strict DKIM alignment** (the `d=` matches `samedaydesk.com`) and **relaxed SPF alignment** (SPF authenticates the `send.samedaydesk.com` return-path subdomain, which is a relaxed-aligned subdomain of the From domain). So DMARC passes via DKIM regardless. Keep `adkim=r aspf=r` (relaxed) — do **not** set `aspf=s`, or the subdomain return-path would fail SPF alignment. ([dmarc.wiki/resend](https://dmarc.wiki/resend))

### Verification
After adding records, click **Verify** in the dashboard. DNS propagation is usually minutes but can take up to ~72h. Resend re-checks automatically. Status flips to **Verified** when SPF + DKIM resolve.

---

## 5. ⭐ Coexistence: Resend SENDING + Hostinger RECEIVING on samedaydesk.com

This is the crux. You want to **receive** mail at `contact@samedaydesk.com` (Hostinger mailbox, forwarded to Gmail) **and send** transactional mail via Resend, **same domain, simultaneously.** This works. Here is exactly why and how.

### 5.1 MX records do NOT conflict — different DNS levels

- **Receiving** is governed by the **apex** MX record: `samedaydesk.com → mxN.hostinger.com`. Mail to `contact@samedaydesk.com` is delivered using the **apex** MX. Hostinger owns this.
- **Resend's MX** is on the **`send.samedaydesk.com` subdomain** and only handles **bounce/complaint feedback** for Resend's sends. It is a *different DNS name*, resolved independently. ([yomotherboard: subdomain MX avoids conflict](https://yomotherboard.com/question/how-to-add-mx-records-for-resend-without-conflicting-with-existing-ones/))

> DNS resolves MX per-hostname. `samedaydesk.com` and `send.samedaydesk.com` are separate nodes in the tree. Hostinger's apex MX and Resend's subdomain MX never see each other. **Keep both. Do not delete the Hostinger apex MX.**

### 5.2 DKIM — no conflict ever

DKIM uses **unique selectors**. Hostinger's DKIM lives at `hostingermail._domainkey` (or similar); Resend's at `resend._domainkey`. Different selector hostnames = no collision. Keep both if you ever send from Hostinger too.

### 5.3 DMARC — single record, but it covers both

There is **only one** `_dmarc.samedaydesk.com` TXT and it applies to the whole domain. That's fine — a correctly-authenticated message from *either* Hostinger or Resend passes DMARC via its own SPF+DKIM. One DMARC record serves both senders. Do not create two.

### 5.4 ⚠️ SPF — the one place a merge can be needed

**Rule: a domain may have only ONE SPF TXT record per name.** Two `v=spf1 ...` TXT records on the same name = **PermError**, and SPF silently breaks for everyone. This is the classic footgun.

**Default Resend flow — NO apex SPF merge needed:**
Because Resend's SPF (`v=spf1 include:amazonses.com ~all`) is published on **`send.samedaydesk.com`**, NOT the apex, it does **not** touch Hostinger's apex SPF at all. Hostinger's apex SPF (which authorizes Hostinger to *send* from the apex, e.g. `v=spf1 include:_spf.mail.hostinger.com ~all`) stays exactly as-is. **In the standard setup the two SPF records live on different names and never need merging.**

```
samedaydesk.com         TXT  v=spf1 include:_spf.mail.hostinger.com ~all   ← Hostinger (apex, receiving provider's send auth)
send.samedaydesk.com    TXT  v=spf1 include:amazonses.com ~all             ← Resend (subdomain return-path)
```

**When you DO need to merge into one SPF TXT:** if you (a) configure Resend's **Custom Return Path at the apex**, or (b) decide to also send mail *as* the apex from both Hostinger and Resend, then both includes must live in **one** apex SPF record:

```
samedaydesk.com  TXT  v=spf1 include:_spf.mail.hostinger.com include:amazonses.com ~all
```

Merge rules:
- **One** `v=spf1` token at the start, **one** `~all` (or `-all`) at the end.
- Concatenate every provider's `include:` in the middle.
- Stay under the **10 DNS-lookup** SPF limit (each `include:` can chain lookups). Hostinger + amazonses is well under.
- Use `~all` (softfail) while stabilizing; tighten to `-all` later only if you're sure every legitimate sender is listed.

### 5.5 The exact record set for samedaydesk.com (recommended, default flow)

```
# --- RECEIVING (Hostinger) — keep as-is ---
samedaydesk.com.            MX   10  mx1.hostinger.com.
samedaydesk.com.            MX   20  mx2.hostinger.com.
samedaydesk.com.            TXT  "v=spf1 include:_spf.mail.hostinger.com ~all"
hostingermail1._domainkey…  (Hostinger DKIM, if Hostinger issued one — keep)

# --- SENDING (Resend) — add these, do NOT touch apex MX/SPF ---
send.samedaydesk.com.       MX   10  feedback-smtp.us-east-1.amazonses.com.
send.samedaydesk.com.       TXT  "v=spf1 include:amazonses.com ~all"
resend._domainkey.samedaydesk.com.  TXT  "p=<resend-DKIM-public-key>"

# --- POLICY (shared, single record) ---
_dmarc.samedaydesk.com.     TXT  "v=DMARC1; p=none; rua=mailto:dmarc@samedaydesk.com; adkim=r; aspf=r;"
```

> Confirm exact Hostinger MX hostnames in the Hostinger DNS panel (often `mx1.hostinger.com` / `mx2.hostinger.com`, priorities 5/10 in some accounts). Confirm Resend's region + DKIM value in the Resend dashboard. The structure above is the safe pattern; the literal values come from each dashboard.

---

## 6. Sandbox / testing WITHOUT a verified domain

Before DNS verifies you can still send, with hard limits ([Managing Domains](https://resend.com/docs/dashboard/domains/introduction), corroborated by [RedwoodSDK](https://docs.rwsdk.com/guides/email/sending-email/) and [Encore guide](https://encore.dev/blog/resend-tutorial)):

- **From:** must be `onboarding@resend.dev` (Resend's shared test sender). You cannot send `from` `contact@samedaydesk.com` until verified.
- **To:** **only the email address of your own Resend account** (the one you signed up with). Sending to arbitrary recipients is blocked until a domain is verified.
- **Simulation addresses** (work to test the pipeline + webhooks):
  - `delivered@resend.dev` → forces a delivered event
  - `bounced@resend.dev` → forces a hard bounce (tests your bounce webhook)
  - `complained@resend.dev` → forces a spam complaint event

This is ideal for Phase 1 testing: wire the signup-notification send, fire it at `delivered@resend.dev`, confirm the webhook + Firestore write, all before DNS is live.

**Free tier:** 3,000 emails/month, **100/day** cap on the Free plan. ([Resend pricing 2025/2026](https://flexprice.io/blog/detailed-resend-pricing-guide), [nuntly.com/resend-pricing](https://nuntly.com/resend-pricing)). Plenty for launch; Pro ($20/mo) lifts the daily cap when needed. Resend does **not** auto-bill overage — it notifies/prompts upgrade and may pause sending if you blow past repeatedly.

---

## 7. Rate limits

Default **2 requests/second per team**; the dashboard now lets teams self-raise the default ceiling toward **~5 req/s**, and higher on request. ([resend.com/changelog/api-rate-limit](https://resend.com/changelog/api-rate-limit), [resend.com/docs/api-reference/rate-limit](https://resend.com/docs/api-reference/rate-limit))

- Exceeding → **HTTP 429**.
- Response headers (IETF draft standard): `ratelimit-limit`, `ratelimit-remaining`, `ratelimit-reset`, and `retry-after`.
- **Handling:** respect `retry-after` with exponential backoff; for any fan-out, use a queue / concurrency limiter (e.g. `p-limit`) rather than firing in parallel. ([Mastering Email Rate Limits](https://dalenguyen.me/blog/2025-09-07-mastering-email-rate-limits-resend-api-cloud-run-debugging))

For this site (one email per signup / per purchase) you'll never approach 2 req/s organically — but keep a single retry-with-backoff wrapper so a burst (e.g. backfill) can't 429-storm.

---

## 8. Templates — react-email vs raw HTML

**Recommendation: use react-email.** It's built by the Resend team; components render to **table-based HTML** that survives Outlook/Gmail/Apple Mail where flexbox/div HTML breaks. ([React Email 6.0](https://resend.com/blog/react-email-6), [react.email/docs/utilities/render](https://react.email/docs/utilities/render))

```bash
npm install @react-email/components @react-email/render
```

```tsx
// emails/OrderReceipt.tsx
import { Html, Head, Body, Container, Section, Text, Button, Hr } from '@react-email/components';

export function OrderReceiptEmail({ name, orderId, total }: Props) {
  return (
    <Html>
      <Head />
      <Body style={{ background: '#0b0b0c', fontFamily: 'Inter, Arial, sans-serif' }}>
        <Container>
          <Text>Hi {name}, your SameDayDesk order is confirmed.</Text>
          <Section>
            <Text>Order {orderId} — ${'{'}total{'}'}</Text>
            <Button href="https://samedaydesk.com/dashboard">View order</Button>
          </Section>
          <Hr />
          <Text>Money-back guarantee. Reply to this email any time.</Text>
        </Container>
      </Body>
    </Html>
  );
}
```

Two integration styles:
1. **Pass the component to Resend directly** via `react: OrderReceiptEmail({...})` — Resend renders it server-side. Simplest. ([send-with-nodejs](https://resend.com/docs/send-with-nodejs))
2. **Pre-render to a string** with `render()` (from `@react-email/render`) and pass `html:` — gives you the HTML to log/snapshot-test.

```ts
import { render } from '@react-email/render';
const html = await render(OrderReceiptEmail({ name, orderId, total }));
```

Best practices ([ecosire.com/blog/react-email-templates-guide](https://ecosire.com/blog/react-email-templates-guide)):
- Use `@react-email/components` primitives, **never raw `<div>` flex layouts** (Outlook ignores them).
- **Export render functions**, not bare components, to avoid "React is not defined"/JSX issues in non-React server runtimes.
- Local preview server (`email dev`) gives hot-reload while designing.
- **Always include a `text:` fallback** (or let react-email generate one) — improves deliverability and accessibility.

Raw HTML is acceptable only for trivial, single-paragraph mails (e.g. the bare 6-digit code) where you control the markup tightly; even then react-email is lower-risk.

---

## 9. Deliverability checklist

([Resend email-auth guide](https://resend.com/blog/email-authentication-a-developers-guide), [dmarc.wiki/resend](https://dmarc.wiki/resend), [prospeo.io 2026 guide](https://prospeo.io/s/spf-dkim-dmarc))

- ✅ **SPF + DKIM + DMARC all passing & aligned** (Section 4). DKIM strict-aligns automatically with Resend.
- ✅ **Send from a real, monitored From** (`contact@samedaydesk.com`) with a working `replyTo`. Avoid `no-reply@`.
- ✅ **DMARC progression:** `p=none` → `p=quarantine` → `p=reject` as reports confirm clean auth. **2024+ enforcement:** Google & Yahoo require SPF+DKIM+DMARC for bulk senders (Feb 2024), Microsoft followed early 2025; 2026 enforcement rejects non-compliant mail at SMTP. ([prospeo.io](https://prospeo.io/s/spf-dkim-dmarc))
- ✅ **Always send a plain-text alternative** alongside HTML.
- ✅ **Keep transactional and marketing streams separate.** If you ever add marketing blasts, use a **separate subdomain** (e.g. `news.samedaydesk.com`) to isolate reputation — never burn the transactional domain's reputation.
- ✅ **Honor bounces/complaints:** suppress addresses that hard-bounce or complain (Section 10). Repeated sends to dead addresses tank reputation.
- ✅ **List-Unsubscribe** header on anything non-essential (not needed for pure transactional receipts/codes, required for marketing).
- ✅ **Warm gradually** — your volume is low, so just send real, wanted mail; no aggressive ramp needed.
- ✅ Avoid spammy subject/body patterns, all-image emails, and link shorteners.

---

## 10. Webhooks — bounces & complaints

Set up in **Resend Dashboard → Webhooks → Add Endpoint** (e.g. `https://samedaydesk.com/api/webhooks/resend`). Subscribe to the events you care about. ([resend.com/docs/dashboard/webhooks/introduction](https://resend.com/docs/dashboard/webhooks/introduction))

**Event types:** `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.opened`, `email.clicked` (opens/clicks require tracking enabled).

**Verification (do this — Resend signs with Svix):** ([resend.com/docs/dashboard/webhooks/verify-webhooks-requests](https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests), [Svix Node guide](https://www.svix.com/guides/receiving/receive-webhooks-with-typescript-nodejs/))

```ts
import { Webhook } from 'svix';            // npm install svix
import express from 'express';

const wh = new Webhook(process.env.RESEND_WEBHOOK_SECRET!); // 'whsec_...'

// CRITICAL: raw body, not JSON-parsed. Mount express.raw for this route.
router.post('/api/webhooks/resend',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const payload = req.body.toString('utf8');     // raw string
    const headers = {
      'svix-id': req.header('svix-id')!,
      'svix-timestamp': req.header('svix-timestamp')!,
      'svix-signature': req.header('svix-signature')!,
    };

    let evt: any;
    try {
      evt = wh.verify(payload, headers);            // throws on bad signature
    } catch {
      return res.status(400).send('invalid signature');
    }

    switch (evt.type) {
      case 'email.bounced':
        // suppress this address in Firestore; stop future sends
        suppressEmail(evt.data.to, 'bounced');
        break;
      case 'email.complained':
        suppressEmail(evt.data.to, 'complained');
        break;
    }
    return res.status(200).send('ok');
  });
```

Notes:
- **Raw body is mandatory** — JSON-parse-then-stringify changes bytes and breaks the signature. Mount `express.raw()` only on the webhook route (the rest of `/api/*` keeps `express.json()`). ([Svix verifying-payloads](https://docs.svix.com/receiving/verifying-payloads/how))
- Alternative: the Resend SDK ships `resend.webhooks.verify({ payload, headers, webhookSecret })` if you prefer not to add `svix` directly.
- **Idempotency on the receive side:** dedupe on the `svix-id` header (store processed ids) — Resend may redeliver. ([webhooks intro](https://resend.com/docs/dashboard/webhooks/introduction))
- Always return **200** quickly; do heavy work async.

For this site, maintain a Firestore `emailSuppressions` collection keyed by address; check it before any send.

---

## 11. Phase 2 — hashed 6-digit email verification code

Resend is just the transport. The security lives in **how you store and check the code**, not in Resend.

**Generation & storage (server-side):**
```ts
import crypto from 'node:crypto';

const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0'); // 000000–999999
const codeHash = crypto.createHash('sha256')
  .update(`${code}:${firebaseUid}`)  // salt with uid to prevent cross-user reuse
  .digest('hex');

// Firestore doc: { uid, codeHash, expiresAt: now+10min, attempts: 0, codeBatchId }
```

**Send (raw HTML is fine for a single code, or a tiny react-email template):**
```ts
await resend.emails.send(
  {
    from: 'SameDayDesk <contact@samedaydesk.com>',
    to: [userEmail],
    subject: 'Your SameDayDesk verification code',
    text: `Your verification code is ${code}. It expires in 10 minutes.`,
    html: `<p>Your verification code is <strong style="font-size:24px;letter-spacing:4px">${code}</strong>.</p><p>Expires in 10 minutes.</p>`,
  },
  { idempotencyKey: `verify-code/${firebaseUid}/${codeBatchId}` },
);
```

**Verification rules:**
- Store **only the hash** (sha256 or bcrypt). Compare with constant-time compare (`crypto.timingSafeEqual`).
- **Expiry** ~10 min. **Attempt cap** (e.g. 5) then invalidate. **Rate-limit** resends (e.g. 1/30s, 5/hour) — both to protect users and to stay under Resend's 2 req/s.
- **Fresh `codeBatchId` per issuance** so the idempotency key changes and "Resend code" actually sends a new code (Section 3 gotcha).
- Never log the plaintext code. Never return it in API responses.
- Because Phase 1 ships signup **without** verification, gate the verification flow behind a feature flag so you can enable it cleanly at the end.

---

## 12. Phase 1 wiring summary (no verification)

1. **Signup notification** (to the user, or to ops): on Firebase Auth user-create / server signup handler → `resend.emails.send({ from: 'SameDayDesk <contact@samedaydesk.com>', to: userEmail, react: WelcomeEmail(...) }, { idempotencyKey: 'signup-welcome/'+uid })`.
2. **Stripe receipt:** in the **server-side Stripe webhook** for `payment_intent.succeeded` / `checkout.session.completed` (server-authoritative), send a receipt with `idempotencyKey: 'receipt/'+paymentIntentId`. (Stripe also has its own receipts; decide whether Resend duplicates or replaces them.)
3. **Bounce/complaint webhook** live (Section 10) → suppression list.
4. **Until DNS verifies:** test via `onboarding@resend.dev` → your own account email + `delivered@/bounced@/complained@resend.dev`.

---

## Sources

- [Send emails with Node.js — Resend docs](https://resend.com/docs/send-with-nodejs)
- [resend/resend-node (GitHub) — v6.13.0](https://github.com/resend/resend-node)
- [Idempotency Keys — Resend docs](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Managing Domains — Resend docs](https://resend.com/docs/dashboard/domains/introduction)
- [Implementing DMARC — Resend docs](https://resend.com/docs/dashboard/domains/dmarc)
- [New Domain Verification Experience — Resend blog](https://resend.com/blog/new-domain-verification-experience)
- [Email Authentication: A Developer's Guide — Resend blog](https://resend.com/blog/email-authentication-a-developers-guide)
- [How to set up SPF, DKIM and DMARC for Resend — dmarc.wiki](https://dmarc.wiki/resend)
- [Resend SPF, DKIM, DMARC Configuration — DmarcDkim.com](https://dmarcdkim.com/setup/how-to-setup-resend-spf-dkim-and-dmarc-records)
- [How to Add MX Records for Resend Without Conflicting — yomotherboard](https://yomotherboard.com/question/how-to-add-mx-records-for-resend-without-conflicting-with-existing-ones/)
- [API Rate Limit — Resend changelog](https://resend.com/changelog/api-rate-limit) / [Usage Limits — Resend docs](https://resend.com/docs/api-reference/rate-limit)
- [Mastering Email Rate Limits — Dale Nguyen](https://dalenguyen.me/blog/2025-09-07-mastering-email-rate-limits-resend-api-cloud-run-debugging)
- [Verify Webhook Requests — Resend docs](https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests) / [Webhooks intro](https://resend.com/docs/dashboard/webhooks/introduction)
- [Receive Webhooks with TypeScript (Node.js) — Svix](https://www.svix.com/guides/receiving/receive-webhooks-with-typescript-nodejs/) / [Svix verifying payloads](https://docs.svix.com/receiving/verifying-payloads/how)
- [React Email 6.0 — Resend blog](https://resend.com/blog/react-email-6) / [render utility — react.email](https://react.email/docs/utilities/render) / [React Email Templates 2026 — ecosire](https://ecosire.com/blog/react-email-templates-guide)
- [Resend Pricing Guide 2025 — Flexprice](https://flexprice.io/blog/detailed-resend-pricing-guide) / [Resend Pricing 2026 — nuntly](https://nuntly.com/resend-pricing)
- [Sending Email — RedwoodSDK](https://docs.rwsdk.com/guides/email/sending-email/) / [Resend with Encore.ts](https://encore.dev/blog/resend-tutorial)
- [SPF, DKIM, DMARC 2026 Setup Guide — prospeo.io](https://prospeo.io/s/spf-dkim-dmarc)
