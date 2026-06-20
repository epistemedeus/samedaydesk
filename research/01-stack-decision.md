# SameDayDesk — Web Stack Decision (Hostinger + GitHub auto-deploy)

**Date:** 2026-06-20
**Project:** samedaydesk.com — awwwards-worthy landing page + full signup/payment site for Neomorphic LLC
**Deploy target (hard constraint):** Hostinger, via GitHub auto-deploy
**Required integrations:** Firebase Auth + Firestore (+ Storage), Stripe (Payment Element + Payment Links + webhooks), Resend transactional email, custom domain email for contact@samedaydesk.com
**Builder:** solo autonomous AI agent with Chrome + computer control

---

## TL;DR — Decision

**Recommended: Option A — Next.js (App Router, latest 16.2.x LTS), deployed as a long-lived Node server on Hostinger's managed "Node.js / Web Apps Hosting."**

Why, in one breath: Hostinger now ships a **first-party, managed Node.js Web Apps product that auto-detects Next.js and runs `next start` as a persistent process** (there is a literal "Restart" button in hPanel for Next.js/Express server apps, and an official Hostinger starter repo with exact commands) — so the single biggest risk ("does `next start` cleanly run on Hostinger?") is **resolved: yes, no custom server needed.** Next.js gives SSR/SSG marketing pages with native `<head>`/Open-Graph metadata (best-in-class social previews), Route Handlers that handle **Stripe raw-body webhooks correctly via `await req.text()`** (no `bodyParser:false` hack), trivial Firebase Admin + Resend usage server-side, the dominant ecosystem for awwwards-grade React Three Fiber / GSAP frontends, and **one repo / one deploy / one process** that still satisfies the "single Node process" spirit of the existing playbooks.

**The only real cost** is that the existing playbooks are written for *Express + Vite SPA*; you trade `app.post('/api/...')` for `app/api/.../route.ts`. That is a mechanical port, and the security model (server verifies Firebase ID tokens, server-authoritative Stripe pricing, default-deny Firestore rules) transfers 1:1.

**Fallback: Option C (Vite SPA + single Express process)** — the literal existing playbook — if you want zero conceptual translation and are willing to add a prerender step for SEO/OG. It runs cleanly on the same Hostinger Node product (entry file `server.js`, output dir `dist`). **Astro (Option B) is the weakest fit here** and is not recommended for this specific project (rationale below).

---

## 0. The decisive Hostinger findings (these drive everything)

Hostinger materially changed its offering in 2025: alongside classic shared/VPS hosting, it launched **fully-managed "Node.js / Web Apps Hosting"** (available on Business web hosting + all Cloud plans + Agency), with **GitHub import + auto-deploy, framework auto-detection, and no YAML/manual config required.**

Key verified facts:

1. **Framework auto-detection list (official product page).** Hostinger explicitly auto-detects and supports, among others: **Next.js, Nuxt, Astro, SvelteKit, React Router, Hono (server)** and **React, Vue, Angular, Vite, Preact, Svelte, Astro (frontend/static)**; backend: **Next.js, Express.js, NestJS, Fastify, Nuxt, Astro.** If detection fails it falls back to an **"Other"** type you configure manually.
   Source: <https://www.hostinger.com/web-apps-hosting>

2. **Long-lived server vs static is an explicit distinction.** Server-side apps (**Express.js, Next.js, NestJS**) run a **persistent process** and get a **"Restart" button in hPanel** ("restart the server process directly… no full rebuild or redeployment needed"). Static front-ends (React/Vue/Angular/Vite-SPA) do **not** run a persistent process — they're served as static files. This confirms Hostinger keeps a **long-lived `next start` / `node server.js` process alive.**
   Sources: <https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/>, <https://www.hostinger.com/support/node-js-hosting-options-at-hostinger/>

