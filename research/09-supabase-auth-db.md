# Supabase as the Complete Auth + Postgres Backend (June 2026)

**Context:** Vite React SPA + Express (Node, single-process) on Hostinger, replacing Firebase.
Express holds all secrets and performs Stripe/Resend + privileged DB writes (service/secret key).
The SPA uses only the public publishable/anon key.

> **TL;DR architecture**
> - SPA: `@supabase/supabase-js` with the **publishable** key. Handles signup/signin (email+password, Google OAuth, email OTP), holds the session, and reads only the user's own rows via RLS.
> - SPA → Express: send the Supabase **access token** in `Authorization: Bearer <jwt>`.
> - Express: a `requireAuth` middleware **verifies the JWT locally via JWKS** (asymmetric), derives `uid`/`email`/`email_verified`, then does all privileged writes with a **service-role/secret key client that bypasses RLS**.
> - Postgres: RLS on every table. Clients get `SELECT` on their own rows only. All value/status writes happen server-side.

---

## 0. Versions & key facts at a glance (verified June 2026)

| Thing | Current value |
|---|---|
| `@supabase/supabase-js` | **2.108.x** (latest on npm, ~June 2026). Pin a recent `^2.7x+` minimum so `getClaims` is present. |
| Default JWT signing | **Asymmetric by default for all new projects since Oct 1, 2025** (ECC/RSA, JWKS-published). Older projects still on symmetric HS256 unless migrated. |
| JWKS endpoint | `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` (Edge-cached ~10 min) |
| Access-token (JWT) lifetime | **3600 s (1 hour)** default; configurable. Don't go below ~5 min. |
| Refresh token | Long-lived, **single-use, rotated** on every refresh. `supabase-js` auto-refreshes ~60 s before expiry. |
| New API keys | `sb_publishable_…` (browser-safe, replaces `anon`) and `sb_secret_…` (backend-only, replaces `service_role`). Legacy `anon`/`service_role` JWT keys deprecated, **removed late 2026**. |
| Free tier | 500 MB DB, 1 GB file storage, 5 GB egress, 50k MAU, 2 active projects. **Pauses after 7 days inactivity.** |
| Pro | $25/mo per project (no pausing, 8 GB DB, 100k MAU, etc.). |

