# SameDayDesk — Implementation Plan (build doc)

**Date:** 2026-06-20 · **Domain:** samedaydesk.com (purchased) · **Entity:** Neomorphic LLC (WY, USA — not surfaced on marketing)
**Decision record:** see [`research/00-SYNTHESIS.md`](research/00-SYNTHESIS.md) (+ deep reports `research/01`–`10`).
**Playbooks:** [`web-guides/`](web-guides/) — Stripe / Resend / Hostinger reused verbatim; the Firebase guide is **superseded by Supabase** (see §0).

This is the working execution doc. The synthesis is the *why*; this is the *what/when*.

> **Backend pivot (operator decision):** dropped Firebase entirely — **Supabase is the single backend** (Auth + Postgres + Storage). One platform, one set of keys. RLS maps cleanly onto the playbooks' "owner-scoped reads, server-authoritative writes" model.

---

## 0. Locked decisions

| Area | Decision |
|---|---|
| **Stack** | Vite SPA (**React + TS**) + **single Express process** (`/api/*` + built SPA + SPA fallback). Marketing routes **prerendered** (`vite-react-ssg`) for real OG/meta + text LCP. |
| **Runtime** | Node **22.x** (`engines.node`), bind `process.env.PORT` on `0.0.0.0`. |
| **Backend (Auth + Data + Uploads)** | **Supabase** (single backend, project `samedaydesk`, free tier). **Auth** (Email/Password + Google OAuth, JWT). **Postgres + RLS** (owner-scoped reads; all value/status writes via **service-role** on the server). **Storage** (private bucket `intake-uploads`, per-user folder RLS). `@supabase/supabase-js` (client, anon key) + service-role client (server). Server verifies the Supabase JWT via JWKS. Replaces Firebase. |
| **Payments** | **`stripe@^22`**, `apiVersion: "2026-05-27.dahlia"`. Payment Element (on-site) + Payment Links (operator instant link). Sandbox `acct_1SAPeUPwY9LS48U1`. |
| **Email** | **Resend** for app transactional email (receipts, teaser delivery, admin notifs) via API; **Resend as Supabase Auth custom SMTP** for branded auth emails. P3: signup with email confirmation **OFF** (easy testing). P7: flip on Supabase **email OTP/confirmation**. All from `contact@samedaydesk.com`. |
| **Host** | **Hostinger Business** "Node.js Apps" from GitHub (`epistemedeus/samedaydesk`), auto-deploy on `main`. |
| **Email/DNS** | Hostinger receives `contact@` → forward to `vanbarthelemy@gmail.com` → Gmail "send-as". Resend sends from `send.` subdomain. Reconciled DNS table in synthesis §3. |
| **Analytics** | PostHog, cookieless, ~5 funnel events. |
| **Quality gates** | Playwright (+axe) E2E signup→pay; Lighthouse CI on `/`. |

---

## 1. Design system — "Engineered Speed"

Dark, type-led, precise. The site's speed **is** the flex (CWV-green while looking award-grade). Every motion says *fast · precise · dependable* — pit-stop, not fireworks.

**Positioning (not boxed-in):** SameDayDesk is a *same-day done-for-you desk* — the 万事屋 / "hand off the small stuff, get it back today" ethos. Current gigs are micro-deliverables (career, copy, code/data) but the IA must absorb **new gigs** without redesign: service data is config-driven, sections are category-based, copy frames the brand as "the desk for the work you don't have time for," with **résumé+LinkedIn $59 as the prominent flagship example, not the ceiling.** The landing stands on its own as SameDayDesk — **no explicit "Neomorphic LLC" attribution** on marketing surfaces (legal/ToS pages may name the entity).

- **Palette:** near-black base `#0A0B0D`, off-white text `#F4F4F0`, **signal accent electric lime `#CCFF00`**, monospaced numerals for prices/timers.
- **Type:** one variable **display grotesk** (kinetic headlines) + one legible neo-grotesk (Inter var) for UI/body. **Self-hosted woff2, open-licensed** (no paid licenses). Fluid `clamp()` (Utopia), every max ≤ 2.5× min (WCAG 1.4.4).
- **5 signature moments:** (1) Velocity Headline (GSAP SplitText, snap-in/soft-settle — this is the LCP text, prerendered) · (2) **Same-Day Timer** scroll-pinned input→rewrite→"Delivered Today" (ScrambleText) — the signature + value prop · (3) **Energy Surface** low-contrast OGL/GLSL flow-field behind hero, accelerates with scroll velocity, lazy-mounted **after LCP**, static fallback · (4) magnetic **$59** flagship CTA (desktop fine-pointer only) · (5) View-Transition handoff marketing→signup.
- **Sections:** Hero (broad brand line, e.g. "Hand off the work. Get it back today." with résumé as the lead example; primary CTA "Get my free teaser" + quiet "See pricing"; trust strip: money-back · same-day · US company) → proof-of-speed timer → **service categories** (config-driven; today: Career [résumé+LinkedIn $59 flagship, cover letter $39], Copy [landing copy $69], Bundles [$79 "best value"], Custom/quote — built to add more) → social proof + guarantee → free-teaser→signup→pay path → clean footer (SameDayDesk · © · pricing/terms/privacy/contact — **no parent-brand callout**).
- **Guardrails (non-negotiable):** `gsap.matchMedia("(prefers-reduced-motion: no-preference)")` gates all non-essential motion; DPR ≤ 1.5; WebGL deferred + offscreen-paused (IntersectionObserver + `visibilitychange`); Lenis desktop/fine-pointer only; AA contrast scrim over shader; visible focus + skip-link + full keyboard path; **< 200KB gz JS before hero**; targets **LCP ≤ 2.5s · INP ≤ 200ms · CLS ≤ 0.1** on mid-tier Android. No-JS / reduced-motion / weak-GPU users get a beautiful static version.

