# 10 — Supabase Storage + Auth: Per-User Résumé Intake & the Firebase→Supabase Migration

> **Scope:** Current (June 2026) Supabase best practices for **per-user file uploads** (résumé/intake) in a **Vite React SPA** where **Auth is now also Supabase**, plus a reconciliation of the **Firebase→Supabase migration** for the SameDayDesk build. This report supersedes the upload/auth assumptions baked into `PLAN.md` §0/§5 and `research/00-SYNTHESIS.md` §4 (which still pin Firebase Auth + service-role-only Supabase Storage).
> **Date of research:** June 2026. Versions current as of then.
> **Stack recap (from synthesis):** single Node process — Express serving `/api/*` + a built Vite SPA — on Hostinger. Express holds the **service / service-role key** + Stripe + Resend. Supabase provides **Auth + Postgres + Storage**.

---

## 0. TL;DR — the decision and what changed

1. **Auth moved to Supabase → use CLIENT-DIRECT uploads with Storage RLS.** Now that the user has a real Supabase session in the browser, the idiomatic, simplest, and recommended path is `supabase.storage.from('intake-uploads').upload(...)` straight from the SPA, gated by **Storage RLS** scoped to `uploads/{auth.uid()}/…`. This is the recommended approach for this app. The server-mediated **signed-upload-URL** path (the original plan, written when there was "no Supabase Auth") becomes the **fallback/escape hatch** for when you need server-side gating (e.g. block uploads until payment) — keep it documented, don't make it the default.
2. **`intake-uploads` is PRIVATE** (the Supabase default). All read/write goes through RLS; the operator fetches files later via a **time-limited `createSignedUrl`**.
3. **Bucket-level guards:** `fileSizeLimit: '10MB'` and `allowedMimeTypes` (PDF, common images, DOCX) set at bucket creation. Free plan caps any file at **50 MB global**, so 10 MB is well within range.
4. **`@supabase/supabase-js@^2`** — latest **`2.108.2`** (mid-June 2026). One client for Auth + Postgres + Storage. ([npm](https://www.npmjs.com/package/@supabase/supabase-js))
5. **Two big "current in 2026" facts that change the env/verify story:**
   - **Server JWT verification:** use `supabase.auth.getClaims(jwt)` (local verify via JWKS / asymmetric signing keys) instead of `getUser()` for the hot path. ([getClaims](https://supabase.com/docs/reference/javascript/auth-getclaims), [signing-keys](https://supabase.com/docs/guides/auth/signing-keys))
   - **API keys are being renamed:** legacy `anon` / `service_role` JWTs → new **`sb_publishable_…`** (client) / **`sb_secret_…`** (server) keys; **legacy keys deprecated end of 2026**. The task's env names (`VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) still work today; this report flags the forward-compatible naming. ([api-keys](https://supabase.com/docs/guides/api/api-keys))
6. **Migration verdict:** every principle in the internal Firebase playbook **maps cleanly** onto Supabase (server verifies token → server-authoritative Stripe pricing → default-deny → idempotent fulfillment). The **Stripe, Resend, and Hostinger** research reports (04, 05, 06, 07) remain **valid unchanged** — they never depended on the identity provider.

---

## 1. Versions to pin (June 2026)

| Package | Pin | Notes |
|---|---|---|
| `@supabase/supabase-js` | `^2` (latest `2.108.2`) | Single client: Auth + Postgres + Storage + Functions. v1 is EOL for features. ([npm](https://www.npmjs.com/package/@supabase/supabase-js)) |
| `@supabase/storage-js` | transitive (bundled in `supabase-js`) | Don't install separately; use the one inside `supabase-js`. |
| `tus-js-client` | `^4` (only if you add resumable) | Needed for resumable/TUS uploads >6 MB. Not needed for 10 MB résumés. |
| Runtime | Node **22.x** | Unchanged from the locked stack. |

> Install: `npm i @supabase/supabase-js`. Same package on both client and server; you instantiate it with different keys.

---

## 2. Creating the PRIVATE `intake-uploads` bucket (size + MIME limits)

Buckets are **private by default** — for a private bucket every operation (including download) is subject to RLS. ([buckets fundamentals](https://supabase.com/docs/guides/storage/buckets/fundamentals))

### 2.1 Dashboard (one-time, recommended for setup)

Storage → **New bucket** → name `intake-uploads` → leave **Public** OFF → expand **Additional configuration**:
- **Restrict file size:** `10 MB`
- **Allowed MIME types:** add each of:
  `application/pdf`, `image/png`, `image/jpeg`, `image/webp`, `image/heic`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (`.docx`), and optionally `application/msword` (legacy `.doc`).
→ **Create bucket**. ([creating-buckets](https://supabase.com/docs/guides/storage/buckets/creating-buckets))

### 2.2 SQL (reproducible — commit this as a migration)

The Dashboard insert is just `storage.buckets`. For full control of `file_size_limit` (bytes) and `allowed_mime_types` (text[]):

```sql
-- Create the private intake bucket with a 10 MB cap and an explicit MIME allowlist.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'intake-uploads',
  'intake-uploads',
  false,                              -- PRIVATE: all access via RLS
  10485760,                           -- 10 * 1024 * 1024 bytes = 10 MB
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/heic',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  -- .docx
    'application/msword'                                                         -- .doc (optional)
  ]
)
on conflict (id) do update
  set file_size_limit  = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public            = excluded.public;
```

- `file_size_limit` is **bytes** in SQL (the JS API takes a string like `'10MB'`). Default `null` = no per-bucket limit. ([file-limits](https://supabase.com/docs/guides/storage/uploads/file-limits))
- `allowed_mime_types` is a `text[]`; entries may be exact (`application/pdf`) or wildcard (`image/*`). Default `null` = all types allowed. An upload that violates either restriction is **rejected server-side**. ([creating-buckets](https://supabase.com/docs/guides/storage/buckets/creating-buckets))
- **Global cap precedence:** the project-wide global file-size limit takes precedence; on **Free** it can't exceed **50 MB**, Pro+ up to 500 GB. A per-bucket limit can only be ≤ the global limit. 10 MB is fine on Free. ([file-limits](https://supabase.com/docs/guides/storage/uploads/file-limits))

### 2.3 Client/CLI (`createBucket`) — equivalent, if you script setup with the service key

```js
// Run once, server-side, with the SECRET / service-role key.
const { data, error } = await supabaseAdmin.storage.createBucket('intake-uploads', {
  public: false,
  fileSizeLimit: '10MB',
  allowedMimeTypes: [
    'application/pdf',
    'image/png', 'image/jpeg', 'image/webp', 'image/heic',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
  ],
})
```

`fileSizeLimit` accepts a string (`'10MB'`, `'1MB'`) or bytes; `allowedMimeTypes` is an array. ([creating-buckets](https://supabase.com/docs/guides/storage/buckets/creating-buckets))

> **Gotcha — MIME enforcement is by declared content type.** The bucket checks the `Content-Type` of the upload, not file magic bytes. A renamed file can present a permitted MIME. For an intake form this is acceptable (operator reviews files), but never treat a passed MIME check as proof of safe content.
> **Gotcha — `.docx` MIME is long.** `application/vnd.openxmlformats-officedocument.wordprocessingml.document`. If a browser sends an empty/`application/octet-stream` type for a `.docx`, set `contentType` explicitly on upload (see §4) or the bucket allowlist will reject it.

---

## 3. Storage RLS — scope everything to `uploads/{auth.uid()}/…`

`storage.objects` is a regular Postgres table; access is governed by RLS policies. **By default Storage allows no uploads** until you add policies; the **secret/service-role** key bypasses RLS entirely. ([access-control](https://supabase.com/docs/guides/storage/security/access-control))

**Path convention:** `uploads/<auth.uid()>/<orderId-or-uuid>-<filename>`. The owner UUID is the **first** path segment. The helper `storage.foldername(name)` returns the array of parent folders, so `(storage.foldername(name))[1]` is that first segment. ([helper-functions](https://supabase.com/docs/guides/storage/schema/helper-functions))

### 3.1 The four policies (INSERT / SELECT / UPDATE / DELETE)

```sql
-- RLS is already enabled on storage.objects in every Supabase project.
-- Policies below scope each authenticated user to their OWN folder in intake-uploads.

-- INSERT: a user may only write into uploads/<their uid>/...
create policy "intake: users upload to own folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'intake-uploads'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- SELECT: a user may only read their own files
create policy "intake: users read own files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'intake-uploads'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- UPDATE: required for upsert / moving / metadata changes on own files
create policy "intake: users update own files"
on storage.objects for update
to authenticated
using (
  bucket_id = 'intake-uploads'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'intake-uploads'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- DELETE: a user may remove their own files (e.g. replace a wrong upload)
create policy "intake: users delete own files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'intake-uploads'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
```

### 3.2 Why each clause matters

- **`to authenticated`** — restricts the policy to logged-in users (the `authenticated` Postgres role). Anonymous (`anon`) requests match no policy → denied. ([access-control](https://supabase.com/docs/guides/storage/security/access-control))
- **`bucket_id = 'intake-uploads'`** — without this, the policy would leak across buckets.
- **`(storage.foldername(name))[1] = (select auth.uid())::text`** — the heart of per-user isolation. `auth.uid()` returns the user's UUID; cast to `text` to compare against the path segment. Equivalent forms you'll see in the docs: `(select auth.jwt() ->> 'sub')` (the JWT subject *is* the uid) and `owner_id = (select auth.uid())::text`. The `foldername` form is preferred because it enforces the path layout, not just object ownership. ([access-control](https://supabase.com/docs/guides/storage/security/access-control), [helper-functions](https://supabase.com/docs/guides/storage/schema/helper-functions))
- **Wrap `auth.uid()` in `(select …)`** — the **single most important performance habit**. A bare `auth.uid()` in `USING/WITH CHECK` is re-evaluated **once per row**; `(select auth.uid())` lets Postgres hoist it into an InitPlan run **once per query** — the difference between a 5 ms and a 5 s policy on large tables. Supabase's `auth_rls_initplan` linter flags the bare form. ([RLS performance](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv), [init-plan writeup](https://dev.to/arvavit/76-rls-policies-rewritten-in-one-migration-the-authuid-init-plan-trap-in-supabase-4hg))
- **UPDATE needs both `USING` and `WITH CHECK`**, and **upsert requires INSERT + SELECT + UPDATE** — if you ever upload with `upsert: true`, all three policies must be present or the operation fails. ([access-control](https://supabase.com/docs/guides/storage/security/access-control))

> **Default-deny is automatic.** Anything not matched by a policy is denied — this is the Supabase analog of Firebase's default-deny rules. Don't add a permissive catch-all.

---

## 4. The two upload approaches

### 4.1 (a) CLIENT-DIRECT upload — **RECOMMENDED for this app**

The user is authenticated with Supabase, so the browser client already carries the session JWT; Storage RLS does the authorization. No server round-trip for the bytes.

**Client init (`src/lib/supabase.ts`)** — public anon/publishable key, baked at build:

```ts
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,   // public; RLS enforces security, not key secrecy
  {
    auth: {
      persistSession: true,        // default; stores session in localStorage
      autoRefreshToken: true,      // default; refreshes the JWT before expiry
      detectSessionInUrl: true,    // default; handles OAuth/magic-link redirects
    },
  }
)
```
The anon/publishable key is **safe to ship in client code** — RLS, not key secrecy, is the security boundary. ([api-keys](https://supabase.com/docs/guides/api/api-keys), [React quickstart](https://supabase.com/docs/guides/auth/quickstarts/react))

**The upload** — path must start with the user's uid to satisfy RLS:

```ts
import { supabase } from '@/lib/supabase'

export async function uploadIntakeFile(file: File, orderId: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('not_authenticated')

  // RLS requires uploads/<uid>/... — uid is the first folder segment.
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `uploads/${user.id}/${orderId}/${crypto.randomUUID()}-${safeName}`

  const { data, error } = await supabase
    .storage
    .from('intake-uploads')
    .upload(path, file, {
      contentType: file.type || 'application/octet-stream', // ensure .docx MIME is sent
      cacheControl: '3600',
      upsert: false,                                        // don't silently overwrite
    })

  if (error) throw error
  return data.path   // e.g. "uploads/<uid>/<orderId>/<uuid>-resume.pdf" — STORE THIS
}
```

- `upload(path, file, options)` returns `{ data: { id, path, fullPath }, error }`. **Persist `data.path`** on the order/draft row (§5). ([storage uploads](https://supabase.com/docs/guides/storage))
- `contentType` defaults to the file's type; set it explicitly so the bucket's `.docx` allowlist isn't tripped by an empty type. `cacheControl` is seconds-as-string (`'3600'`). `upsert` defaults `false`. ([uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads))
- **Standard `upload()` is for files up to ~6 MB**; beyond that use resumable (§4.4). 10 MB résumés are at the edge — see §4.4 for the threshold. ([resumable-uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads))

**Why client-direct here:** simplest code, one fewer hop, no service-role key in the byte path, and RLS already encodes exactly the "own folder" rule we want. This is Supabase's recommended pattern once Auth is Supabase. ([access-control](https://supabase.com/docs/guides/storage/security/access-control))

### 4.2 (b) SERVER-MEDIATED signed upload URL — the controlled fallback

Use this when the **server must gate the upload** — e.g. only allow an upload after payment, or stamp a server-chosen path, or enforce a per-user quota the client can't see. The server (service-role key, **bypasses RLS**) mints a one-time token; the client uploads with it. No service-role key ever reaches the browser.

**Server (Express, `server/routes/uploads.js`):**

```js
import { createClient } from '@supabase/supabase-js'
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,           // SECRET — server only
  { auth: { persistSession: false, autoRefreshToken: false } }
)

// requireAuth has already verified the Supabase JWT and set req.uid (see §6.1)
app.post('/api/uploads/sign', requireAuth, async (req, res) => {
  const { orderId, filename } = req.body
  // Server CHOOSES the path -> still scoped to the verified user's folder.
  const safe = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `uploads/${req.uid}/${orderId}/${crypto.randomUUID()}-${safe}`

  const { data, error } = await supabaseAdmin
    .storage
    .from(process.env.SUPABASE_BUCKET)             // intake-uploads
    .createSignedUploadUrl(path)                   // optional: { upsert: true }

  if (error) return res.status(500).json({ error: 'sign_failed' })
  // data = { signedUrl, token, path }
  res.json({ token: data.token, path: data.path })
})
```

**Client — upload with the token (no Supabase session needed for the upload itself):**

```ts
const { token, path } = await fetch('/api/uploads/sign', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
  body: JSON.stringify({ orderId, filename: file.name }),
}).then(r => r.json())

const { data, error } = await supabase
  .storage
  .from('intake-uploads')
  .uploadToSignedUrl(path, token, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
if (error) throw error
// data.path -> store on the order row
```

- `createSignedUploadUrl(path)` returns `{ signedUrl, token, path }`; the token is **valid ~2 hours** and is **single-use** for that path. `uploadToSignedUrl(path, token, file)` consumes it. ([Storage v3 blog](https://supabase.com/blog/storage-v3-resumable-uploads), [discussion #10289](https://github.com/orgs/supabase/discussions/10289))
- Because the **service-role key bypasses RLS**, the *server* is the gatekeeper — it decides the path, so you must still pin it to `uploads/${req.uid}/…`. The RLS policies in §3 don't protect this path (service role ignores them); the protection is your Express code. ([access-control](https://supabase.com/docs/guides/storage/security/access-control))
- Concurrency note: two clients uploading the same path → `409 Conflict`; `x-upsert` header decides the winner. ([resumable-uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads))

### 4.3 Recommendation for SameDayDesk

**Default to (a) client-direct + RLS.** It is the simplest correct thing now that Auth is Supabase, keeps the service-role key off the byte path, and the RLS in §3 *is* the authorization spec. Reserve **(b) server-mediated** for the one case that actually needs server control: if you decide intake files may only be uploaded **after `paymentStatus:'paid'`**, mint the signed URL from a route that checks that flag (the client can't fake a token it never receives). Given the current flow (free teaser → signup → pay), uploads typically happen post-signup while authenticated, so **client-direct covers the common path**; keep the signed-URL route as a thin, documented fallback. This matches the synthesis's "trust nothing from the client for money or authorization" — RLS enforces folder ownership; the server still owns money decisions.

### 4.4 Resumable / multipart for larger files

- **Threshold:** standard `upload()` is best for files **≤ 6 MB**; for files that **may exceed 6 MB**, use **resumable (TUS)**. A 10 MB-capped bucket means some files will cross 6 MB, so for robustness on flaky networks consider resumable for anything over ~6 MB; for a small résumé intake, standard upload to the 10 MB cap is usually fine and far simpler. ([resumable-uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads))
- **TUS specifics:** use `tus-js-client` (or Uppy). **Chunk size must be exactly 6 MB — "do not change it"** (other sizes stall the upload — a known footgun). Point at the direct storage host `https://<projectRef>.storage.supabase.co/storage/v1/upload/resumable` for best throughput. Resumable URLs are valid up to 24 h. ([resumable-uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads), [CLI #2729](https://github.com/supabase/cli/issues/2729))
- Resumable also works with signed upload tokens (token in the `x-signature` header). ([Storage v3 blog](https://supabase.com/blog/storage-v3-resumable-uploads))

### 4.5 Time-limited download for the operator (`createSignedUrl`)

The bucket is private, so the operator can't hot-link. Generate a short-lived signed download URL **server-side** (service-role) and hand it to the operator/admin UI:

```js
// server: operator fetches a customer's intake file
const { data, error } = await supabaseAdmin
  .storage
  .from(process.env.SUPABASE_BUCKET)
  .createSignedUrl(objectPath, 60 * 10, {        // expiresIn = 600s (10 min)
    download: true,                               // force download (optional: download: 'resume.pdf')
  })
// data.signedUrl -> a temporary, expiring https URL
```

- `createSignedUrl(path, expiresIn, options?)` — `expiresIn` is **seconds**; `download: true` (or a filename string) forces a download with `Content-Disposition`. Use short TTLs (5–15 min) for an operator click-through; never email a long-lived one. ([createSignedUrl](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl))
- For multiple files at once, `createSignedUrls(paths, expiresIn)` (plural) returns an array.

---

## 5. Storing the object path on the `orders` / `drafts` row

The `upload()`/`uploadToSignedUrl()` result gives you `data.path` (the canonical object key, e.g. `uploads/<uid>/<orderId>/<uuid>-resume.pdf`). **Store the path, not a URL** — URLs expire; the path is stable and you re-sign on demand.

```sql
-- Postgres (Supabase) — add an intake file reference to orders.
alter table public.orders
  add column intake_path text,                      -- canonical storage object key
  add column intake_uploaded_at timestamptz;

-- Or a 1-to-many child table if an order can have several intake files:
create table public.order_files (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  user_id      uuid not null references auth.users(id),  -- = (storage.foldername(path))[1]
  storage_path text not null,                            -- store path, not URL
  mime_type    text,
  size_bytes   bigint,
  created_at   timestamptz not null default now()
);
alter table public.order_files enable row level security;
create policy "own order files" on public.order_files
  for select to authenticated
  using (user_id = (select auth.uid()));
```

- After a **client-direct** upload, write the row from the client only for non-authoritative metadata; better, **POST the returned `path` to `/api/orders/:id/attach`** so the server records it (server-authoritative row, consistent with the orders-are-server-written rule from the synthesis).
- If you keep `orders` writes server-only (recommended, mirrors the Firebase playbook's "orders write:false"), the attach endpoint verifies the JWT, confirms the path's first segment equals the caller's uid, then writes `intake_path`.
- Storing the path lets you regenerate `createSignedUrl` for the operator at any time without persisting a stale link.

---

## 6. Migration impact: Firebase → Supabase for THIS build

### 6.1 Principle mapping (the internal Firebase playbook → Supabase)

| Firebase playbook principle | Maps to Supabase as | Status |
|---|---|---|
| **Client gets ID token; server verifies it** (`adminAuth.verifyIdToken`) | Client gets a **Supabase session JWT** (`supabase.auth.getSession()`); server verifies via **`supabase.auth.getClaims(jwt)`** (local, JWKS/asymmetric) or `getUser(jwt)` (network). | **Maps 1:1**, mechanism changes |
| **Server-authoritative Stripe pricing** (derive price from verified uid; client sends slug only) | **Unchanged.** Verify Supabase JWT → derive `uid` → look up cents from the server offer map → stamp Stripe metadata. | **Identical** |
| **Default-deny** (Firestore/Storage rules deny unless explicitly allowed) | **Postgres RLS** is default-deny once enabled: no matching policy = denied. Storage RLS (§3) + table RLS replace Firestore/Storage rules. | **Maps 1:1**, different language (SQL not CEL-ish rules) |
| **Idempotent fulfillment** (deterministic order id + Firestore transaction; webhook + verify-on-return both hit it) | **Unchanged at the Stripe layer.** Persist into a Postgres `orders` row with a **unique key** (`unique (uid, offer)` or a `processed_events` table on `event.id`); use a transaction / `insert … on conflict do nothing`. | **Identical pattern**, Postgres uniqueness instead of doc-id |
| **Server-owned fields blocked from client mutation** (`diff().affectedKeys()` on `paidTier`, `role`) | **RLS `WITH CHECK`** + column privileges, or simply make those writes **service-role-only** (server). | **Maps**, cleaner in SQL |
| **Service account / Admin SDK bypasses rules** | **Service-role / `sb_secret_` key bypasses RLS.** Same trust model: only the server holds it. | **Identical** |

**What actually changes (the mechanics, not the principles):**
- **Token verification:** `firebase-admin verifyIdToken()` → `supabase.auth.getClaims(token)`. `getClaims` verifies **locally** against the project's JWKS (`/auth/v1/.well-known/jwks.json`, Edge-cached 10 min) when asymmetric signing keys are enabled — no per-request network call, the closest analog to Firebase's offline verification. Prefer it over `getUser()` (which always calls the Auth server). ([getClaims](https://supabase.com/docs/reference/javascript/auth-getclaims), [JWTs](https://supabase.com/docs/guides/auth/jwts), [signing-keys](https://supabase.com/docs/guides/auth/signing-keys))

  ```js
  // server/middleware/auth.js — Supabase replacement for the Firebase requireAuth
  import { createClient } from '@supabase/supabase-js'
  const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } })

  export async function requireAuth(req, res, next) {
    const m = (req.header('authorization') ?? '').match(/^Bearer (.+)$/)
    if (!m) return res.status(401).json({ error: 'missing_bearer_token' })
    const { data, error } = await supa.auth.getClaims(m[1])   // local JWKS verify
    if (error || !data?.claims?.sub) return res.status(401).json({ error: 'invalid_token' })
    req.uid = data.claims.sub          // the user UUID (== auth.uid())
    req.email = data.claims.email
    next()
  }
  ```

- **`uid` shape:** Firebase uid (28-char string) → Supabase uid (**UUID**). Anywhere the path/folder/`metadata.uid` was a Firebase uid, it's now a UUID. The RLS `(storage.foldername(name))[1] = (select auth.uid())::text` comparison already accounts for this.
- **Data layer:** Firestore docs/rules → Postgres tables/RLS. The `users/{uid}` and `orders/{orderId}` documents become rows in `public.users` (or just rely on `auth.users`) and `public.orders` with RLS.
- **Email verification (Phase 7):** Supabase Auth has **built-in email confirmation + OTP**, which can *replace* the custom hashed-6-digit-code flow — but the synthesis's custom Resend code flow still works if you prefer to own it. Decision deferred (see open questions).
- **No more Blaze/Firebase-Storage concerns:** the entire Firebase Storage section of report 03 (Blaze requirement, `firebasestorage.app` bucket naming, `private_key` PEM `\n` gotcha for the Storage admin) is **obsolete** for uploads — Supabase Storage on the free tier replaces it. (Whether Firebase Auth is dropped *entirely* is the migration's premise here; this report assumes **yes**, per "auth is ALSO Supabase.")

### 6.2 What stays valid, unchanged

- **Report 04 (Stripe)** — server-authoritative pricing, raw-body-before-`express.json()`, idempotent `fulfill()`, dashboard vs CLI `whsec_`, `apiVersion` pin: **all independent of the identity provider. Valid unchanged.** The only edit: fulfillment keys off the Supabase UUID and writes a Postgres `orders` row instead of a Firestore doc.
- **Report 05 (Resend)** — transactional email, idempotency keys, bounce/complaint webhook + suppression: **no Firebase dependency. Valid unchanged.** (Idempotency keys like `signup-welcome/${uid}` now use the UUID.)
- **Reports 06 + 07 (Hostinger deploy + Email/DNS)** — single Node process, `process.env.PORT` on `0.0.0.0`, Git auto-deploy, the full DNS table (Hostinger receive + Gmail send-as + Resend send): **entirely identity-agnostic. Valid unchanged.**
- **The three server-side gates** (`requireAuth` → `requireVerifiedEmail` → payment): same shape; `requireAuth` now verifies a Supabase JWT (above) and the `email_verified`/confirmation signal comes from Supabase claims (or the custom flow).

### 6.3 Exact env var delta

**DROP (remove everywhere — client build + Hostinger runtime):**
```
# client (were baked into the SPA)
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
# server
FIREBASE_SERVICE_ACCOUNT_KEY / FIREBASE_SERVICE_ACCOUNT_B64
FIREBASE_STORAGE_BUCKET
FIREBASE_FIRESTORE_DATABASE_ID
FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
```

**ADD:**
```
# CLIENT (PUBLIC — baked at build, VITE_*; safe to expose, RLS is the boundary)
VITE_SUPABASE_URL=https://<projectRef>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon JWT or sb_publishable_...>

# SERVER (RUNTIME SECRETS — never committed, never VITE_*)
SUPABASE_URL=https://<projectRef>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role JWT or sb_secret_...>
SUPABASE_BUCKET=intake-uploads
```

> **Forward-compat note (do this now if starting fresh):** Supabase is migrating from the legacy `anon` / `service_role` **JWT** keys to **`sb_publishable_…`** (client) and **`sb_secret_…`** (server) keys; **legacy keys are slated for deprecation by end of 2026.** The env *names* above (`VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are fine to keep, but **put the new key values in them** — `sb_publishable_…` is client-safe and respects RLS via the `anon`/`authenticated` roles; `sb_secret_…` is server-only and carries `BYPASSRLS`. ([api-keys](https://supabase.com/docs/guides/api/api-keys))

`SUPABASE_BUCKET=intake-uploads` was already present in `PLAN.md` §3 and synthesis §1.3 — keep it. The `STRIPE_*`, `RESEND_*`, `ADMIN_*`, `NODE_ENV`, `PUBLIC_URL` vars are **unchanged**.

---

## 7. Gotchas checklist (carry into the build)

1. **Path must start with the uid** or the INSERT RLS policy rejects the upload (`new row violates row-level security policy`). Build the path as `uploads/${user.id}/…`.
2. **`(select auth.uid())`, never bare `auth.uid()`** in policies — per-row re-eval is the classic Supabase perf trap; the `auth_rls_initplan` linter will flag it. ([RLS perf](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv))
3. **Upsert needs INSERT + SELECT + UPDATE policies** all present, or it fails. ([access-control](https://supabase.com/docs/guides/storage/security/access-control))
4. **Set `contentType` explicitly for `.docx`** so the bucket's MIME allowlist isn't tripped by an empty/`octet-stream` type.
5. **Service-role/`sb_secret_` bypasses RLS** — keep it server-only; in the signed-URL route, *you* must pin the path to the verified uid (RLS won't).
6. **Store the object `path`, not a signed URL** — signed URLs expire; re-sign on demand.
7. **`createSignedUrl` TTL in seconds; keep it short** (5–15 min) for operator downloads.
8. **Resumable chunk size must be exactly 6 MB** — other values stall TUS uploads. Only relevant if you adopt resumable for >6 MB files.
9. **Free-plan global file cap is 50 MB** — fine for a 10 MB bucket; don't set a per-bucket limit above the global.
10. **Prefer `getClaims()` over `getUser()`** server-side once asymmetric signing keys are enabled — local verify, no per-request Auth-server call.
11. **Bucket MIME check is by declared type, not magic bytes** — acceptable for human-reviewed intake; never treat it as malware scanning.

---

## 8. Concrete build order (slot into the phased plan)

1. **Bucket:** run the §2.2 SQL migration to create private `intake-uploads` (10 MB, MIME allowlist).
2. **RLS:** run the four §3.1 policies on `storage.objects`.
3. **Client:** add `src/lib/supabase.ts` (§4.1) + the `uploadIntakeFile` helper; wire to the intake form.
4. **Server:** replace Firebase `requireAuth` with the Supabase `getClaims` middleware (§6.1); add the optional `/api/uploads/sign` fallback (§4.2) and `/api/orders/:id/attach`.
5. **Operator:** add an admin endpoint that returns a short-TTL `createSignedUrl` (§4.5).
6. **Schema:** add `intake_path` (or `order_files`) per §5; persist the returned path.
7. **Env:** apply the §6.3 delta on Hostinger (drop FIREBASE_*, add SUPABASE_*); confirm `VITE_*` exist **before** the client build.
8. **Verify:** RLS unit test — user A cannot read/write user B's folder; anon denied; oversize/wrong-MIME upload rejected.

---

## Sources

- API keys (publishable/secret vs anon/service_role; deprecation) — https://supabase.com/docs/guides/api/api-keys
- Creating buckets (Dashboard / `createBucket` / SQL; restricting uploads) — https://supabase.com/docs/guides/storage/buckets/creating-buckets
- Bucket fundamentals (private by default) — https://supabase.com/docs/guides/storage/buckets/fundamentals
- File limits (per-bucket bytes, MIME, global plan caps) — https://supabase.com/docs/guides/storage/uploads/file-limits
- Storage access control (RLS policy examples, service-role bypass, upsert reqs) — https://supabase.com/docs/guides/storage/security/access-control
- Storage helper functions (`foldername`/`filename`/`extension`) — https://supabase.com/docs/guides/storage/schema/helper-functions
- RLS performance & best practices (`(select auth.uid())` init-plan) — https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv
- Init-plan trap writeup — https://dev.to/arvavit/76-rls-policies-rewritten-in-one-migration-the-authuid-init-plan-trap-in-supabase-4hg
- Standard uploads (contentType/cacheControl/upsert; ~6 MB) — https://supabase.com/docs/guides/storage/uploads/standard-uploads
- Resumable uploads (TUS, 6 MB chunk, direct host, 24 h) — https://supabase.com/docs/guides/storage/uploads/resumable-uploads
- Storage v3 / signed upload URLs blog — https://supabase.com/blog/storage-v3-resumable-uploads
- createSignedUrl reference — https://supabase.com/docs/reference/javascript/storage-from-createsignedurl
- createSignedUploadUrl discussion — https://github.com/orgs/supabase/discussions/10289
- getClaims (local JWT verify) — https://supabase.com/docs/reference/javascript/auth-getclaims
- JWTs / signing keys (asymmetric, JWKS) — https://supabase.com/docs/guides/auth/jwts · https://supabase.com/docs/guides/auth/signing-keys
- Supabase Auth with React (createClient, getSession, onAuthStateChange) — https://supabase.com/docs/guides/auth/quickstarts/react
- `@supabase/supabase-js` version — https://www.npmjs.com/package/@supabase/supabase-js
- CLI resumable 6 MB chunk issue — https://github.com/supabase/cli/issues/2729
