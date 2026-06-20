# Firebase Auth + Firestore + Storage — Current Best Practices (2025–2026)

> Scope: validate/update an existing 2023-era internal playbook for **SameDayDesk** (Neomorphic LLC). Stack target: a single Node process — Express serving `/api/*` + a built Vite SPA — with Firebase as the identity+data spine, server verifying ID tokens, server-authoritative Stripe pricing. This report also covers the Next.js Route Handler variant since the playbook may migrate.
> Date of research: **June 2026.** Versions and dates below are current as of then.

---

## 0. TL;DR — what changed since a 2023 playbook (read this first)

| Topic | 2023-era assumption | 2025–2026 reality | Action |
|---|---|---|---|
| Web SDK version | v9/v10 modular | **v12.x is current** (`firebase@12.15.0`, Jun 16 2026). Modular API unchanged in spirit. | Pin `firebase@^12`. |
| Admin SDK | `firebase-admin@11`, `require('firebase-admin')` namespaced | **`firebase-admin@13.x`** (13.5.0+, Aug 2025). Modular subpath imports (`firebase-admin/app`, `/auth`, `/firestore`). `initializeApp()` is now **idempotent**. Requires **Node 18+**. | Upgrade, switch to subpath imports. |
| Storage free on Spark | Yes | **NO.** Cloud Storage for Firebase now **requires the Blaze (pay-as-you-go) plan.** Spark projects lost Storage read/write starting **Feb 3, 2026**. A free *usage tier* still exists within Blaze. | Project must be on **Blaze** before using Storage. Attach a billing account + budget alert. |
| Default Storage bucket name | `PROJECT_ID.appspot.com` | New default buckets (created after Sep 2024) are **`PROJECT_ID.firebasestorage.app`** and are independent of App Engine. | Use the new bucket domain in config; re-download config if you see the wrong bucket. |
| `localhost` auto-authorized for Auth | Yes | **NO** for projects created after **Apr 28, 2025** — `localhost` is no longer an authorized domain by default. | Manually add `localhost` under Auth → Settings → Authorized domains for local dev. |
| Firestore database | single `(default)` DB | `(default)` still exists and is still the only one with **free-tier quota**; **multiple named databases are GA** but named DBs do **not** get free quota. | Use `(default)` for SameDayDesk. |
| Rules deploy | console copy-paste | Keep rules in repo, deploy via **Firebase CLI** in CI; REST management API exists for automation. | `firebase deploy --only firestore:rules,storage`. |
| Node minimum | Node 14/16 | Web SDK v11+ requires **Node 20** for tooling; Admin SDK v13 requires **Node 18+**. | Use Node 20 LTS. |

