# 00 — SYNTHESIS: The SameDayDesk Build Decision Record

**Date:** 2026-06-20
**Author role:** Lead architect, reconciling reports 01–08 + the internal playbooks (`web-guides/`) + the offer package.
**Project:** samedaydesk.com — awwwards-worthy landing page + full signup/payment site for Neomorphic LLC (Wyoming US company). Same-day micro-deliverables; Stripe-paid; free teaser; money-back guarantee.
**Builder:** one autonomous AI agent with Chrome + computer control.

This document is the single source of truth. Where the eight research reports disagreed, this record makes the call and says why. Build from this; consult the deep reports (01–08) only for the long-form detail and inline citations.

---

## 0. The one real conflict, resolved up front

There is exactly one material disagreement across the eight reports:

- **Report 01 (stack-decision)** scores **Next.js (App Router) as the overall winner** and Vite SPA + Express as a "strong fallback."
- **Reports 03, 04, 05, 06, 08 and ALL four internal playbooks** are written for, and assume, **Vite SPA + a single Express process** (`/api/*` + built SPA), with `express.raw()` webhooks, `import.meta.env.VITE_*`, `requireAuth`/`requireVerifiedEmail` Express middleware, and `node server.js` on Hostinger.

**DECISION: Build on Vite SPA + a single Express process (Report 01's "Option C" / the playbook stack). Do NOT use Next.js.**

Rationale — the decisive factors, in order:

1. **Five of eight reports and 100% of the playbooks are already this stack.** Report 01 itself concedes Next.js is a "mechanical rewrite" of the playbooks and that Option C is "the existing playbook verbatim… runs cleanly on the same Hostinger Node product." Choosing Next.js means re-deriving the auth middleware, webhook wiring, and env conventions that reports 03/04/05/08 already wrote in Express form. That is pure translation risk for an autonomous agent, with no offsetting payoff for a site this size.
2. **Report 01's Next.js win rests almost entirely on Axis 2 (SEO/OG) and Axis 3 (WebGL ecosystem).** Both are answerable on the Express+Vite stack: SEO/OG is solved with a prerender step for the handful of marketing routes (below), and Report 02's entire awwwards toolkit (GSAP, OGL/GLSL, Lenis, View Transitions) is framework-agnostic vanilla/React that runs identically in a Vite SPA. The WebGL "ecosystem" advantage is a Next.js talking point, not a real constraint here.
3. **Single mental model for the agent.** Two trivial pieces — a static SPA + a plain Express server — beat the App Router's server/client (`'use client'`) boundary, which Report 01 flags as "the one place agents make mistakes."
4. **Hostinger runs it cleanly.** Report 06 confirms the managed Node.js Web Apps product (launched Nov 2025, on Business plan since Dec 2025) runs a persistent `node server.js` behind NGINX with a Restart button — the exact single-process shape. No serverless caveats.

**The one gap we explicitly close:** a pure Vite SPA serves crawlers/scrapers an empty shell, so Open Graph/Twitter previews and SEO suffer (Report 01 Axis 2; Report 08 implicitly). **Mitigation: prerender the marketing routes to static HTML with real OG/meta tags at build time** (`vite-react-ssg` or a prerender plugin), while the app shell (auth/checkout/dashboard) stays client-rendered. This gives Next.js-grade social previews without adopting Next.js. The `/` landing route's LCP element must be real server-rendered/prerendered text, not the WebGL canvas (Report 02).

> If a future requirement makes true per-request SSR unavoidable, the documented escape hatch is Report 01's Option A (Next.js on the same Hostinger Node product, start `npm run start -- -p $PORT`). It is not needed for launch.

---

## 1. FINAL stack + exact Hostinger deploy settings

### 1.1 The stack (pinned versions, June 2026)

| Layer | Choice | Version pin | Source report |
|---|---|---|---|
| Runtime | Node **22.x** LTS (set `engines.node`) | `"engines": { "node": "22.x" }` | 06, 03 |
| Frontend | **Vite SPA (React)** | Vite 6/7, React 18/19 | 01, 02 |
| Server | **Single Express process** serving `/api/*` + built SPA + SPA fallback | Express 4/5 | playbooks, 04, 06 |
| SEO/OG | **Prerender marketing routes** to static HTML (`vite-react-ssg` or prerender plugin) | — | 01 (gap), 02 |
| Auth/Data | Firebase Web SDK **`firebase@^12`** (client) + **`firebase-admin@^13`** (server) | `firebase@12.15.x`, `firebase-admin@13.5+` | 03 |
| Payments | **`stripe@22.2.x`** (server) + `@stripe/stripe-js` + `@stripe/react-stripe-js` (client); pin `apiVersion: "2026-05-27.dahlia"` | bump from playbook's `2026-02-25.clover` | 04 |
| Email | **`resend@^6.13`** + `@react-email/components` | `resend@6.13.0` | 05 |
| Motion | **GSAP (free, incl. all plugins) + OGL/GLSL + Lenis (desktop-only) + View Transitions API** | GSAP 3.13+ | 02 |
| Analytics | **PostHog** (cookieless), 1 funnel, ~5 events | plugin available | 08 |
| Quality gates | **Playwright** (+`@axe-core/playwright`) + **Lighthouse CI** | — | 08 |

**Notable version corrections to the 2023-era playbooks (must apply):**
- Firebase Web SDK `9/10` → **`12`**; Admin `11` namespaced → **`13`** modular subpath imports; `initializeApp()` is now idempotent. (03)
- Storage now **requires the Blaze plan** (Spark lost Storage access Feb 3 2026). Put project `samedaydesk` on **Blaze before wiring Storage**; set a budget alert. (03)
- New default Storage bucket name is **`samedaydesk.firebasestorage.app`**, NOT `appspot.com`. (03) — overrides the playbook's `<project-id>.appspot.com`.
- `localhost` is **no longer auto-authorized** for Firebase Auth (projects after Apr 28 2025) — add it manually under Auth → Settings → Authorized domains. (03)
- Stripe `apiVersion` pin: **`2026-05-27.dahlia`** (matches `stripe@22.2.x`), up from the playbook's `clover`. (04)

### 1.2 Repo shape (single process)

```
samedaydesk/
  package.json            # engines.node 22.x; build = build SPA; start = node server/index.js
  server/index.js         # Express: raw webhook → express.json → /api router → static SPA → SPA fallback
  client/                 # Vite SPA (React); marketing routes prerendered
  firestore.rules, storage.rules, firebase.json, .firebaserc
  emails/                 # react-email templates
  tests/                  # one Playwright spec
  lighthouserc.json
```

`package.json` scripts (Report 06 shape):
```jsonc
{
  "type": "module",
  "engines": { "node": "22.x" },
  "scripts": {
    "build": "npm --prefix client install && npm --prefix client run build", // includes prerender
    "start": "node server/index.js"   // MUST listen on process.env.PORT, host 0.0.0.0
  }
}
```

`server/index.js` load-bearing order (raw body BEFORE `express.json()`; bind `$PORT`):
```js
// Stripe + Resend webhooks need RAW body — mount before express.json()
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }), captureRaw);
app.use("/api/webhooks/resend", express.raw({ type: "application/json" }), captureRaw);
app.use(express.json());
app.use("/api", apiRouter);
app.use(express.static(path.resolve(__dirname, "../client/dist")));
app.get("*", (req, res) => res.sendFile(/* client/dist/index.html */));
app.listen(process.env.PORT || 3000, "0.0.0.0");
```

### 1.3 Exact Hostinger settings (the deploy)

Plan: **Business** web hosting (min tier with Managed Node.js apps; supports up to 5 Node apps) or Cloud. **A VPS is NOT required.** (Report 06)

hPanel → Websites → Add Website → **Node.js Apps** → Import Git Repository → authorize GitHub → pick repo + branch `main`:

```
Framework:        Express.js  (if monorepo isn't auto-detected, pick "Other")
Node version:     22.x        (match engines in package.json — mismatch = build failure)
Install command:  npm install (or npm ci with a lockfile)
Build command:    npm run build
Output directory: client/dist
Entry file:       server/index.js
Start:            node server/index.js   (binds process.env.PORT — DO NOT hardcode/set PORT)
Branch:           main        (auto-redeploy on push, via the GitHub webhook Hostinger installs)
```

Environment variables (hPanel → app settings → "Import from .env" or manual; never committed; editing requires a **redeploy**):
```
NODE_ENV=production
PUBLIC_URL=https://samedaydesk.com           # also NEXT_PUBLIC_SITE_URL equivalent for the SPA
# Firebase client (PUBLIC, baked at BUILD time as VITE_*)
VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID,
VITE_FIREBASE_STORAGE_BUCKET=samedaydesk.firebasestorage.app, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_…         # pk_live_… at go-live
# Server secrets (RUNTIME)
FIREBASE_SERVICE_ACCOUNT_KEY                  # whole JSON one line (base64 recommended to dodge the \n PEM gotcha)
FIREBASE_STORAGE_BUCKET=samedaydesk.firebasestorage.app
FIREBASE_FIRESTORE_DATABASE_ID=(default)
STRIPE_SECRET_KEY=sk_test_…                   # sk_live_… at go-live
STRIPE_WEBHOOK_SECRET=whsec_…                 # dashboard endpoint secret (NOT the CLI one) in prod
RESEND_API_KEY=…
RESEND_FROM_EMAIL=contact@samedaydesk.com
RESEND_WEBHOOK_SECRET=whsec_…                 # Svix secret for bounce/complaint webhook
ADMIN_EMAIL / ADMIN_UID                       # env-pinned admin gate
```
Gotchas to bake in (Reports 06, 03, 04): VITE_* must exist **before** build (baked in); never set `PORT`; the `private_key` newline escape is the #1 Admin-init failure (base64 the service-account JSON to sidestep it); Stripe webhook 400 = raw body not mounted before `express.json()`.

---

## 2. Awwwards-level design + motion direction: "Engineered Speed"

**Thesis (Report 02):** the site itself is the proof of craft. Every motion must say *fast, precise, dependable* — like a pit-stop, not a fireworks show. **Fast IS the flex:** passing Core Web Vitals while looking this good is the technical show-off, because most awarded-looking sites fail CWV. We target CSSDA's achievable rubric (UI 40% / UX 30% / Innovation 30%) — a real product that converts, with one or two engineered "innovation" moments, not a Resn-style WebGL fever dream.

**Art direction:** dark, confident near-black base; **one** high-energy signal accent (electric/acid green or signal yellow — the Lando Norris lime is a proven 2025 reference); monospaced numerals for prices/timers (reads "engineered/precise"); two type families max — one expressive **variable display/grotesk** for kinetic headlines + one legible neo-grotesk (Inter var) for UI/body. Fluid type via `clamp()` (Utopia scale), every clamp max ≤ 2.5× its min (WCAG 1.4.4). **Brutalism is a trap for this brand** (it signals "art experiment," we need "trust + speed").

**The five signature moments to build (in priority order):**
1. **The Velocity Headline** — hero `<h1>` via GSAP **SplitText**, lines on a fast snap-in / soft-settle ease (`cubic-bezier(0.16,1,0.3,1)`-style), staggered for momentum. Reads as "arriving instantly." (This text is the LCP element — prerendered, not canvas.)
2. **The Same-Day Timer** (the award + sell moment) — a scroll-pinned sequence: input → rewrite → "Delivered," with a timestamp that **ScrambleText-races** to "Today." Literal proof of the same-day promise; this is both the signature interaction and the value prop.
3. **The Energy Surface** — one low-contrast full-bleed **OGL/GLSL flow-field** behind the hero that subtly accelerates with scroll velocity (faster scroll = faster flow = "speed"). Lazy-mounted **after** LCP; static CSS-gradient fallback on weak GPU / reduced-motion / touch.
4. **Magnetic flagship CTA** — only the **$59 Resume+LinkedIn** button is magnetic to the cursor (desktop, fine-pointer). Tiny delight, signals "we come to you."
5. **View-Transition handoff** — marketing → signup/checkout feels like one continuous instant product (View Transitions API: Baseline same-document as of 2026; degrades gracefully to instant swap).

**Section blueprint:** Hero (one-line benefit "Your resume + LinkedIn, rewritten. Today.", one primary CTA "Get my free teaser" + quiet "See pricing", trust strip: money-back · same-day · Neomorphic LLC, WY USA) → proof-of-speed timer → offer cards (Resume+LinkedIn $59 flagship elevated, Cover Letter $39, Landing copy $69, Bundle $79 "best value" badge, custom/quote) → social proof + guarantee restated → free-teaser→signup→Stripe path → legit footer.

**Non-negotiable guardrails (baked in):** GSAP `gsap.matchMedia("(prefers-reduced-motion: no-preference)")` gates every non-essential animation; DPR clamped to ≤1.5; WebGL deferred + offscreen-paused (IntersectionObserver + `visibilitychange`); Lenis desktop/fine-pointer only; AA contrast over the shader via a scrim; visible focus rings + skip-link + keyboard pass; `< 200KB gz` JS before hero interactive (GSAP fits; WebGL libs are deferred); targets **LCP ≤ 2.5s · INP ≤ 200ms · CLS ≤ 0.1** on a mid-tier Android. Degrade with dignity: reduced-motion / weak-GPU / no-JS users get a beautiful static version, never a broken one.

> Library note (Report 02): **GSAP and all its formerly-paid plugins (SplitText, ScrambleText, ScrollTrigger, MorphSVG, etc.) are 100% free including commercial use as of April 2025.** Use them. Prefer OGL over Three.js/R3F for the single shader surface (tens of KB vs ~1MB careless R3F). No R3F unless a concrete 3D idea justifies the bundle.

---

## 3. Reconciled DNS plan — FINAL record table (Hostinger receive + Gmail send-as + Resend send)

The crux (Reports 05, 07): **Hostinger receiving and Resend sending coexist with zero conflict because they live on different DNS names.** Hostinger owns the **apex** MX + SPF (receiving + Gmail send-as via `smtp.hostinger.com`); Resend owns the **`send.` subdomain** MX + SPF (transactional). "One SPF per name" is per-hostname — apex `@` and `send.` are different nodes, so **no SPF merge is needed** in the default flow. DKIM selectors differ (`hostingermail-*` vs `resend`) — never collide. One shared DMARC covers both.

**Mailbox/inbox architecture:** use Hostinger's **free bundled mailbox** for `contact@samedaydesk.com` → **forwarder** to `vanbarthelemy@gmail.com` (the operator reads it in Gmail) → Gmail **"Send mail as"** via `smtp.hostinger.com:465 SSL` (the operator replies/sends as `contact@`). **Critical 2026 gotcha (Report 07): Gmail removed POP3 "Check mail from other accounts" + Gmailify in Jan 2026 — do NOT rely on POP3; use the forwarder.** Send-as (outbound SMTP) is unaffected.

### FINAL DNS record table for `samedaydesk.com`

Replace `us-east-1` and all `p=…` DKIM blobs with the EXACT strings the Resend/Hostinger dashboards show.

| # | Type | Name / Host | Value | Priority | Purpose |
|---|---|---|---|---|---|
| 1 | MX | `@` | `mx1.hostinger.com` | 5 | Receive at `contact@` (Hostinger) |
| 2 | MX | `@` | `mx2.hostinger.com` | 10 | Receive (backup MX) |
| 3 | TXT (SPF) | `@` | `v=spf1 include:_spf.mail.hostinger.com ~all` | — | Authorize Hostinger send (covers Gmail send-as) |
| 4 | TXT/CNAME (DKIM) | `hostingermail-a._domainkey` | (auto from hPanel) | — | Hostinger DKIM A |
| 5 | TXT/CNAME (DKIM) | `hostingermail-b._domainkey` | (auto from hPanel) | — | Hostinger DKIM B |
| 6 | TXT/CNAME (DKIM) | `hostingermail-c._domainkey` | (auto from hPanel) | — | Hostinger DKIM C |
| 7 | MX | `send` | `feedback-smtp.us-east-1.amazonses.com` | 10 | Resend bounce/complaint feedback |
| 8 | TXT (SPF) | `send` | `v=spf1 include:amazonses.com ~all` | — | Resend SPF (subdomain only) |
| 9 | TXT (DKIM) | `resend._domainkey` | `p=MIGfMA0…` (Resend value) | — | Resend DKIM key |
| 10 | TXT (DMARC) | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@samedaydesk.com; fo=1; adkim=r; aspf=r;` | — | One shared policy (start at p=none) |

Notes:
- Rows 1–6 Hostinger (receive + human send-as), 7–9 Resend (transactional), 10 shared. **No name is duplicated** — the two SPFs (rows 3, 8) are on different hosts (`@` vs `send`), which is valid.
- Use Hostinger **"Connect automatically"** to write rows 1–6 in one click (domain is on Hostinger nameservers). Add rows 7–9 by hand exactly as Resend shows.
- Keep DMARC `aspf=r adkim=r` (relaxed) — Resend strict-DKIM-aligns and relaxed-SPF-aligns from the `send.` subdomain, so DMARC passes on DKIM. Do NOT set `aspf=s`.
- **SPF merge is only needed IF** you later send Resend mail from the apex `From` (`noreply@samedaydesk.com`). Avoid that; send Resend as `contact@samedaydesk.com` (DKIM-aligned) and leave apex SPF Hostinger-only. If ever forced to merge: one `v=spf1 include:_spf.mail.hostinger.com include:amazonses.com ~all` on `@` (one v=spf1, one ~all, under 10 lookups).
- DMARC progression: `p=none` → after ~1–2 weeks of clean `rua` reports → `quarantine` → `reject`.
- The Hostinger MCP (Report 08) is genuinely useful here to create rows 7–9 programmatically and verify — wire it just for this phase.

---

## 4. Integration approach (tuned to Express + Vite SPA)

**The three server-side gates (playbook README), enforced on every protected route:**
`requireAuth` (valid Firebase ID token) → `requireVerifiedEmail` (Phase 2 code confirmed) → payment (`paymentStatus:"paid"`, set ONLY by the server from a Stripe webhook/verify). UI mirrors these but never enforces them alone. **Trust nothing from the client for money or authorization.**

### Firebase (Report 03 + playbook)
- **Client** (`firebase@12`, `VITE_*` config — public, not secret): Email/Password + Google sign-in; attach `Authorization: Bearer ${await user.getIdToken()}` to every `/api/*` call (fresh, auto-refreshed; 1-hour token).
- **Server** (`firebase-admin@13`, modular subpath imports): `requireAuth` middleware calls `verifyIdToken()` (offline; pass `checkRevoked:true` only for sensitive ops like refunds). Init once at module scope; **base64 the service-account JSON** to avoid the `private_key` `\n` PEM gotcha.
- **Firestore `(default)` DB**, production mode, region `nam5` (US multi-region) chosen ONCE (immutable, and it pins the default Storage bucket location). Default-deny rules: users read only their own `users/{uid}`; client may create its own doc as `paymentStatus:"unpaid"` WITHOUT server-managed fields (`amountPaid`/`paidAt`/`role`); `orders` are owner-read, **write:false** (Admin SDK only). `emailVerifications` fully denied.
- **Storage** on **Blaze**, bucket `samedaydesk.firebasestorage.app`, per-user upload prefix `uploads/{uid}/…` with size/type caps (≤10MB, PDF/image). Budget alert mandatory.
- **Emulator Suite** for local dev (Auth 9099 / Firestore 8080 / Storage 9199, UI 4000), `--import/--export-on-exit`; `@firebase/rules-unit-testing` proves default-deny in CI. Rules in repo, deployed via `firebase deploy --only firestore:rules,storage` (keep `hosting` OUT of `firebase.json` — Hostinger owns the front door).

### Stripe (Report 04 + playbook)
- **Sandbox already connected:** `Neomorphic LLC sandbox` → `acct_1SAPeUPwY9LS48U1`. No new account needed; the Stripe MCP is authenticated to it.
- **Two flows, one idempotent `fulfill()`:** (A) on-site **Payment Element** (`PaymentIntent` + `confirmPayment({ redirect:"if_required" })`) is the primary checkout; (B) **Payment Links** (incl. operator "instant payment link" with inline `price_data` for custom quotes). A fulfills on `payment_intent.succeeded`, B on `checkout.session.completed`.
- **Server owns the money math:** client sends an **offer slug only**, never an amount. Server looks up cents, stamps `metadata:{uid,offer,amount}` (and `payment_intent_data.metadata` on links), and fulfillment re-validates against the slug. Offer map: `resume_linkedin` 5900, `cover_letter` 3900, `landing_copy` 6900, `bundle_all` 7900, `custom_quote` variable. Free teaser = no Stripe object (auth-gated). Money-back = `refunds.create`.
- **Webhooks authoritative:** `express.raw` before `express.json()`; `constructEvent`; return 2xx fast; **idempotent** fulfillment (deterministic `order_${uid}_${offer}` doc id + Firestore transaction) because webhook + verify-on-return + Stripe retries all hit it. CLI `whsec_` (local) ≠ dashboard `whsec_` (prod).
- **Appearance/fonts:** pass `appearance` + `fonts:[{cssSrc}]` to `<Elements>` so the iframe matches the brand.
- **Go-live = env swap only** (`pk_test`/`sk_test`/`whsec_` → live), plus register `samedaydesk.com` for Apple Pay/Link domain verification in live mode and re-seed live Products/Prices/Links.

### Resend (Report 05 + playbook)
- `resend@6.13` server-side only; `new Resend(RESEND_API_KEY)` once per process. SDK returns `{data,error}` (does NOT throw) — always check `error`.
- **react-email** templates (table-based, survive Outlook). Send from `SameDayDesk <contact@samedaydesk.com>` (verified domain), `replyTo` the same.
- **Idempotency key on every send:** `signup-welcome/${uid}`, `receipt/${paymentIntentId}`, `verify-code/${uid}/${codeBatchId}` (codeBatchId must change per re-issue or "resend code" silently no-ops).
- **Bounce/complaint webhook** at `/api/webhooks/resend` (raw body + Svix `wh.verify()`), maintain a Firestore `emailSuppressions` list, check before sends.
- **Phase 1 testing before DNS verifies:** `from:'onboarding@resend.dev'` → your own account email only; `delivered@/bounced@/complained@resend.dev` simulate events. Free tier 3,000/mo, 100/day.
- **Phase 2 verification code:** server-generated 6-digit, store **only sha256 hash salted with uid**, 10-min expiry, attempt cap (5), rate-limit resends, constant-time compare, never log plaintext. After verify, client `getIdToken(true)` to propagate `email_verified`. Gate behind a feature flag so Phase 1 ships without it.

---

## 5. Recommended tooling / CLIs / MCPs (Report 08)

**The lean kit — install these:**
```bash
npm install -g firebase-tools                 # auth, emulators, rules deploy, built-in MCP
brew install stripe/stripe-cli/stripe         # webhook tunnel + triggers (the one thing MCP can't do)
brew install gh                               # gh repo create … --push → Hostinger Git deploy
npm i resend @react-email/components          # app email
npm i -D @playwright/test @axe-core/playwright @lhci/cli
npx playwright install chromium
```

**MCP servers / agent tools:**
- **Firebase MCP** (built into `firebase-tools`, GA Oct 2025) — scope `--only auth,firestore,storage` (+ rules validation). Lean win, zero extra install.
- **Stripe MCP** — already connected to the sandbox; use for Products/Prices/Payment Links, docs, refunds, error decoding. Still need the **Stripe CLI** for the `stripe listen` webhook tunnel.
- **Chrome DevTools MCP** (already a plugin) — agent's "eyes": drive the live signup→pay flow, watch Stripe network/console, Lighthouse + perf traces, Stripe-iframe `fill` via frame context.
- **Hostinger MCP** — optional but genuinely useful **for the DNS/email phase** (create/verify rows 7–9 programmatically); idle otherwise. Needs a scoped API token.
- **Skip for the build:** Resend MCP, GitHub MCP (gh covers create+push) — add only if a real need appears.

**Analytics:** PostHog cookieless (`persistence:'memory'`, `person_profiles:'identified_only'`), ~5 events: `$pageview`, `signup_started`, `signup_completed`, `offer_selected` (with offer+price), `payment_succeeded` → one conversion funnel.

**Quality gates (one CI job):** build → start → Playwright signup→pay E2E (Stripe iframe via `frameLocator`, test card `4242…`, 3DS `4000 0027 6000 3184`) + axe a11y (`wcag2a/2aa/21a/21aa`) → Lighthouse CI on `/` (perf ≥0.9, a11y ≥0.95, LCP ≤2500ms, CLS ≤0.1). Green → Hostinger auto-deploys on merge to `main`.

---

## 6. Phased implementation plan (ordered; deliverables per phase)

> Order chosen so each phase is independently testable and the agent never blocks on DNS propagation or live keys. Email-without-verification ships first; the 6-digit code and live keys come last.

**Phase 0 — Scaffold & repo.** Vite React SPA + Express single-process skeleton; `package.json` (`engines.node 22.x`, build/start, `process.env.PORT`); raw-webhook-before-json wiring; health route; `gh repo create samedaydesk --private --push`. Firebase project to **Blaze**, Firestore `(default)`/`nam5`, Storage bucket `samedaydesk.firebasestorage.app`, add `localhost` to Authorized domains. **Deliverable:** running local single process, repo on GitHub.

**Phase 1 — Design & build the landing page (awwwards).** Prerendered marketing routes (real OG/meta + LCP text); "Engineered Speed" system — variable-font kinetic hero (SplitText), the Same-Day Timer (ScrambleText), OGL/GLSL energy surface (deferred), magnetic $59 CTA, View-Transition handoff; offer cards from the offer package; all motion gated by `matchMedia`, DPR ≤1.5, fallbacks. **Deliverable:** CWV-green, award-grade landing that converts; Lighthouse ≥0.9.

**Phase 2 — Auth.** Firebase client init (`firebase@12`); Email/Password + Google; Admin init (`firebase-admin@13`, base64 service account); `requireAuth`/`requireVerifiedEmail`/`requireAdmin` middleware; `users/{uid}` doc creation; default-deny `firestore.rules`/`storage.rules` + rules-unit-tests. **Deliverable:** sign up/in, server-verified ID tokens, default-deny proven in CI.

**Phase 3 — Email (no verification yet).** `resend@6.13`; react-email welcome + receipt templates; signup-notification send (idempotency keys); bounce/complaint webhook + suppression list; tested via `onboarding@resend.dev` + simulation addresses (DNS not required). **Deliverable:** transactional email working pre-DNS.

**Phase 4 — Payments in sandbox (full flow).** Seed 4 fixed Products/Prices + Payment Links in the connected sandbox (MCP) + committed Node seed script; server-authoritative PaymentIntent + Payment Element (brand appearance/fonts); Payment Links incl. operator instant-link; idempotent `fulfill()`; `stripe listen` webhook tunnel; run Report 04's full ordered test checklist (happy path, 3DS, declines, idempotency, links, custom quote, refund). **Deliverable:** end-to-end sandbox checkout green; one Playwright spec passes.

**Phase 5 — Deploy to Hostinger.** Business/Cloud plan; Node.js App from GitHub (settings in §1.3); env vars (no PORT); connect `samedaydesk.com` + auto-SSL; verify auto-deploy on push; post-deploy wiring (add prod domain to Firebase Authorized domains; register Stripe **dashboard** webhook `https://samedaydesk.com/api/stripe/webhook` → copy live-style `whsec_`; smoke-test). **Deliverable:** live site at samedaydesk.com on test keys.

**Phase 6 — Email + DNS (receive/forward/send-as + Resend).** Claim free Hostinger mailbox `contact@`; "Connect automatically" (rows 1–6); forwarder → Gmail + confirm; Gmail "Send mail as" SMTP; add Resend domain (rows 7–9) + DMARC (row 10); verify SPF/DKIM/DMARC pass for both senders. **Deliverable:** `contact@samedaydesk.com` receives→Gmail, sends-as via Gmail, Resend sends from the verified domain.

**Phase 7 — 6-digit verification code (Phase 2 email).** Hashed (sha256+uid salt), 10-min expiry, attempt cap, rate-limited resends, fresh `codeBatchId` per issue; flip `requireVerifiedEmail` on; client token refresh after verify. **Deliverable:** email-verified gate live.

**Phase 8 — Go live (real keys).** Swap Stripe + (if used) live env; register `samedaydesk.com` for Apple Pay/Link domain verification (live); re-seed live Products/Prices/Links; live Stripe webhook endpoint + secret; final Lighthouse/axe/Playwright pass; DMARC `none`→`quarantine`→`reject` over ~2 weeks. **Deliverable:** real payments accepted; production-hardened.

---

## 7. Top risks + open decisions for the human operator

### Top risks (with mitigations)
1. **SEO/OG on a Vite SPA** (the one stack gap) — mitigate with the prerender step on marketing routes; verify with a Slack/iMessage/Twitter scraper test before launch. If prerender proves fragile, the escape hatch is Next.js on the same Hostinger Node product.
2. **Hostinger plan tier** — Managed Node.js apps require **Business or Cloud** (not the cheapest shared). Confirm before building.
3. **Firebase Storage = Blaze required** — project must be on Blaze with a budget alert before any Storage use; otherwise 402/403.
4. **`private_key` newline / service-account escaping** — the #1 Admin-init failure; base64 the JSON env var to sidestep it entirely.
5. **Stripe webhook raw-body & secret crossing** — raw body must precede `express.json()`; CLI `whsec_` ≠ dashboard `whsec_`; align webhook endpoint API version with the SDK pin (`2026-05-27.dahlia`).
6. **DNS propagation + SPF footgun** — never put two `v=spf1` TXT on `@`; allow up to 24h; verify with `dig` before assuming misconfig.
7. **WebGL/motion perf regressions** — Lenis+shader can tank mid/low devices; keep WebGL deferred + offscreen-paused, DPR ≤1.5, reduced-motion fallbacks; Lighthouse CI as the gate.
8. **Gmail Jan-2026 POP3/Gmailify removal** — do not rely on POP3 to pull `contact@`; use the forwarder (send-as is unaffected).

### Open decisions needing the operator (human-only or judgment calls)
1. **Confirm the Hostinger plan is Business or Cloud** (Node.js apps) and that `samedaydesk.com` is attached. — *Operator action.*
2. **Attach a billing account to Firebase (Blaze) + set a budget alert** ($5/$20). — *Operator action (billing).*
3. **GitHub OAuth / Hostinger app authorization** for repo deploy. — *Operator must approve (auth).*
4. **All DNS/domain edits** in the Hostinger zone (rows 1–10). — *Operator approves; playbook says pause for DNS/billing.*
5. **Mailbox product + password:** confirm the plan bundles Hostinger Email vs Titan (records differ); set and store the `contact@` mailbox password (Gmail send-as needs it). — *Operator action.*
6. **Confirm operator inbox** `vanbarthelemy@gmail.com` for the forwarder + send-as, and click the two confirmation links (forwarder activation, Gmail send-as code). — *Operator action.*
7. **Stripe receipts:** decide whether Resend receipts **duplicate or replace** Stripe's built-in receipts (avoid double emails). — *Decision.*
8. **Go-live Stripe live keys** + live webhook secret + Apple Pay domain registration — moving real money. — *Operator approves/provides.*
9. **PostHog `identify()` of signed-in users (PII):** confirm consent posture / privacy-policy copy for EU traffic. — *Decision.*
10. **Accent color final pick** (acid green vs signal yellow) and the two font licenses (variable display + Inter var) for self-hosting. — *Brand decision.*

---

*End of synthesis. Build from this document; the eight deep reports (01–08) hold the long-form detail and inline source citations.*
