# Firebase Auth + Firestore/Storage — general setup & know-how

Reusable pattern for adding accounts + a database to a website. Distilled from a
production build (Express API + SPA, deployed on Hostinger). Specifics (collection
names, fields, providers) vary per project — the **structure and rules of thumb**
below are what carry over.

---

## Mental model (read first)

- **Two SDKs, two jobs.**
  - **Client SDK** (`firebase/*` in the browser): sign-in UI, holds the session,
    mints a short-lived **ID token**, does *owner-scoped* reads.
  - **Admin SDK** (`firebase-admin` on the server): **verifies** ID tokens and
    performs every **privileged write**. The server is the only thing trusted.
- **Auth = a Bearer ID token.** The browser sends `Authorization: Bearer <idToken>`
  on every API call; the server calls `verifyIdToken()` and derives
  `uid / email / emailVerified` from it. Never trust a uid/email sent in the body.
- **Default-deny database.** Firestore rules deny everything, then allow narrow
  owner-scoped reads. **All sensitive writes go through the server** (Admin SDK
  bypasses rules). Server-managed fields (billing, status, roles) are *denied to
  clients* so a tampered client can't self-promote.
- **Public vs secret config.** The web config (`apiKey`, etc.) is **not a secret**
  — it's baked into the SPA at build. The **service account JSON** is a root
  credential — server env only, never in the bundle or git.

---

## Environment variables

| Var | Side | Notes |
|---|---|---|
| `FIREBASE_API_KEY` … `FIREBASE_APP_ID` | client (build) | The 6 web-config values. Exposed via the bundler as `VITE_FIREBASE_*` (Vite) / `NEXT_PUBLIC_*` (Next). Public. |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | server | The **entire** service-account JSON on one line. Secret. |
| `FIREBASE_PROJECT_ID` | both | |
| `FIREBASE_STORAGE_BUCKET` | both | `<project-id>.appspot.com` |
| `FIREBASE_FIRESTORE_DATABASE_ID` | server | `(default)` unless you use a **named** database (see note). |

> **Named databases:** Firebase makes `(default)`; you can also create extra
> databases (e.g. `app-prod`). The client Web SDK selects it via
> `getFirestore(app, "<id>")`; the Admin SDK via `getFirestore(app, "<id>")`.
> Keep one source of truth for the id. New projects: just use `(default)`.

---

## Console setup (once per project)

1. **Create project** at console.firebase.google.com (Analytics optional/off).
2. **Authentication → Get started** → enable providers (**Email/Password**,
   **Google**, etc.). Under **Settings → Authorized domains** add your prod
   domain + `localhost`.
3. **Firestore → Create database** in **Production mode**, US region (`nam5`
   multi-region is a safe default). Note the database id.
4. **Storage → Get started** in Production mode. Note the bucket
   `<project-id>.appspot.com`.