Sources: [npm @supabase/supabase-js](https://www.npmjs.com/package/@supabase/supabase-js), [JWT Signing Keys blog](https://supabase.com/blog/jwt-signing-keys), [Signing keys docs](https://supabase.com/docs/guides/auth/signing-keys), [API keys docs](https://supabase.com/docs/guides/getting-started/api-keys), [Sessions docs](https://supabase.com/docs/guides/auth/sessions).

---

## 1. Client setup in the Vite React SPA

### 1.1 Install + client init

```bash
npm i @supabase/supabase-js   # 2.108.x as of June 2026
```

Vite exposes only `VITE_`-prefixed env vars to the client bundle. The publishable/anon key is **public and safe** — its power is fully gated by RLS.

```ts
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,            // https://<ref>.supabase.co
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, // sb_publishable_... (or legacy anon key)
  {
    auth: {
      flowType: 'pkce',          // PKCE is the secure default for SPAs (see §1.3)
      autoRefreshToken: true,    // refresh ~60s before the 1h expiry
      persistSession: true,      // store session in localStorage
      detectSessionInUrl: true,  // parse ?code=... on the OAuth callback route
    },
  },
)
```

```bash
# .env (SPA)  — never commit real values
VITE_SUPABASE_URL=https://YOUR_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxx
```

> **New vs legacy keys:** New projects only issue `sb_publishable_…` / `sb_secret_…`. If your project predates this, the legacy `anon` key still works in the browser; you can substitute the publishable key anywhere `anon` was used with no client code changes. ([API keys docs](https://supabase.com/docs/guides/getting-started/api-keys))

### 1.2 Email/password signup + signin

```ts
// Signup
const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: {
    data: { first_name: firstName, last_name: lastName }, // -> raw_user_meta_data
    emailRedirectTo: `${window.location.origin}/auth/callback`,
  },
})
// If "Confirm email" is OFF, data.session is non-null and the user is logged in immediately.
// If ON, data.session is null until they click the confirmation link / enter the OTP.

// Signin
const { data, error } = await supabase.auth.signInWithPassword({ email, password })
```

Session-aware React (subscribe once, top-level):

```ts
useEffect(() => {
  supabase.auth.getSession().then(({ data }) => setSession(data.session))
  const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
  return () => sub.subscription.unsubscribe()
}, [])
```

### 1.3 Google OAuth (PKCE)

PKCE is the correct flow for SPAs: Supabase returns an **auth code** in the URL, which is exchanged (with the locally-stored code verifier) for a session. The code is valid 5 min and single-use. ([PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [signInWithOAuth](https://supabase.com/docs/reference/javascript/auth-signinwithoauth))

**A. Google Cloud Console** ([auth-google](https://supabase.com/docs/guides/auth/social-login/auth-google))
1. APIs & Services → Credentials → **Create OAuth client ID** → *Web application*.
2. **Authorized JavaScript origins:**
   - `http://localhost:5173` (Vite default — match your dev port)
   - `https://samedaydesk.com`
3. **Authorized redirect URIs** — this is the **Supabase** callback, not your app:
   - `https://<ref>.supabase.co/auth/v1/callback`
4. Copy **Client ID** + **Client Secret**.

**B. Supabase Dashboard** → Authentication → Providers → **Google** → paste Client ID/Secret, enable.

**C. Redirect URL allow-list** (Authentication → URL Configuration). These are *your app's* post-login URLs. ([Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls))
   - Site URL: `https://samedaydesk.com`
   - Additional Redirect URLs:
     - `http://localhost:5173/**`
     - `https://samedaydesk.com/**`

**D. Trigger sign-in (SPA):**

```ts
await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: `${window.location.origin}/auth/callback` },
})
```

**E. Callback route** — with `detectSessionInUrl: true`, `supabase-js` auto-exchanges the code on load, so the callback page can be tiny:

```tsx
// /auth/callback
export default function AuthCallback() {
  const nav = useNavigate()
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) =>
      nav(data.session ? '/dashboard' : '/login', { replace: true }))
  }, [])
  return <p>Signing you in…</p>
}
```

> If you set `detectSessionInUrl: false`, call `await supabase.auth.exchangeCodeForSession(window.location.href)` manually instead.

### 1.4 Session persistence

`persistSession: true` keeps the session in `localStorage` and rehydrates on reload; `autoRefreshToken: true` swaps the 1-hour access token transparently using the rotating refresh token. No app code needed beyond the `onAuthStateChange` subscription. ([Sessions](https://supabase.com/docs/guides/auth/sessions))

---

## 2. Server-side JWT verification in Express (the 2026 approach)

### 2.1 Background: asymmetric signing keys are now the default

Since **Oct 1, 2025, all new Supabase projects sign JWTs with an asymmetric key** (ECC P-256 / ES256 recommended, RSA RS256 supported) and publish the **public** key at the JWKS endpoint. HS256 is still default only for older, un-migrated projects. ([JWT Signing Keys blog](https://supabase.com/blog/jwt-signing-keys), [Signing keys docs](https://supabase.com/docs/guides/auth/signing-keys))

This is the single most important change for your server: **your Express process can verify tokens offline using the public JWKS**, with no shared secret and no round-trip to Supabase per request.

### 2.2 Three verification options compared

| Option | How it works | Network per request | Pros | Cons |
|---|---|---|---|---|
| **(a) `jose` + JWKS** | `createRemoteJWKSet` fetches & caches public keys; `jwtVerify` validates signature/exp locally | None (after first JWKS fetch, cached) | No Supabase dep, fast, standard, explicit | You manage claim checks yourself |
| **(b) `supabase.auth.getClaims(jwt)`** | Verifies locally via WebCrypto for asymmetric keys; **falls back to a network call for symmetric** keys | None for asymmetric; one call for HS256 | First-party, handles both key types | Requires a supabase client instance; behaves differently per key type |
| **(c) `auth.getUser(jwt)`** | Calls Supabase Auth `/user` on every request | **One round-trip every time** | Always-fresh user, catches revoked/banned users | Slow, adds latency + a hard dependency on Auth uptime; rate-limited |

([getClaims](https://supabase.com/docs/reference/javascript/auth-getclaims), [JWTs guide](https://supabase.com/docs/guides/auth/jwts), [getUser](https://supabase.com/docs/reference/javascript/auth-getuser))

### 2.3 Recommendation

**Use (a) `jose` + JWKS as the primary `requireAuth` middleware.** It is dependency-light, has zero per-request network cost, works with the asymmetric keys that are now default, and gives you full control over claim validation. `getClaims` (b) is a fine first-party alternative and is essentially doing the same thing under the hood; prefer it if you already have a server-side supabase client around. Reserve `getUser` (c) for the rare endpoint that must detect a *just-banned/just-deleted* user, since only it re-checks live server state.

> **Caveat:** local JWKS verification trusts the token until it expires (≤1 h). If you need instant revocation (ban a user and lock them out *now*), you must either call `getUser` on sensitive routes or check a server-side `is_banned` flag in your own `profiles` table.

### 2.4 Exact `requireAuth` middleware (jose + JWKS)

```bash
npm i jose
```

```ts
// server/auth/requireAuth.ts
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import type { Request, Response, NextFunction } from 'express'

const SUPABASE_URL = process.env.SUPABASE_URL!          // https://<ref>.supabase.co
const JWKS = createRemoteJWKSet(
  new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
  { cooldownDuration: 30_000, cacheMaxAge: 600_000 },   // align with Supabase's ~10min edge cache
)

export interface AuthedUser {
  uid: string
  email: string | null
  emailVerified: boolean
  role: string
  raw: JWTPayload
}
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { user?: AuthedUser } }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'missing_token' })

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `${SUPABASE_URL}/auth/v1`,  // iss claim
      audience: 'authenticated',          // aud claim for logged-in users
    })

    // Supabase puts email verification under user_metadata / top-level depending on flow.
    const emailVerified = Boolean(
      (payload as any).email_verified ??
      (payload as any).user_metadata?.email_verified ??
      false,
    )

    req.user = {
      uid: payload.sub!,                       // auth.users.id
      email: (payload as any).email ?? null,
      emailVerified,
      role: (payload as any).role ?? 'authenticated',
      raw: payload,
    }
    next()
  } catch {
    return res.status(401).json({ error: 'invalid_token' })
  }
}
```

Usage:

```ts
app.post('/api/orders', requireAuth, async (req, res) => {
  const { uid, email, emailVerified } = req.user!
  if (!emailVerified) return res.status(403).json({ error: 'email_not_verified' })
  // ... privileged write with service-role client (see §3.4)
})
```

**Equivalent with `getClaims` (option b):**

```ts
import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!)

const { data, error } = await sb.auth.getClaims(token)
if (error || !data) return res.status(401).json({ error: 'invalid_token' })
const { sub, email, role } = data.claims
```

### 2.5 Token lifetime / refresh notes
- Access token (JWT) expires in **3600 s** by default. The SPA's `supabase-js` auto-refreshes it; your Express middleware just validates whatever bearer arrives.
- Refresh tokens are **single-use and rotated**; the server never handles them — that's the SPA's job.
- JWKS is Edge-cached ~10 min; keep your `cacheMaxAge` ≤ ~10 min so a key rotation/revocation propagates. ([Sessions](https://supabase.com/docs/guides/auth/sessions), [JWTs guide](https://supabase.com/docs/guides/auth/jwts))

---

## 3. Postgres data model + RLS (owner-scoped)

**Security model:** clients can `SELECT` only their own rows. **Every** write that touches a value or status field goes through Express using the **service-role/secret key**, which has the `BYPASSRLS` Postgres attribute and skips all policies. Clients are granted no `INSERT/UPDATE/DELETE` on protected columns. ([RLS docs](https://supabase.com/docs/guides/database/postgres/row-level-security), [API keys / BYPASSRLS](https://supabase.com/docs/guides/getting-started/api-keys))

### 3.1 `profiles`

```sql
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  first_name  text,
  last_name   text,
  is_banned   boolean not null default false,   -- server-checked flag (instant revocation)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Owner can read own profile. No client writes at all -> server owns it.
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using ( (select auth.uid()) = id );
```

> **Performance:** wrap `auth.uid()` as `(select auth.uid())` so Postgres evaluates it once per query (initPlan) instead of per row. ([RLS performance](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv))

### 3.2 `orders` — owner reads; server owns all value/status

```sql
create table public.orders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  status      text not null default 'draft',          -- server-only
  amount_cents integer not null default 0,            -- server-only (value)
  currency    text not null default 'usd',
  stripe_payment_intent_id text,                      -- server-only
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.orders enable row level security;

-- Owner can READ their own orders.
create policy "orders_select_own"
  on public.orders for select
  to authenticated
  using ( (select auth.uid()) = user_id );

-- NO insert/update/delete policy for authenticated -> all client writes denied by default.
-- The service-role key bypasses RLS, so Express performs every write.
```

> RLS denies any operation lacking a matching policy. By giving `authenticated` **only** a `SELECT` policy, clients literally cannot write `status`/`amount_cents`. The service-role client bypasses RLS and writes them server-side. This is cleaner and safer than per-column `GRANT`s plus `WITH CHECK` gymnastics, though you can additionally `REVOKE`/`GRANT` at column level for defense-in-depth.

### 3.3 `drafts` (owner can edit own draft content) + `email_suppressions` (server-only)

```sql
-- Drafts: user-editable scratch content. Owner may read AND write own rows,
-- but cannot reassign ownership (WITH CHECK pins user_id).
create table public.drafts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  content     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table public.drafts enable row level security;

create policy "drafts_select_own" on public.drafts
  for select to authenticated using ( (select auth.uid()) = user_id );

create policy "drafts_insert_own" on public.drafts
  for insert to authenticated with check ( (select auth.uid()) = user_id );

create policy "drafts_update_own" on public.drafts
  for update to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );  -- prevents ownership theft

create policy "drafts_delete_own" on public.drafts
  for delete to authenticated using ( (select auth.uid()) = user_id );

-- Email suppressions: purely server-managed (Resend bounces/complaints/unsubscribes).
-- No client access at all.
create table public.email_suppressions (
  email       text primary key,
  reason      text not null,          -- 'bounce' | 'complaint' | 'unsubscribe' | 'manual'
  created_at  timestamptz not null default now()
);
alter table public.email_suppressions enable row level security;
-- (no policies => only service-role/secret key can touch it)
```

> **The `WITH CHECK` rule (critical):** an `UPDATE` policy without `WITH CHECK` lets a user set `user_id` to someone else's UUID and steal a row. Always add `WITH CHECK` mirroring the `USING` clause on owner-writable tables. ([RLS owner edit pattern](https://hrekov.com/blog/rls-policies-supabase))

### 3.4 `handle_new_user()` trigger — auto-create `profiles` row

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''   -- '' avoids search_path hijacking
as $$
begin
  insert into public.profiles (id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

> Test this thoroughly — a failing trigger **blocks all signups**. Keep it minimal and tolerant. ([Managing user data](https://supabase.com/docs/guides/auth/managing-user-data))

### 3.5 Service-role client in Express

```ts
// server/lib/supabaseAdmin.ts
import { createClient } from '@supabase/supabase-js'

// BYPASSES RLS. Backend-only. Secret keys 401 if used from a browser (User-Agent check).
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,   // sb_secret_...  (or legacy service_role key)
  { auth: { persistSession: false, autoRefreshToken: false } },
)
```

```ts
// All value/status writes happen here, scoped to the verified uid from requireAuth:
app.patch('/api/orders/:id/confirm', requireAuth, async (req, res) => {
  const { uid } = req.user!
  const { data, error } = await supabaseAdmin
    .from('orders')
    .update({ status: 'confirmed', updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('user_id', uid)          // ALWAYS re-scope: bypassing RLS removes the safety net
    .select()
    .single()
  if (error) return res.status(400).json({ error: error.message })
  res.json(data)
})
```

> **Golden rule:** because the secret key bypasses RLS, you lose the database-level ownership guard. Every server query must re-apply the owner filter (`.eq('user_id', uid)`) and never trust client-supplied IDs without it. The CVE-2025-48757 disclosure (10%+ of audited apps had anon-readable tables) underscores why RLS must be on for every table. ([RLS bypass writeup](https://vibeappscanner.com/supabase-row-level-security))

---

## 4. Email

### 4.1 Disable email confirmation for early testing (then re-enable)

Dashboard → **Authentication → Sign In / Providers → Email** (or *Providers → Email*) → toggle **"Confirm email" OFF**. With it off, `signUp` returns a `session` immediately and the user is active without verifying. Turn it back **ON** before launch. ([signUp](https://supabase.com/docs/reference/javascript/auth-signup), [General config](https://supabase.com/docs/guides/auth/general-configuration))

- CLI/self-host equivalent in `supabase/config.toml`:
  ```toml
  [auth.email]
  enable_signup = true
  enable_confirmations = false   # true to require email confirmation
  ```

### 4.2 Resend as Supabase Auth custom SMTP (lifts the rate limit)

**Why:** the built-in email sender is capped at **2 emails/hour** and is for testing only — it will break real auth flows. Configuring **any** custom SMTP removes that cap (your send capacity becomes the provider's). ([Rate limits](https://supabase.com/docs/guides/auth/rate-limits), [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp))

**Prereqs:** a Resend account, a **verified sending domain** (`samedaydesk.com`), and a Resend API key.

Dashboard → **Authentication → Emails → SMTP Settings** → Enable custom SMTP: ([Resend × Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp))

| Field | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` (implicit TLS; `587` STARTTLS also works) |
| Username | `resend` |
| Password | your Resend API key (`re_…`) |
| Sender email | `contact@samedaydesk.com` |
| Sender name | `Same Day Desk` |

> The sender domain must be verified in Resend or messages bounce. Resend's free tier sends ~3,000 emails/month / ~100/day — fine for auth emails early on. You can also install the **Resend integration** from the Supabase dashboard, which provisions the key and fills these fields automatically. ([Resend integration](https://supabase.com/partners/integrations/resend))

> Note: custom SMTP lifts the *email-sending* rate limit, but **OTP issuance is still capped** (default 30 OTP/hour, 60-second resend window, ~360 verify/hour) — these are separate, configurable limits. ([Rate limits](https://supabase.com/docs/guides/auth/rate-limits))

### 4.3 Native email OTP (6-digit code) as the verification mechanism

`signInWithOtp` sends either a **magic link** or a **6-digit OTP** depending on the email template: if the template contains `{{ .Token }}` you get an OTP; if it contains `{{ .ConfirmationURL }}` you get a magic link. ([signInWithOtp](https://supabase.com/docs/reference/javascript/auth-signinwithotp))

```ts
// 1) Send the code
const { error } = await supabase.auth.signInWithOtp({
  email,
  options: {
    shouldCreateUser: true,  // false => only existing users (e.g. for re-verify)
  },
})

// 2) Verify the 6-digit code -> creates a session
const { data, error } = await supabase.auth.verifyOtp({
  email,
  token: code,     // the 6 digits the user typed
  type: 'email',   // 'email' for sign-in OTP; 'signup' for confirm-after-signup; 'recovery' for reset
})
// data.session is now set on success.
```

Make sure the relevant template (Magic Link / Confirm signup) includes `{{ .Token }}` so a code is sent rather than a link.

### 4.4 Customize auth email templates (branding)

Dashboard → **Authentication → Emails → Templates**. Editable templates: **Confirm signup, Invite, Magic Link, Change Email, Reset Password** (and OTP via the `{{ .Token }}` variable). Use your logo, brand colors, and `contact@samedaydesk.com` sender. Useful variables: `{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .TokenHash }}`, `{{ .SiteURL }}`, `{{ .Email }}`. For repo-tracked templates, configure them under `[auth.email.template.*]` in `supabase/config.toml`.

---

## 5. Free-tier limits & the inactivity-pause gotcha

**Free tier (June 2026):** 500 MB database, 1 GB file storage, 5 GB egress/mo, **50,000 MAU**, 500k Edge Function invocations, unlimited API requests, **2 active projects**. ([Free-tier breakdown](https://www.itpathsolutions.com/supabase-free-tier-limits), [UI Bakery pricing](https://uibakery.io/blog/supabase-pricing))

**⚠️ The pause gotcha:** a free project **pauses after ~7 days of no activity**. Data is preserved (not deleted) and you can restore manually from the dashboard, but while paused the API/DB/Auth are **down** — fatal for a live product. A cron ping doesn't reliably reset it and is against the spirit of the tier.

**When Pro ($25/mo per project) becomes necessary** — any one of:
- You need the project to **never pause** (production).
- DB exceeds **500 MB** (Pro starts at 8 GB).
- You approach **50k MAU**.
- You need daily backups / PITR, more egress, or email-support SLAs.

Pro also includes a monthly compute credit. For a real revenue product replacing Firebase, **budget for Pro from launch** — the no-pause guarantee alone justifies it.

---

## 6. Reproducible schema — recommended workflow (CLI migrations in the repo)

**Recommendation: keep `supabase/migrations/*.sql` in version control as the source of truth and apply with the Supabase CLI.** Avoid making schema changes directly in the hosted SQL editor / Table editor for anything you want reproducible — those bypass migration history and cause `db push` to fail with sync errors. ([Local dev](https://supabase.com/docs/guides/local-development/overview), [DB migrations](https://supabase.com/docs/guides/deployment/database-migrations), [Managing environments](https://supabase.com/docs/guides/deployment/managing-environments))

```bash
# One-time
npm i -D supabase                 # or brew install supabase/tap/supabase
npx supabase init                 # creates supabase/config.toml + migrations/ folder
npx supabase login                # auth the CLI
npx supabase link --project-ref YOUR_REF   # link repo to the hosted project

# Author a migration
npx supabase migration new init_schema      # creates supabase/migrations/<ts>_init_schema.sql
#   -> paste the DDL/RLS/trigger SQL from §3 into that file

# Test locally (optional but recommended — runs Postgres in Docker)
npx supabase start
npx supabase db reset             # replays all migrations from scratch locally

# Ship to hosted project
npx supabase db push              # applies only not-yet-applied migrations, in order
```

Other helpers:
- `supabase db diff -f some_change` — capture changes you made in local Studio into a new migration file.
- `supabase gen types typescript --linked > src/types/db.ts` — generate typed DB definitions for the SPA + Express.

**Workflow comparison**

| Method | Verdict |
|---|---|
| **CLI migrations (`supabase/migrations/*.sql`)** | ✅ Recommended. Versioned, reviewable, reproducible, CI-friendly. Source of truth. |
| SQL Editor (dashboard) | OK for quick experiments/queries; **not** for tracked schema — diverges from migration history. |
| Management API | For programmatic/CI provisioning automation; overkill for a single app. Use CLI instead. |

> Tip: GitHub integration (available on all plans incl. free as of April 2026) can auto-apply migrations on merge if you want CD.

---

## Open questions / decisions to confirm

1. **Verify your project's actual signing mode.** If this project predates Oct 2025 (or was migrated), confirm it's on **asymmetric** keys (Dashboard → Auth → JWT/Signing Keys). The `jose`+JWKS middleware assumes asymmetric; on legacy HS256 you'd instead verify with the shared secret or use `getClaims`/`getUser`. Migrating to asymmetric is zero-downtime and recommended.
2. **New vs legacy API keys.** New projects only get `sb_publishable_…`/`sb_secret_…`. Decide whether to migrate any legacy `anon`/`service_role` usage now (legacy keys are removed late 2026).
3. **Revocation latency.** Local JWKS verification trusts a token until expiry (≤1 h). If "ban this user instantly" is a requirement, add an `is_banned` check (in `profiles`, queried server-side) or call `getUser` on sensitive routes — decide which routes need it.
4. **`email_verified` claim location.** Confirm where your tokens carry it (top-level vs `user_metadata`) for your auth flows; the middleware checks both, but verify against a real token from each path (password, Google, OTP).
5. **Pro from day one?** Strongly recommended given the 7-day pause; confirm budget.
6. **OTP rate limits.** Default 30 OTP/hour + 60 s resend window may pinch heavy testing — tune in Dashboard → Auth → Rate Limits if needed.

---

### Source list
- npm: https://www.npmjs.com/package/@supabase/supabase-js
- JWT Signing Keys (blog): https://supabase.com/blog/jwt-signing-keys
- Signing keys (docs): https://supabase.com/docs/guides/auth/signing-keys
- JWTs guide: https://supabase.com/docs/guides/auth/jwts
- getClaims: https://supabase.com/docs/reference/javascript/auth-getclaims
- getUser: https://supabase.com/docs/reference/javascript/auth-getuser
- API keys: https://supabase.com/docs/guides/getting-started/api-keys
- Migrating to new API keys: https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
- Google login: https://supabase.com/docs/guides/auth/social-login/auth-google
- signInWithOAuth: https://supabase.com/docs/reference/javascript/auth-signinwithoauth
- PKCE flow: https://supabase.com/docs/guides/auth/sessions/pkce-flow
- Redirect URLs: https://supabase.com/docs/guides/auth/redirect-urls
- Sessions: https://supabase.com/docs/guides/auth/sessions
- RLS (docs): https://supabase.com/docs/guides/database/postgres/row-level-security
- RLS performance: https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv
- Managing user data / handle_new_user: https://supabase.com/docs/guides/auth/managing-user-data
- Custom SMTP: https://supabase.com/docs/guides/auth/auth-smtp
- Resend × Supabase SMTP: https://resend.com/docs/send-with-supabase-smtp
- Resend integration: https://supabase.com/partners/integrations/resend
- Rate limits: https://supabase.com/docs/guides/auth/rate-limits
- signInWithOtp: https://supabase.com/docs/reference/javascript/auth-signinwithotp
- signUp / confirm email: https://supabase.com/docs/reference/javascript/auth-signup
- General configuration: https://supabase.com/docs/guides/auth/general-configuration
- Local development: https://supabase.com/docs/guides/local-development/overview
- Database migrations: https://supabase.com/docs/guides/deployment/database-migrations
- db push: https://supabase.com/docs/reference/cli/supabase-db-push
- Free-tier limits: https://www.itpathsolutions.com/supabase-free-tier-limits
- Pricing 2026: https://uibakery.io/blog/supabase-pricing