> GSAP + all plugins (SplitText, ScrambleText, ScrollTrigger…) are **free incl. commercial** since Apr 2025. OGL over Three/R3F for the single shader surface.

---

## 2. Repo architecture

```
samedaydesk/
  package.json            # type:module; engines.node 22.x; build (client) ; start (node server/index.js)
  server/
    index.js              # raw webhook → express.json → /api router → static dist → SPA fallback → listen($PORT,0.0.0.0)
    lib/{supabase-admin,stripe,resend}.js   # supabase-admin = service-role client + JWKS verifier
    middleware/auth.js     # requireAuth (verify Supabase JWT) → requireVerifiedEmail → requireAdmin
    routes/{auth,checkout,stripe-webhook,resend-webhook,teaser,uploads}.js  # uploads = signed download URL for operator
    pricing.js             # server-authoritative offer→cents map
  client/                 # Vite React SPA (prerendered marketing routes)
    src/{pages,components,motion,lib}/   # lib/supabase.ts = anon client
  emails/                 # react-email templates (app transactional)
  supabase/migrations/*.sql   # tables + RLS + storage bucket/policies (supabase db push)
  tests/e2e.spec.ts  lighthouserc.json  .gitignore
```

**Offer→price map (server-owned, cents):** `resume_linkedin` 5900 · `cover_letter` 3900 · `landing_copy` 6900 · `bundle_all` 7900 · `custom_quote` variable. Client sends an **offer slug only**, never an amount.

**Data model (Supabase Postgres):** `profiles` (1:1 with `auth.users` via trigger; holds `payment_status`, set only by server) · `orders` (owner-read, server-write; deterministic dedupe key) · `drafts` (owner read/write intake) · `email_suppressions` (server) · Storage `intake-uploads/uploads/{uid}/…`.

---

## 3. Env var surface