5. **Project settings → General → Add app → Web (`</>`)** → copy `firebaseConfig`
   into the 6 client env vars. (Don't enable Firebase Hosting — we host elsewhere.)
6. **Project settings → Service accounts → Generate new private key** → paste the
   whole JSON into `FIREBASE_SERVICE_ACCOUNT_KEY` (server env). Keep it out of git.
7. **Deploy rules** (see below) and confirm in console → Rules.

---

## Client init (browser)

```ts
// lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
const app = initializeApp(cfg);
const dbId = import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || "(default)";

export const auth = getAuth(app);
export const db = dbId === "(default)" ? getFirestore(app) : getFirestore(app, dbId);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
```

## Server init (Admin SDK)

```ts
// lib/firebase-admin.ts
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

// The service account arrives as a JSON string in an env var. Across shells and
// panels it can get double-encoded or have its private_key newlines escaped, so
// parse defensively, then normalise the private key's "\n" back to real newlines.
function parseServiceAccount(raw: string): admin.ServiceAccount {
  let obj = JSON.parse(raw.trim());
  if (typeof obj === "string") obj = JSON.parse(obj); // double-encoded
  if (typeof obj.private_key === "string") {
    obj.private_key = obj.private_key.replace(/\\n/g, "\n");
  }
  return obj;
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

const dbId = process.env.FIREBASE_FIRESTORE_DATABASE_ID || "(default)";
export const firestore = dbId === "(default)" ? getFirestore(admin.app()) : getFirestore(admin.app(), dbId);
export const firebaseAuth = admin.auth();
export default admin;
```

> **Gotcha:** the `private_key` escaping is the #1 cause of "Failed to initialize
> Admin SDK." If pasting JSON into a hosting panel mangles it, base64-encode the
> JSON into the env var and `JSON.parse(Buffer.from(v,"base64").toString())`.

## Auth middleware (server)

```ts
// middleware/auth.ts
import { firebaseAuth } from "../lib/firebase-admin";

export async function requireAuth(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return res.status(401).json({ error: "Missing token" });
  try {
    const d = await firebaseAuth.verifyIdToken(h.slice(7));
    req.uid = d.uid; req.userEmail = d.email; req.emailVerified = d.email_verified === true;
    next();
  } catch { res.status(401).json({ error: "Invalid or expired token" }); }
}

// Gate sensitive ops on a confirmed email — the server half of the email gate.
export function requireVerifiedEmail(req, res, next) {
  if (!req.uid) return res.status(401).json({ error: "Not authenticated" });
  if (req.emailVerified) return next();
  res.status(403).json({ error: "Email not verified", code: "email_not_verified" });
}

// Admin gate via env-pinned uid/email (don't store role flags client-writable).
export function requireAdmin(req, res, next) {
  if (req.uid && (req.uid === process.env.ADMIN_UID || req.userEmail === process.env.ADMIN_EMAIL)) return next();
  res.status(403).json({ error: "Admin access required" });
}
```

## Client → server call pattern

```ts
import { auth } from "@/lib/firebase";
async function api(path: string, init: RequestInit = {}) {
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : null;       // fresh, auto-refreshed
  return fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }), ...init.headers },
  });
}
```

Auth flow: `createUserWithEmailAndPassword` / `signInWithPopup(googleProvider)` →
(create the user's own `users/{uid}` doc, see rules) → run the email-verification
step (see Resend doc) → after the server marks the email verified, refresh the
token with `await user.reload(); await user.getIdToken(true);` so `email_verified`
propagates into the next API call.

---

## Firestore data-model & rules pattern

Principles that generalise to any app:

- **Owner-scoped reads:** a user can read only docs keyed by / tagged with their
  uid. List queries must filter on `where("uid","==",uid)` so rules can validate.
- **Server-only writes for anything that grants value or status.** Deny client
  writes; create/update via Admin SDK after server-side checks.
- **Client may create its *own* baseline doc** but only in a safe initial state,
  and **must not include server-managed fields.**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // The user's own profile. Client may create it as "unpaid" and WITHOUT any
    // server-managed billing fields; all updates/deletes are server-only.
    match /users/{userId} {
      allow read:   if request.auth != null && request.auth.uid == userId;
      allow create: if request.auth != null && request.auth.uid == userId
                    && request.resource.data.paymentStatus == "unpaid"
                    && !request.resource.data.keys().hasAny(["amountPaid","paidAt","role"]);
      allow update, delete: if false;             // Admin SDK only
    }

    // User-supplied working data (form drafts, etc.) — owner read/write. It must
    // never grant authorization on its own; the server re-validates on use.
    match /drafts/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Records of value (orders, invoices). Owner-read; writes server-only.
    match /orders/{orderId} {
      allow read:  if request.auth != null && resource.data.uid == request.auth.uid;
      allow write: if false;
    }

    // Secrets the server manages (e.g. hashed verification codes). Never client-
    // accessible — covered by default-deny but stated for clarity.
    match /emailVerifications/{userId} { allow read, write: if false; }

    match /{document=**} { allow read, write: if false; }   // default deny
  }
}
```

Storage rules — owner-scoped upload prefix:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /uploads/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /{allPaths=**} { allow read, write: if false; }
  }
}
```

**Deploying rules:** keep `firestore.rules` / `storage.rules` in the repo and push
them with the Firebase CLI (`firebase deploy --only firestore:rules,storage`) or
the Rules REST API using the service-account key. Rules in the repo = reviewable +
reproducible.

---

## Checklist / gotchas

- [ ] Web config in client env (public); service-account JSON in server env (secret, gitignored).
- [ ] Authorized domains include prod + localhost, or sign-in popups fail.
- [ ] Verify ID tokens on **every** protected route; never trust body uid/email.
- [ ] Rules default-deny; server-managed fields denied to clients; list queries filter by uid.
- [ ] After email verification (or any custom-claim change) refresh the client token (`getIdToken(true)`).
- [ ] `private_key` newline escaping is the classic Admin-init failure — parse defensively or base64 the env.
- [ ] Decide `(default)` vs named DB up front and keep client + server in sync.

See also: `RESEND-EMAIL-SIGNUP-VERIFICATION.md` (email gate), `STRIPE-PAYMENTS-AND-ELEMENTS.md` (payments), `DEPLOY-HOSTINGER.md` (hosting).