Sources: [JS SDK release notes](https://firebase.google.com/support/release-notes/js), [Admin Node release notes](https://firebase.google.com/support/release-notes/admin/node), [Storage Sept-2024 FAQ](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024), [Google sign-in](https://firebase.google.com/docs/auth/web/google-signin).

---

## 1. Versions (pin these)

- **Client (browser) Web SDK:** `firebase@^12` — latest `12.15.0` (Jun 16 2026). The modular, tree-shakeable API (`import { getAuth } from 'firebase/auth'`) is the only recommended surface; the old namespaced `firebase.auth()` compat API is legacy. v11 set the Node-20 tooling floor and launched the Firebase AI Logic SDK (irrelevant to us). v12 added Firestore Pipelines/full-text-search and minor fixes — nothing breaking for a standard auth/data app. ([release notes](https://firebase.google.com/support/release-notes/js))
- **Server (Admin) SDK:** `firebase-admin@^13` — `13.5.0`+ (Aug 2025). Use **subpath modular imports**. `initializeApp()` is now idempotent (returns the existing app if called again with identical config) — fewer "app already exists" crashes in hot-reload / serverless. ([release notes](https://firebase.google.com/support/release-notes/admin/node))
- **Firebase CLI:** `firebase-tools` latest. Install globally or as a dev dependency. Used for emulators + rules deploy.
- **Runtime:** Node 20 LTS.

---

## 2. Console setup for the already-created project `samedaydesk`

All steps are in the Firebase console (`console.firebase.google.com` → project `samedaydesk`).

### 2.1 Authentication
1. **Build → Authentication → Get started.**
2. **Sign-in method** tab → enable **Email/Password** → Save. (Optionally also enable the **Email link / passwordless** toggle later when you add the 6-digit code flow — though note Resend-based 6-digit codes are *your own* flow, not Firebase's email-link, so leave email-link off unless you adopt it.)
3. Same tab → enable **Google** → pick a project support email → Save. Google works with zero extra OAuth config for Firebase-hosted domains; for a **custom domain** (`samedaydesk.com`) you must also whitelist the redirect URL in the underlying Google Cloud OAuth client. ([Google sign-in](https://firebase.google.com/docs/auth/web/google-signin))
4. **Authentication → Settings → Authorized domains.** Add:
   - `samedaydesk.com` and `www.samedaydesk.com` (production)
   - **`localhost`** — REQUIRED now. Since **Apr 28, 2025**, new projects do **not** include `localhost` by default, so client-side `signInWithPopup`/`signInWithEmailAndPassword` from `http://localhost` will fail with `auth/unauthorized-domain` until you add it. ([2025 authorized-domains change](https://firebase.google.com/docs/auth/web/google-signin))
   - Any Hostinger preview domain you use.

### 2.2 Firestore
1. **Build → Firestore Database → Create database.**
2. Choose **Production mode** (locked rules; default-deny). Never start in test mode for anything you'll ship. ([get-started](https://firebase.google.com/docs/firestore/security/get-started))
3. **Region:** pick a US multi-region or region and treat it as permanent — Firestore location is immutable. For a US company with Always-Free-tier alignment, **`nam5` (US multi-region)** is the standard choice; if you want single-region lower latency/cost, `us-central1`/`us-east1`/`us-west1` align with the Storage "Always Free" regions. Note: the **first** Firestore DB also sets the project's *"location for default Google Cloud resources,"* which then constrains where the default Storage bucket lives — so decide region once, deliberately. ([manage databases](https://firebase.google.com/docs/firestore/manage-databases))
4. This creates the **`(default)`** database. Keep it — it is the only DB with free-tier quota (see §6).

### 2.3 Storage
1. **Build → Storage → Get started.**
2. You will be **forced to upgrade to Blaze** — Cloud Storage for Firebase requires a pay-as-you-go billing account as of the 2024/2026 changes (§5). Link a Cloud Billing account.
3. The default bucket is created as **`samedaydesk.firebasestorage.app`** (new naming, App-Engine-independent). Use that exact string in client config. ([Sept-2024 FAQ](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024))
4. Set a **billing budget + alert** in Google Cloud (e.g. $5/$20) so a runaway upload loop can't surprise-bill you. Free tier within Blaze: ~5 GB stored, 1 GB/day download, 20k uploads/day, 50k downloads/day for legacy `appspot.com`; new `firebasestorage.app` buckets follow GCS pricing with Always-Free in US-CENTRAL1/EAST1/WEST1.

---

## 3. Client init (modular Web SDK v12)

`src/lib/firebase.ts` (Vite SPA). Use `import.meta.env.VITE_*` so values are baked at build time — these are **public** (Firebase web config is not secret; security is enforced by rules + server token verification, not by hiding the API key).

```ts
// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,      // samedaydesk.firebaseapp.com
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,        // samedaydesk
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,// samedaydesk.firebasestorage.app  <-- new naming
  messagingSenderId: import.meta.env.VITE_FIREBASE_MSG_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// initializeApp guard prevents double-init under Vite HMR
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);           // uses "(default)" database
export const storage = getStorage(app);

// Local dev: point at the Emulator Suite (see §7)
if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === "true") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
}
```

Sign-in + get a bearer token to call your own backend:

```ts
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { auth } from "@/lib/firebase";

await signInWithEmailAndPassword(auth, email, password);
// or: await signInWithPopup(auth, new GoogleAuthProvider());

const idToken = await auth.currentUser!.getIdToken(); // 1-hour JWT, auto-refreshed by SDK
await fetch("/api/me", { headers: { Authorization: `Bearer ${idToken}` } });
```

> Always call `getIdToken()` right before a request (it returns a cached token and silently refreshes when near expiry). Do **not** cache the raw string yourself for long — ID tokens expire after **1 hour**.

---

## 4. Admin init + server-side token verification

### 4.1 Admin init (modular v13) — the `private_key` newline gotcha

```ts
// server/firebaseAdmin.ts
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // *** THE GOTCHA ***
        // In .env the private key is stored with literal backslash-n.
        // Convert "\\n" -> real newline or the PEM parser throws:
        // "Failed to parse private key: Invalid PEM formatted message."
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
      // Only needed if you also use the named bucket explicitly:
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET, // samedaydesk.firebasestorage.app
    });

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
export const adminStorage = getStorage(app);
```

**The `private_key` newline escaping gotcha (the #1 deploy footgun):**
- The service-account JSON `private_key` is a multi-line PEM. When you paste it into a single-line `.env` value, the newlines become the **two characters** `\` `n`.
- At runtime you must turn those back into real newlines: `.replace(/\\n/g, "\n")`.
- Wrap the value in double quotes in `.env`: `FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n"`.
- Keep the `-----BEGIN/END PRIVATE KEY-----` markers intact **with their spaces**. Malformed headers are a common silent failure.
- Alternative that sidesteps the gotcha entirely: base64-encode the whole service-account JSON into one env var and `JSON.parse(Buffer.from(b64,'base64').toString())` at boot — no newline surgery needed. On Google infra (Cloud Run/App Engine/Functions) prefer `applicationDefault()` and set **no** key at all.

Sources: [Admin setup](https://firebase.google.com/docs/admin/setup), [benmvp env-vars writeup](https://www.benmvp.com/blog/initializing-firebase-admin-node-sdk-env-vars/), [Invalid-PEM discussion](https://github.com/gladly-team/next-firebase-auth/discussions/95).

> **Never** commit the service-account JSON or `.env` to git. On Hostinger, set these as environment variables in the deploy config, not in the repo.

### 4.2 ID-token bearer verification (Express middleware)

```ts
// server/requireAuth.ts
import type { Request, Response, NextFunction } from "express";
import { adminAuth } from "./firebaseAdmin";

export interface AuthedRequest extends Request {
  uid?: string;
  email?: string;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return res.status(401).json({ error: "missing_bearer_token" });

  try {
    // checkRevoked=true also rejects disabled/revoked users (one extra read per call).
    // For high-traffic read endpoints you can pass false to skip that round-trip.
    const decoded = await adminAuth.verifyIdToken(match[1], /* checkRevoked */ true);
    req.uid = decoded.uid;
    req.email = decoded.email;
    next();
  } catch (err: any) {
    if (err?.code === "auth/id-token-expired")
      return res.status(401).json({ error: "token_expired" });
    return res.status(401).json({ error: "invalid_token" });
  }
}
```

`verifyIdToken` returns a decoded payload containing at least `uid`, `email`, `email_verified`, `auth_time`, `firebase.sign_in_provider`, plus any **custom claims** you set with `adminAuth.setCustomUserClaims(uid, {...})` (useful for roles like `admin`, or `paidTier`). ([verify-id-tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens))

**Key points / 2025–2026 guidance:**
- `verifyIdToken` checks signature, issuer, audience, and expiry **offline** (against cached Google public keys) — no network call unless `checkRevoked: true`.
- ID tokens last **1 hour** and **remain valid after sign-out** until expiry — that's expected; rely on short lifetime + `checkRevoked` for sensitive actions (refunds, account deletion).
- For SameDayDesk's **server-authoritative Stripe flow**, verify the token in the route, then derive price/entitlements from the verified `uid` — never trust amounts from the client. This is exactly the right pattern; keep it.
- **Session cookies** (`adminAuth.createSessionCookie`) are the alternative when you want server-rendered pages with httpOnly cookies (1–14 day lifetime, revocable). For a Vite SPA calling `/api/*` with `Authorization: Bearer`, plain ID-token verification is simpler and is the recommended approach. Adopt session cookies only if you move to SSR.

Usage:

```ts
app.get("/api/me", requireAuth, (req: AuthedRequest, res) => {
  res.json({ uid: req.uid, email: req.email });
});
```

### 4.3 Next.js Route Handler variant (App Router)

If/when the backend is a Next.js Route Handler instead of Express, the verification is identical — only the request plumbing differs. Put admin init in a module guarded by `getApps()` (Next dev hot-reloads modules), and mark the route `runtime = "nodejs"` (the Admin SDK uses Node crypto and **does not run on the Edge runtime**).

```ts
// app/api/me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/server/firebaseAdmin";

export const runtime = "nodejs"; // REQUIRED: firebase-admin can't run on Edge

export async function GET(req: NextRequest) {
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer (.+)$/);
  if (!m) return NextResponse.json({ error: "missing_bearer_token" }, { status: 401 });
  try {
    const decoded = await adminAuth.verifyIdToken(m[1], true);
    return NextResponse.json({ uid: decoded.uid, email: decoded.email });
  } catch {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }
}
```

> Do NOT do `firebase-admin` work in Next.js **middleware** (`middleware.ts`) — that runs on the Edge runtime where the Admin SDK can't execute. Verify in the Route Handler (Node runtime), or in middleware verify a lightweight session cookie via a separate Edge-compatible JWT check. ([Jan-2026 Next.js + Firebase JWT guide](https://medium.com/@jonathan-trujillo.dev/how-to-implement-jwt-authentication-with-firebase-in-next-js-express-js-112377ad1714))

---

## 5. Storage now requires Blaze (2024–2026 change — flag in old playbook)

This is the single biggest correction to a 2023-era playbook.

- **Oct 30, 2024:** creating a *new* default bucket (console or REST) requires the **Blaze** plan; new bucket name format is `PROJECT_ID.firebasestorage.app`, independent of App Engine.
- **Feb 3, 2026:** to **retain access** to any Cloud Storage resources (including existing default buckets), the project must be on **Blaze**. Spark-only projects lose read/write; console redirects to upgrade; API returns **402/403**. Data is retained but inaccessible until you upgrade.
- A **no-cost usage tier still exists within Blaze** (you only pay above the free thresholds), and `appspot.com` legacy buckets keep their original allowances.

Action for SameDayDesk: upgrade `samedaydesk` to **Blaze before wiring Storage**, set a budget alert, and use the `samedaydesk.firebasestorage.app` bucket string everywhere. ([Sept-2024 FAQ](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024))

> Note: Firestore and Auth still have a Spark free tier; only **Storage** forces Blaze. But since SameDayDesk needs Storage, the whole project is on Blaze — budget alerts become mandatory hygiene.

---

## 6. Named vs default Firestore database — tradeoffs

- **`(default)`** — the single database created first. **Only DB eligible for free-tier quota.** Legacy App Engine runtime support is limited to it. Use it for SameDayDesk.
- **Named databases** (multiple per project, **GA**) — good for isolating prod/staging or multi-tenant data, with **per-database billing breakdowns**. Caveat: named DBs get **no free quota** — every read/write is billed.
- Recommendation for SameDayDesk: **use `(default)`**. A single small app does not need named DBs; the free quota and simpler config win. If you later want a hard prod/staging split, prefer **two separate Firebase projects** (`samedaydesk-prod`, `samedaydesk-staging`) over named DBs — cleaner key isolation and each gets its own free tier.

To target a specific named DB in code you'd pass the id: `getFirestore(app, "my-db")` (client) / `getFirestore(app, "my-db")` (admin). For `(default)` just call `getFirestore(app)`. Sources: [multiple-databases GA](https://cloud.google.com/blog/products/databases/firestore-multiple-databases-is-now-generally-available), [manage databases](https://firebase.google.com/docs/firestore/manage-databases).

---

## 7. Emulator Suite — local testing of Auth + Firestore + Rules

Install + init once: `firebase init emulators` (or hand-write `firebase.json`). Use Java 11+ (the Firestore/Storage emulators need a JDK).

`firebase.json`:

```json
{
  "firestore": { "rules": "firestore.rules" },
  "storage":   { "rules": "storage.rules" },
  "emulators": {
    "auth":      { "port": 9099 },
    "firestore": { "port": 8080 },
    "storage":   { "port": 9199 },
    "ui":        { "enabled": true, "port": 4000 },
    "singleProjectMode": true
  }
}
```

Run, with data persistence across restarts:

```bash
firebase emulators:start \
  --import=./.emulator-data \
  --export-on-exit=./.emulator-data
# UI at http://127.0.0.1:4000  (Firestore "Requests" tab shows live Rules evaluation traces)
```

**Default ports:** Auth `9099`, Firestore `8080`, Storage `9199`, UI `4000`.

**Connect the client** — see the `connectAuthEmulator` / `connectFirestoreEmulator` / `connectStorageEmulator` calls in §3 (guarded by `VITE_USE_EMULATORS`).

**Connect the Admin SDK** — set env vars **before** init; the Admin SDK auto-detects them and uses fake creds (no real service account needed against emulators):

```bash
export FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
export FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
export FIREBASE_STORAGE_EMULATOR_HOST="127.0.0.1:9199"
```

**Testing security rules** — use `@firebase/rules-unit-testing` to assert default-deny and owner-only access in Vitest/Jest:

```ts
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

const env = await initializeTestEnvironment({
  projectId: "samedaydesk-test",
  firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
});

const alice = env.authenticatedContext("alice").firestore();
const bob   = env.authenticatedContext("bob").firestore();
const anon  = env.unauthenticatedContext().firestore();

await assertSucceeds(setDoc(doc(alice, "users/alice"), { name: "Alice" })); // owner writes own
await assertFails(getDoc(doc(bob, "users/alice")));                          // not owner -> deny
await assertFails(getDoc(doc(anon, "users/alice")));                         // anon -> deny
```

Sources: [install/configure emulators](https://firebase.google.com/docs/emulator-suite/install_and_configure), [connect Auth](https://firebase.google.com/docs/emulator-suite/connect_auth), [connect Firestore](https://firebase.google.com/docs/emulator-suite/connect_firestore).

> CI tip: emulators are perfect for GitHub Actions — `firebase emulators:exec "npm test"` spins them up, runs the suite, tears down. No cloud project or billing touched.

---

## 8. Default-deny security rules patterns

Firestore rules are **default-deny**: anything not explicitly `allow`ed is denied. Never ship `allow read, write: if true;`. Validate every operation against `request.auth`.

`firestore.rules`:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Reusable helpers
    function isSignedIn() { return request.auth != null; }
    function isOwner(uid) { return isSignedIn() && request.auth.uid == uid; }

    // Each user can read/write only their own profile doc.
    match /users/{uid} {
      allow read: if isOwner(uid);
      allow create: if isOwner(uid)
                    && request.resource.data.email == request.auth.token.email;
      allow update: if isOwner(uid)
                    // never let the client change server-owned fields:
                    && !request.resource.data.diff(resource.data)
                          .affectedKeys().hasAny(['paidTier', 'stripeCustomerId', 'role']);
      allow delete: if false; // deletions only via Admin SDK on the server
    }

    // Orders: client can read its own; ALL writes happen server-side (Admin SDK
    // bypasses rules). Server-authoritative Stripe pricing => clients never write orders.
    match /orders/{orderId} {
      allow read: if isSignedIn() && resource.data.uid == request.auth.uid;
      allow write: if false;
    }

    // Explicit catch-all deny (documents the intent; default is already deny).
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

`storage.rules` (default-deny, per-user folder, size/type validation):

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /uploads/{uid}/{fileName} {
      allow read:  if request.auth != null && request.auth.uid == uid;
      allow write: if request.auth != null && request.auth.uid == uid
                   && request.resource.size < 10 * 1024 * 1024          // <10 MB
                   && request.resource.contentType.matches('application/pdf|image/.*');
    }
    match /{allPaths=**} { allow read, write: if false; }  // deny everything else
  }
}
```

Patterns to follow:
- **Owner check:** `request.auth != null && request.auth.uid == <ownerField>`.
- **Server-owned fields** (`paidTier`, `stripeCustomerId`, `role`): block client mutation with `diff().affectedKeys()`. Set them only via Admin SDK (which **bypasses rules entirely**).
- **Query alignment:** if a rule would deny *any* document a query could return, the **whole query fails**. Constrain queries to docs the user can read (e.g. `where('uid','==',currentUid)`).
- **Email verification:** `request.auth.token.email_verified` is only meaningful after the user verifies; don't gate purchases on it unless you enforce verification.

Sources: [rules-conditions](https://firebase.google.com/docs/firestore/security/rules-conditions), [insecure-rules](https://firebase.google.com/docs/firestore/security/insecure-rules), [rules-query](https://firebase.google.com/docs/firestore/security/rules-query), [storage rules-conditions](https://firebase.google.com/docs/storage/security/rules-conditions).

---

## 9. Deploying rules — CLI vs REST

**Recommended: Firebase CLI, in CI, rules committed to the repo.**

```bash
# firebase.json points at firestore.rules + storage.rules
firebase deploy --only firestore:rules,storage --project samedaydesk

# or scope further:
firebase deploy --only firestore:rules
```

- Keep `firestore.rules` and `storage.rules` under version control; deploy them as part of the GitHub auto-deploy pipeline so rules and app code ship together.
- Auth for CI: `firebase deploy --token "$FIREBASE_TOKEN"` (legacy CI token) or a **service-account + `GOOGLE_APPLICATION_CREDENTIALS`** (preferred going forward).

**REST management API** — only if you need programmatic ruleset management outside the CLI. Two steps: (1) create an immutable **ruleset** from source, (2) create a **release** pointing a service (e.g. `cloud.firestore`) at that ruleset. Same backend the CLI/console use. For SameDayDesk the CLI is simpler and sufficient — REST is overkill. Sources: [manage-deploy](https://firebase.google.com/docs/rules/manage-deploy).

---

## 10. Integration summary for SameDayDesk's actual stack

Single Node process: **Express `/api/*` + built Vite SPA.** This architecture is current and fine.

1. **Client** (Vite SPA): `firebase@^12` modular init (§3). User signs in (Email/Password or Google). On each `/api/*` call attach `Authorization: Bearer <getIdToken()>`.
2. **Server** (Express): `firebase-admin@^13` init with `cert()` + the `private_key` newline fix (§4.1). `requireAuth` middleware verifies the bearer token, attaches `req.uid`. All Stripe pricing/entitlement logic is server-authoritative keyed off the verified `uid`. Order/entitlement writes happen via Admin SDK (bypasses rules).
3. **Firestore**: `(default)` DB, production mode, region chosen once (`nam5` or a US single-region). Default-deny rules (§8); clients read their own data, never write `orders`/server-owned fields.
4. **Storage**: project on **Blaze**, bucket `samedaydesk.firebasestorage.app`, default-deny rules with per-user folders + size/type caps.
5. **Local dev**: Emulator Suite (Auth + Firestore + Storage), `--import/--export-on-exit` for persistence, rules unit tests in CI via `firebase emulators:exec`.
6. **Deploy**: rules via `firebase deploy --only firestore:rules,storage` in the GitHub pipeline. Service-account creds + Firebase web config injected as Hostinger env vars (never committed).

---

## 11. Explicit "outdated in a 2023 playbook" flags

1. **Storage is free on Spark** → FALSE now. Storage requires **Blaze**; Spark lost access Feb 3 2026. Add billing + budget alerts.
2. **Bucket is `PROJECT_ID.appspot.com`** → new default is **`PROJECT_ID.firebasestorage.app`**. Update config and re-download config files if the SDK reports the old bucket.
3. **`localhost` is auto-authorized for Auth** → not for projects created after Apr 28 2025; add it manually.
4. **`firebase@9/10`** → use **`firebase@12`**. **`firebase-admin@11` namespaced require** → use **`firebase-admin@13`** modular subpath imports; `initializeApp()` is now idempotent.
5. **Node 14/16** → Web SDK v11+ tooling wants **Node 20**; Admin v13 needs **Node 18+**. Use Node 20 LTS.
6. **"Start Firestore in test mode"** → start in **production mode** (default-deny) and write explicit rules.
7. **Edge middleware can verify tokens** (if the playbook assumed Next.js Edge) → `firebase-admin` cannot run on Edge; verify in a **Node-runtime** Route Handler.

---

### Sources
- Firebase JS SDK release notes — https://firebase.google.com/support/release-notes/js
- Firebase Admin Node release notes — https://firebase.google.com/support/release-notes/admin/node
- Admin SDK setup — https://firebase.google.com/docs/admin/setup
- Verify ID tokens — https://firebase.google.com/docs/auth/admin/verify-id-tokens
- Storage Sept-2024 billing/bucket FAQ — https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024
- Google sign-in / authorized domains (2025 localhost change) — https://firebase.google.com/docs/auth/web/google-signin
- Firestore get-started / security — https://firebase.google.com/docs/firestore/security/get-started
- Rules conditions — https://firebase.google.com/docs/firestore/security/rules-conditions
- Insecure rules — https://firebase.google.com/docs/firestore/security/insecure-rules
- Secure queries — https://firebase.google.com/docs/firestore/security/rules-query
- Storage rules conditions — https://firebase.google.com/docs/storage/security/rules-conditions
- Manage & deploy rules — https://firebase.google.com/docs/rules/manage-deploy
- Manage databases (default vs named) — https://firebase.google.com/docs/firestore/manage-databases
- Multiple databases GA — https://cloud.google.com/blog/products/databases/firestore-multiple-databases-is-now-generally-available
- Emulator Suite install/configure — https://firebase.google.com/docs/emulator-suite/install_and_configure
- Connect Auth emulator — https://firebase.google.com/docs/emulator-suite/connect_auth
- Connect Firestore emulator — https://firebase.google.com/docs/emulator-suite/connect_firestore
- private_key PEM gotcha — https://www.benmvp.com/blog/initializing-firebase-admin-node-sdk-env-vars/ ; https://github.com/gladly-team/next-firebase-auth/discussions/95
- Next.js + Firebase JWT (Jan 2026) — https://medium.com/@jonathan-trujillo.dev/how-to-implement-jwt-authentication-with-firebase-in-next-js-express-js-112377ad1714