3. **It is NOT serverless.** This is managed long-lived Node behind a reverse proxy — *not* Lambda-style functions. So there are **no cold-start / function-timeout caveats** for Stripe webhooks or long Resend calls, and **no per-invocation body-parsing quirks** beyond the framework's own. Hostinger injects a **`$PORT`** the app must bind to (bind `0.0.0.0`).

4. **Official Hostinger Next.js starter exists** (`deploy-nextjs` — published under Hostinger's org; a maintainer fork is mirrored at `agneliutkiene/deploy-nextjs`). It documents the exact deploy config (below).
   Source: <https://github.com/agneliutkiene/deploy-nextjs>

5. **GitHub auto-redeploy** is via webhook on push; private repos supported; env vars set in hPanel app settings (not committed). Hostinger also markets ZIP upload and "agentic"/IDE deploys.
   Source: <https://www.hostinger.com/web-apps-hosting>

> ⚠️ **Plan gotcha:** Node.js/server apps require **Business web hosting or a Cloud plan** (or VPS). They are **not** available on the cheapest shared plan, and a few docs note static-only Node hosting is gated to certain plans (e.g., Agency). Confirm the active plan supports "Node.js Apps" before relying on a persistent process. (Sources: same Hostinger support pages above.)

---

## 1. Option-by-option evaluation

Scoring each on the 7 requested axes. ✅ strong / ⚠️ caveat / ❌ weak.

### Axis 1 — Hostinger GitHub auto-deploy (preset, build/output/start, SSR caveats)

| | A. Next.js | B. Astro (+Node SSR / Express) | C. Vite SPA + Express |
|---|---|---|---|
| Auto-detected preset | ✅ "Next.js" (server) | ✅ "Astro" (static **or** server) | ⚠️ Vite detected as **static**; Express side detected as **"Express"/"Other"** server |
| Runs as | ✅ long-lived `next start` | ⚠️ static *or* long-lived `node entry.mjs` | ✅ long-lived `node server.js` |
| SSR caveat on Hostinger | ✅ none — first-party path, Restart button | ⚠️ SSR needs `@astrojs/node` **standalone**; you must wire `HOST`/`PORT` and pick *one* deploy unit | ✅ none — plain Node |
| One deploy unit? | ✅ yes | ❌/⚠️ "Astro + companion Express" = **two** deploy targets (awkward on Hostinger) | ✅ yes (Express serves SPA **and** /api) |

- **A — exact, from Hostinger's own starter:** install `npm ci`, build `npm run build`, **start `npm run start -- -p $PORT`**, Node **20 LTS**, env in hPanel. `next start` "supports all Next.js features"; ISR/SSR/Route Handlers all work when self-hosting via `next start`. Sources: <https://github.com/agneliutkiene/deploy-nextjs>, <https://nextjs.org/docs/app/guides/self-hosting>
- **B — Astro:** If you go **pure static** (SSG), it deploys like any static site (output `dist/`) — but then your "small companion Express" for Stripe/Firebase/Resend is a **second** Node deploy, which Hostinger treats as a separate app. If you go **SSR**, `@astrojs/node` in **standalone** mode builds `./dist/server/entry.mjs`, started with `HOST=0.0.0.0 PORT=$PORT node ./dist/server/entry.mjs`. Workable, but it's the only option that pushes you toward **two services or an awkward adapter+middleware combo**. Sources: <https://docs.astro.build/en/guides/integrations-guide/node/>
- **C — Vite+Express:** Express serves the built `dist/` SPA and `/api/*`. Hostinger config: output dir `dist`, **entry file `server.js`**, bind `process.env.PORT`. This is the cleanest possible mapping of the existing playbook. Source: <https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/>

**Winner: A** (single first-party preset, no adapter wiring). C is a close second.

### Axis 2 — SEO / social-preview for a marketing site

- **A — Next.js:** ✅ Best. App Router `metadata`/`generateMetadata` emit real `<title>`, description, and **Open Graph/Twitter tags in server-rendered HTML**; `app/opengraph-image.tsx` auto-generates social cards. Crawlers and the Slack/iMessage/Twitter scrapers see full HTML with no JS execution.
- **B — Astro:** ✅ Also excellent — zero-JS static HTML with full OG tags is Astro's core strength.
- **C — Vite SPA:** ❌ Out of the box, crawlers/scrapers see an **empty shell**; OG previews are blank unless you add a **prerender step** (`vite-react-ssg`/`vite-ssg`/`react-snap` or a prerender plugin) so the marketing routes ship static HTML with OG tags. Doable but it's an extra moving part you must not forget. Source: <https://ccbd.dev/blog/open-graph-react-seo-fix-social-previews-and-add-og-meta-tags-2026-guide>

**Winner: A ≈ B**, C needs extra work.

### Axis 3 — Awwwards-level animation / WebGL frontend

- **A — Next.js:** ✅ The **dominant** stack for award-grade React work: **React Three Fiber + drei + GSAP/ScrollTrigger + Framer Motion + Lenis**. Huge ecosystem, all the awwwards portfolio/site tutorials target React/Next. Heavy WebGL goes in client components (`'use client'`) while marketing copy stays server-rendered. Source: <https://www.awwwards.com/websites/three-js/>
- **B — Astro:** ⚠️ Possible via React/Solid **islands** (R3F/GSAP inside an island), and "zero-JS-by-default" is genuinely nice for the static parts — but Astro is **underrepresented** in heavy-WebGL award sites, and a full-screen persistent WebGL canvas + route transitions fights the islands model (you often end up with a near-SPA island anyway). More friction for *this* aesthetic goal.
- **C — Vite SPA:** ✅ Also first-class for R3F/GSAP (Vite is the default build tool many awwwards starters use); the whole app is client-side so a persistent canvas + page transitions are natural. Slightly worse for the *non-animated* marketing SEO story (see Axis 2).

**Winner: A** (ecosystem + SSR-for-copy / CSR-for-WebGL split). C strong for the animation itself.

### Axis 4 — Backend fit: Stripe webhooks (raw body) + Firebase Admin + Resend

- **Stripe raw-body webhook:**
  - **A — Next.js App Router:** ✅ Clean. In a Route Handler you call **`const body = await req.text()`** then `stripe.webhooks.constructEvent(body, sig, secret)`. App Router gives raw text by default — **no `export const config = { api: { bodyParser:false } }`** needed (that was the old Pages-Router hack). Sources: <https://maxkarlsson.dev/blog/verify-stripe-webhook-signature-in-next-js-api-routes>, <https://dev.to/thekarlesi/how-to-handle-stripe-and-paystack-webhooks-in-nextjs-the-app-router-way-5bgi>
  - **C — Express:** ✅ Equally clean with `express.raw({ type: 'application/json' })` on the webhook route only. The canonical, battle-tested pattern your playbooks already assume.
  - **B — Astro/companion Express:** ✅ Works (Astro API route can read raw body, or use the companion Express) — but you're verifying it across whichever of the two services owns it.
  - Because Hostinger runs a **persistent process (not serverless)**, there is **no function size/timeout/body-mangling risk** on any option.
- **Firebase Admin (verify ID tokens, Firestore/Storage writes):** ✅ Identical on all three — `firebase-admin` runs in any long-lived Node process. Server verifies the client's ID token, then does server-authoritative work. Initialize once at module scope; store the service-account JSON as an hPanel env var (base64) — never commit it.
- **Resend transactional email (signup, 6-digit codes):** ✅ Identical on all three — `resend` SDK, server-side, API key in env. Verify the **`samedaydesk.com` sending domain** (SPF/DKIM) in Resend; send from e.g. `noreply@samedaydesk.com` / `contact@samedaydesk.com`.

**Winner: tie A = C** (both textbook). All three are fully capable.

### Axis 5 — Dev velocity for a solo AI builder

- **A — Next.js:** ✅ Best for an AI agent: it is the **single most-represented framework in model training data**, file-system routing is unambiguous, one mental model (Server Components + Route Handlers), one repo, one deploy. Huge corpus of correct Stripe/Firebase/Resend-in-Next examples to imitate. Caveat: the App Router server/client boundary (`'use client'`) is the one place agents make mistakes.
- **B — Astro:** ⚠️ Most novel of the three (islands, content collections, adapter choice, plus a *second* service if you keep companion Express) → most surface area for an agent to get subtly wrong.
- **C — Vite+Express:** ✅ Very high velocity *and* it is **literally the existing playbook** — least translation. Two trivial mental models (a static SPA + a plain Express server).

**Winner: A ≈ C** (A for ecosystem density, C for zero-translation).

### Axis 6 — Reuse of existing Express-based playbooks

- **C — Vite+Express:** ✅✅ Perfect reuse. The playbooks *are* this. `/api/*` Express routes, ID-token verification middleware, server-authoritative Stripe pricing, webhook with `express.raw`, default-deny Firestore rules — all unchanged.
- **B — companion Express variant:** ✅ Reuses the Express backend verbatim, but bolts it onto Astro as a separate concern (two deploys).
- **A — Next.js:** ⚠️ **Conceptual reuse, mechanical rewrite.** The *architecture* (Firebase = identity/data spine, server verifies tokens, server-authoritative pricing, webhooks, default-deny rules) ports 1:1. The *code shape* changes: `app.post('/api/checkout', ...)` → `app/api/checkout/route.ts` exporting `POST`. Auth middleware becomes a shared `verifyIdToken()` helper called at the top of each handler (or Next middleware). This is the main tax of choosing A.

**Winner: C**, then B, then A.

### Axis 7 — Performance ("must look award-worthy yet FAST")

- All three can hit excellent Core Web Vitals. **A** and **B** ship server-rendered/static HTML for the marketing route (fast FCP/LCP, great Lighthouse) while deferring the WebGL bundle. **C** must prerender to match their first-paint SEO/FCP. Astro's "least JS by default" wins a synthetic Lighthouse contest for a *pure-content* page, but this site is **animation-heavy**, which erases most of that edge once the R3F/GSAP island loads.

---

## 2. Scorecard

| Axis (weight) | A. Next.js | B. Astro | C. Vite+Express |
|---|:--:|:--:|:--:|
| Hostinger auto-deploy (●●) | ✅✅ | ⚠️ | ✅ |
| SEO / social preview (●●) | ✅✅ | ✅✅ | ⚠️ (needs prerender) |
| Awwwards / WebGL (●●●) | ✅✅ | ⚠️ | ✅ |
| Backend: Stripe/Firebase/Resend (●●●) | ✅✅ | ✅ | ✅✅ |
| Dev velocity for AI agent (●●) | ✅✅ | ⚠️ | ✅✅ |
| Reuse Express playbooks (●) | ⚠️ | ✅ | ✅✅ |
| Performance (●) | ✅ | ✅✅ | ✅ |
| **Overall** | **🥇 Best** | **3rd** | **🥈 Strong fallback** |

**A wins** because it is the only option that is simultaneously: a **first-party Hostinger preset with a persistent process**, **SEO/OG-native**, the **dominant WebGL ecosystem**, and a **single repo/deploy** — with a clean Stripe-raw-body story. **B loses** mainly on the awkward "two services / adapter wiring" shape and weaker WebGL fit for *this* project. **C is the safe fallback** because it is the existing playbook verbatim and runs cleanly on the same Hostinger Node product — its only real gap is bolting on prerendering for SEO.

---

## 3. Recommended exact Hostinger settings (Option A — Next.js)

**hPanel → Websites → Add Website → Node.js Apps → Import Git Repository → authorize GitHub → pick repo.** Hostinger should auto-detect **"Next.js."** Review/confirm:

```
Framework:        Next.js (auto-detected)
Node version:     20 LTS  (22 LTS also fine; match next.config engines)
Install command:  npm ci
Build command:    npm run build           # i.e. "next build"
Start command:    npm run start -- -p $PORT   # i.e. "next start -p $PORT"
Output / dir:     .next                    # (only relevant if it asks; server app)
Branch:           main  (auto-redeploy on push)
```

`package.json` scripts:
```json
{
  "scripts": {
    "build": "next build",
    "start": "next start"
  }
}
```

**Bind to the injected port** — Hostinger sets `$PORT`; the `-p $PORT` flag above handles it. (For a custom server you'd read `process.env.PORT` and listen on `0.0.0.0`.)

**`next.config` note:** Plain `next start` is the recommended Hostinger path and supports SSR/ISR/Route Handlers natively — you do **not** need `output: 'standalone'`. Only adopt `output: 'standalone'` (start `node .next/standalone/server.js`) if you later want a slimmer deploy; if you do, update the Hostinger start command accordingly. Source: <https://nextjs.org/docs/app/guides/self-hosting>

**Environment variables (hPanel → app settings, never committed):**
```
# Firebase Admin (server)
FIREBASE_SERVICE_ACCOUNT_B64   # base64 of the service-account JSON
# Firebase client (public)
NEXT_PUBLIC_FIREBASE_API_KEY, ...AUTH_DOMAIN, ...PROJECT_ID, ...STORAGE_BUCKET, ...APP_ID
# Stripe
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
# Resend
RESEND_API_KEY
NEXT_PUBLIC_SITE_URL=https://samedaydesk.com
```

**Stripe webhook Route Handler (raw body — the part everyone gets wrong):**
```ts
// app/api/stripe/webhook/route.ts
import Stripe from 'stripe';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs'; // ensure Node runtime (firebase-admin, raw body)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const body = await req.text();                 // RAW body — do not parse first
  const sig = req.headers.get('stripe-signature')!;
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return new Response('Invalid signature', { status: 400 });
  }
  // handle event.type ... (fulfill order, write Firestore via firebase-admin)
  return new Response('ok', { status: 200 });
}
```
This works because App Router hands you the raw text via `req.text()`; no `bodyParser:false` config is needed. Sources: <https://maxkarlsson.dev/blog/verify-stripe-webhook-signature-in-next-js-api-routes>, <https://github.com/vercel/next.js/issues/60002>

**Then in Stripe Dashboard:** add endpoint `https://samedaydesk.com/api/stripe/webhook`, copy the signing secret into `STRIPE_WEBHOOK_SECRET`. For local/sandbox testing use `stripe listen --forward-to localhost:3000/api/stripe/webhook` and run the full flow against Stripe **test mode**.

**Custom email (`contact@samedaydesk.com`):** Hostinger DNS for the domain — add an **email forward** to your Gmail (and configure Gmail "send-as" with SMTP) for human mail; separately verify the domain in **Resend** (SPF + DKIM TXT records) for transactional sending. Keep these two paths distinct.

---

## 4. Fallback (Option C — Vite SPA + single Express) exact Hostinger settings

If you prefer zero playbook translation:

```
Framework:        Express / "Other" (server app)
Node version:     20 LTS
Install command:  npm ci
Build command:    npm run build           # vite build -> ./dist
Output directory: dist
Entry file:       server.js
Start:            node server.js  (listen on process.env.PORT, host 0.0.0.0)
```
`server.js` serves the built `dist/` SPA (with SPA fallback to `index.html`) and mounts `/api/*`. **Add the Stripe webhook with `express.raw({ type: 'application/json' })` on that route only.** For SEO/OG, add a prerender step (`vite-react-ssg` or a prerender plugin) for the marketing routes so scrapers get static HTML with OG tags. Sources: <https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/>, <https://ccbd.dev/blog/open-graph-react-seo-fix-social-previews-and-add-og-meta-tags-2026-guide>

---

## 5. Current versions (June 2026) & a few named libraries

- **Next.js 16.2.x** — current stable/LTS line (16.2.9 released 2026-06-09; ~400% faster `next dev`, Turbopack default). Sources: <https://nextjs.org/blog/next-16-2>, <https://versionlog.com/nextjs/16/>
- **Astro 6** — stable since March 2026 (Astro 5.17 also production-ready). Sources: <https://astro.build/blog/whats-new-may-2026/>, <https://alexbobes.com/programming/a-deep-dive-into-astro-build/>
- **Vite 6/7** ships under Astro 6 and modern Vite SPA setups.
- **Awwwards frontend kit:** `@react-three/fiber` + `@react-three/drei` + `gsap` (ScrollTrigger) + `framer-motion` + `@studio-freight/lenis` (smooth scroll). Source: <https://www.awwwards.com/websites/three-js/>
- **Stripe:** `stripe` (Node) + `@stripe/react-stripe-js` / `@stripe/stripe-js` for the embedded Payment Element; Payment Links for the low-friction path.

---

## 6. Risks & mitigations (Option A)

| Risk | Likelihood | Mitigation |
|---|---|---|
| Hostinger plan doesn't include Node Apps | Med | Verify Business/Cloud plan supports "Node.js Apps" before building; upgrade if not |
| Agent mis-places `'use client'` boundary | Med | Keep WebGL/interactive in clearly-named client components; marketing copy server-side |
| Webhook signature fails (body re-encoded) | Low | Use `await req.text()` + `runtime='nodejs'`; never `req.json()` first |
| `firebase-admin` cold init / multi-instance | Low | Init once at module scope; Hostinger runs a single persistent process (no serverless fan-out) |
| Playbook rewrite effort (Express→Route Handlers) | Med | Architecture is unchanged; only the route file shape differs — port helpers once, reuse everywhere |

---

## 7. Sources

- Hostinger Node.js / Web Apps Hosting (framework auto-detect list, GitHub deploy): <https://www.hostinger.com/web-apps-hosting>
- Hostinger — How to add a Node.js Web App (steps, output dir/entry file, Restart button, static-vs-server): <https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/>
- Hostinger — Node.js hosting options (plans, persistent vs static): <https://www.hostinger.com/support/node-js-hosting-options-at-hostinger/>
- Hostinger official Next.js starter (exact install/build/start, Node 20): <https://github.com/agneliutkiene/deploy-nextjs>
- Next.js self-hosting (next start supports SSR/ISR/Route Handlers; standalone): <https://nextjs.org/docs/app/guides/self-hosting>
- Next.js 16.2 release: <https://nextjs.org/blog/next-16-2> ; version lifecycle: <https://versionlog.com/nextjs/16/>
- Stripe webhook raw body in App Router: <https://maxkarlsson.dev/blog/verify-stripe-webhook-signature-in-next-js-api-routes>, <https://dev.to/thekarlesi/how-to-handle-stripe-and-paystack-webhooks-in-nextjs-the-app-router-way-5bgi>, <https://github.com/vercel/next.js/issues/60002>
- Astro Node adapter (standalone, HOST/PORT, entry.mjs): <https://docs.astro.build/en/guides/integrations-guide/node/>
- Astro 6 / 2026 status: <https://astro.build/blog/whats-new-may-2026/>, <https://alexbobes.com/programming/a-deep-dive-into-astro-build/>
- SPA SEO / OG prerender vs SSR: <https://ccbd.dev/blog/open-graph-react-seo-fix-social-previews-and-add-og-meta-tags-2026-guide>
- Awwwards Three.js gallery (ecosystem evidence): <https://www.awwwards.com/websites/three-js/>