Public (baked at build, `VITE_*`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_POSTHOG_KEY`, `VITE_SITE_URL`.
Server (runtime secrets): `NODE_ENV`, `PUBLIC_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET=intake-uploads`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL=contact@samedaydesk.com`, `RESEND_WEBHOOK_SECRET`, `ADMIN_EMAIL`, `ADMIN_UID`.
Local dev uses `.env` (gitignored) + `stripe listen`. (Supabase project is hosted — no local emulator needed; can use a separate dev project later.)

---

## 4. Phased build (each phase independently testable)

- **P0 — Scaffold & repo.** SPA+Express skeleton, scripts, raw-webhook wiring, `/api/health`, `gh repo create samedaydesk --private --push`. Supabase: capture URL + anon + service-role keys; create schema migration (tables + RLS + `intake-uploads` bucket + storage policies); enable Email/Password + Google; set Site URL + redirect URLs (localhost + prod). *Done = local single process runs; repo on GitHub; schema applied.*
- **P1 — Landing page (the showcase).** Prerendered marketing routes; "Engineered Speed" system (kinetic hero, Same-Day Timer, energy surface, magnetic CTA, View-Transition); config-driven service categories. *Done = CWV-green award-grade landing; Lighthouse ≥ 0.9.*
- **P2 — Auth.** Supabase client init; Email/Password + Google; server `requireAuth` (JWKS verify) / `requireVerifiedEmail` / `requireAdmin`; `profiles` row via trigger; RLS proven (owner-only reads, no client writes to value fields). *Done = signup/in, server-verified JWT, RLS proven.*
- **P3 — Email (no verify yet).** Email confirmation OFF in Supabase; react-email welcome + receipt; signup notification (idempotency keys); bounce/complaint webhook + suppression; tested via `onboarding@resend.dev` + sim addresses (no DNS). *Done = transactional email works pre-DNS.*
- **P4 — Payments (sandbox, full flow).** Seed Products/Prices/Payment Links (committed seed script); server PaymentIntent + Payment Element (brand appearance/fonts); operator instant-link; idempotent `fulfill()` (service-role write); `stripe listen`; run report 04 test checklist (happy/3DS/decline/idempotency/links/quote/refund) + uploads intake. *Done = end-to-end sandbox checkout green; Playwright passes.*
- **P5 — Deploy (Hostinger).** Node.js App from GitHub (synthesis §1.3 settings); env vars (no PORT); attach domain + auto-SSL; verify push-deploy; add prod URL to Supabase redirect/Site URLs; register Stripe **dashboard** webhook → prod `whsec_`; smoke test. *Done = live on test keys at samedaydesk.com.*
- **P6 — Email + DNS.** Hostinger mailbox `contact@`; auto-connect MX/DKIM; forwarder→Gmail; Gmail send-as SMTP; Resend domain (`send.` records) + DMARC; point Supabase Auth SMTP at Resend; verify all senders pass. *Done = receive→Gmail + send-as + Resend (app + auth) verified.*
- **P7 — Email verification ON.** Flip Supabase email confirmation / enable email OTP (6-digit); enforce `requireVerifiedEmail` on sensitive routes; client session refresh after verify. *Done = email-verified gate live.*
- **P8 — Go live (real keys, operator-gated).** Swap Stripe live keys + live webhook secret; Apple Pay/Link domain registration; re-seed live Products/Prices/Links; consider Supabase Pro (avoid free-tier pause); final Lighthouse/axe/Playwright; DMARC `none`→`quarantine`→`reject` over ~2 wks. *Done = real payments.*

I execute P0–P4 now (no external blockers). P5–P6 need GitHub-auth + DNS approval. P8 needs your live keys.

---

## 5. Operator action items (human-only)

Accounts confirmed logged-in & ready: **Hostinger** (Business plan), **Supabase** (`samedaydesk`, vanbarthelemy@gmail.com), **GitHub** (`epistemedeus`), **Stripe sandbox**. Remaining human-only gates:

1. **Approve GitHub authorization** for Hostinger when it prompts (P5).
2. **Approve DNS edits** in the Hostinger zone (P6) + click forwarder/send-as confirmation links (forwarder activation, Gmail send-as code).
3. **Provide Stripe live keys** + approve go-live (P8).

## 6. Resolved decisions

- **Backend:** ✅ **Supabase only** (Auth + Postgres + Storage). Firebase dropped.
- **Accent:** ✅ **electric lime `#CCFF00`** on near-black.
- **Uploads:** ✅ Supabase Storage, private bucket, per-user RLS — free tier.
- **Branding:** ✅ landing is **SameDayDesk only**, no Neomorphic attribution on marketing surfaces.
- **Scope:** ✅ design **extensible** for future gigs (config-driven services), not boxed into current micro-deliverables.

Defaulted (noted in commits): fonts → free self-hosted variable; receipts → Stripe receipt + our order-confirmation email; analytics → cookieless PostHog; verification → Supabase native OTP (not custom hash); DMARC ramp none→quarantine→reject.

---

## 7. Live config (filled during build)

- **Supabase project ref:** `arvmcttdegqwiwdaembr` · URL `https://arvmcttdegqwiwdaembr.supabase.co` · new-format keys (`sb_publishable_…` client, `sb_secret_…` server, asymmetric JWT → JWKS verify). Keys in gitignored `.env` / `client/.env`.
- **Schema applied** (`supabase/migrations/0001_init.sql`): `profiles` (+ new-user trigger), `orders`, `drafts`, `email_suppressions`; default-deny RLS (owner-select; server-only writes); private bucket `intake-uploads` (10MB, per-user folder RLS `{uid}/…`).
- **Auth:** Email/Password on; **Confirm email OFF** (P3 testing) — turn ON at P7. Google OAuth + Site/redirect URLs: deferred to P5/P7. SMTP→Resend: P6.
- **Stripe sandbox** `acct_1SAPeUPwY9LS48U1` (test keys in env). 4 Payment Links + instant-link helper seeded. Live dashboard acct is separate (`acct_1SAPeHLafhbMG1jP`) — keys come at P8.
- **Resend:** key `samedaydesk` created (in env). ⚠️ **Resend account owner = `prophetevo@gmail.com`** (not vanbarthelemy) — in test mode sends only reach that address from `onboarding@resend.dev`. P6: verify `samedaydesk.com` in Resend → switch FROM to `contact@samedaydesk.com`, then any recipient (incl. ADMIN_EMAIL=vanbarthelemy@gmail.com) works.
- **GitHub:** gh CLI authed as `epistemedeus`; repo push happens at P5 (Hostinger deploy). Hostinger will need the operator to approve the GitHub-app authorization.
