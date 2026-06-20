# 08 — Tooling, MCP Servers, Analytics & Quality Gates

**Project:** samedaydesk.com (Neomorphic LLC) — awwwards-worthy landing + signup/payment site
**Stack:** single Node process (Express `/api/*` + built Vite SPA), Firebase Auth/Firestore/Storage, Stripe (Payment Element + Links + webhooks), Resend email, Hostinger deploy via GitHub auto-deploy.
**Date of research:** June 2026. All recommendations target current 2025–2026 tooling.

---

## TL;DR — The Lean Toolkit

| Need | Install / Use | Verdict |
|---|---|---|
| Firebase identity+data+rules+local testing | **Firebase CLI** (`firebase-tools`) | **Must.** Login, emulators, rules deploy, init. |
| Firebase agent introspection | **Firebase MCP** (built into CLI, GA Oct 2025) | **Yes, lean win.** Same binary, zero extra install. Run `--only auth,firestore,storage,rules`. |
| Stripe local webhook testing | **Stripe CLI** (`listen`/`trigger`) | **Must** for the signup→pay loop. |
| Stripe agent docs/resources | **Stripe MCP** (already connected) | **Already have it.** Use for docs + resource lookups; CLI for the runtime tunnel. |
| Transactional email | **Resend Node SDK** (`resend` v6.x) | **Must.** SDK in the server, not the MCP, for the app itself. |
| Resend agent ops | **Resend MCP** (official) | **Skip for build; optional for ad-hoc test sends.** The SDK covers app needs. |
| Repo create + push | **GitHub CLI** (`gh`) | **Must** — `gh repo create … --push` then wire Hostinger Git deploy. |
| GitHub agent ops | **GitHub MCP** (remote, OAuth) | **Optional.** `gh` covers create/push; add MCP only if you want PR/issue automation. |
| Hostinger automation | **Hostinger MCP** (official) | **Optional/nice-to-have** for DNS + deploy config; the dashboard Git-deploy is fine for one site. |
| Agent browser testing (observe) | **Chrome DevTools MCP** (already a plugin here) | **Yes.** Drives a real Chrome, runs the full signup→pay test, performance traces, console/network. |
| Agent browser testing (regression) | **Playwright** (`@playwright/test`) | **Yes, one spec.** Scripted, repeatable signup→pay E2E + a11y assertions. |
| Analytics / funnel | **PostHog** (plugin available) | **Yes, lean.** Cookieless web analytics + one conversion funnel. Cheaper privacy story than GA4. |
| Performance gate | **Lighthouse CI** | **Yes.** One workflow, budget on the landing page. |
| A11y gate | **`@axe-core/playwright`** | **Yes.** One assertion inside the existing Playwright spec. |

**The "earns its place" filter:** for a single small marketing+auth+payments site, the four CLIs (Firebase, Stripe, Resend SDK, gh) plus two browser-test tools (Chrome DevTools MCP + Playwright) plus PostHog + Lighthouse CI + axe are the whole kit. Everything else (Resend MCP, GitHub MCP, Hostinger MCP) is optional convenience the agent can reach for but shouldn't depend on.

---

## 1. Official CLIs / SDKs

### 1.1 Firebase CLI (`firebase-tools`) — MUST

Latest line is **v15.x** (v15.10.0 released March 2026; v14.23.0 was the late-2025 baseline). ([Firebase CLI release notes](https://firebase.google.com/support/release-notes/cli))

**Install & auth:**
```bash
npm install -g firebase-tools      # or: curl -sL https://firebase.tools | bash
firebase login                     # browser OAuth; for CI use FIREBASE_TOKEN / a service account
firebase projects:list             # confirm the right project
firebase use --add                 # alias the project (creates .firebaserc)
```

**Init only what we need** (avoid Hosting — we deploy the SPA via Hostinger, not Firebase Hosting):
```bash
firebase init firestore            # firestore.rules + firestore.indexes.json
firebase init storage              # storage.rules
firebase init emulators            # pick Auth, Firestore, Storage; set ports
```
This writes `firebase.json`, `.firebaserc`, `firestore.rules`, `storage.rules`. ([Manage & deploy Security Rules](https://firebase.google.com/docs/rules/manage-deploy))

**Local Emulator Suite** — this is the single most valuable Firebase tool for an AI builder, because it lets the agent exercise Auth + Firestore + Storage + default-deny rules with zero cloud cost or risk: ([Install & configure Emulator Suite](https://firebase.google.com/docs/emulator-suite/install_and_configure))
```bash
firebase emulators:start --only auth,firestore,storage
# Emulator UI typically on http://localhost:4000
# point the app at emulators via the Admin SDK / client SDK connect* helpers
```
In server code, gate emulator wiring behind an env flag (e.g. `FIRESTORE_EMULATOR_HOST=localhost:8080`, `FIREBASE_AUTH_EMULATOR_HOST=localhost:9099`). The Admin SDK auto-detects these vars.

**Rules deploy** (default-deny is the project rule — verify before each deploy):
```bash
firebase deploy --only firestore:rules,storage:rules
```
Test rules locally first with the emulator + `@firebase/rules-unit-testing` so default-deny is provably enforced before it ships.

**Gotchas:**
- Keep `firebase.json` `"hosting"` out of the file so nobody accidentally deploys the SPA to Firebase Hosting (Hostinger owns the front door).
- For CI/agent non-interactive use, prefer a service-account JSON + `GOOGLE_APPLICATION_CREDENTIALS` over the legacy `firebase login:ci` token.

### 1.2 Stripe CLI — MUST (for the webhook loop)

The Stripe CLI is the only sane way to test server-authoritative webhooks locally. ([Stripe CLI use guide](https://docs.stripe.com/stripe-cli/use-cli) · [Testing](https://docs.stripe.com/testing))

**Install & auth:**
```bash
brew install stripe/stripe-cli/stripe      # macOS
stripe login                               # browser pairing to your account (use a SANDBOX)
```

**Forward webhooks to the local Express server** (the app serves `/api/*`, so point at the webhook route):
```bash
stripe listen --forward-to localhost:PORT/api/stripe/webhook
# prints: "Ready! Your webhook signing secret is whsec_..."  -> put in .env as STRIPE_WEBHOOK_SECRET
```
The signing secret from `listen` is different from the dashboard secret — the server must verify with **this** `whsec_` while running locally.

**Trigger events to exercise the flow** (no real card needed):
```bash
stripe trigger payment_intent.succeeded
stripe trigger checkout.session.completed
stripe trigger payment_intent.payment_failed
stripe trigger charge.refunded
```
Scope forwarding with `--events checkout.session.completed,payment_intent.succeeded` to cut noise.

**Test cards for the embedded Payment Element** (test mode only; any future expiry, any CVC, any ZIP): ([Stripe testing](https://docs.stripe.com/testing))
- `4242 4242 4242 4242` — success, no auth
- `4000 0025 0000 3155` — requires **3D Secure** authentication (use this to prove the Payment Element handles the challenge)
- `4000 0000 0000 9995` — declined (insufficient funds)
- `4000 0000 0000 0002` — generic decline

> The connected **Stripe MCP** ships `stripe:test-cards` and `stripe:explain-error` skills plus doc-search tools — handy for the agent to pull the right card or decode an error mid-build without leaving the session.

**Gotcha:** prices must be **server-authoritative**. Never trust an amount from the client. Create Prices/Products in the sandbox (via dashboard or Stripe MCP `stripe_api_write`) and have the server look up the amount by product key ($59 resume+LinkedIn, $39 cover letter, $69 landing copy, $79 bundle). Webhooks, not client redirects, mark an order paid.

### 1.3 Resend Node SDK — MUST (in the app, not the MCP)

Latest `resend` npm is **v6.x** (v6.14.0 at time of research). ([resend on npm](https://www.npmjs.com/package/resend) · [resend-node](https://github.com/resend/resend-node))

```bash
npm i resend
```
```js
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

await resend.emails.send({
  from: 'SameDayDesk <contact@samedaydesk.com>',
  to: user.email,
  subject: 'Welcome to SameDayDesk',
  react: WelcomeEmail({ name }),   // React Email component -> auto-rendered to HTML
});
```
- **React Email** (`@react-email/components`, also by Resend) is the right templating choice — same React mental model as the SPA, components for signup, the later **6-digit verification code**, receipts. ([React Email + Resend](https://react.email/docs/integrations/resend))
- Send only from a **verified domain**. In the Resend dashboard → Domains → Add `samedaydesk.com`, then add the **MX + SPF (`include:_spf.resend.com`) + DKIM TXT + DMARC** records at the DNS provider; click Verify (propagation up to 24h). The `from:` domain must exactly match the verified domain. ([Managing domains](https://resend.com/docs/dashboard/domains/introduction) · [Email auth guide](https://resend.com/blog/email-authentication-a-developers-guide))

**`contact@samedaydesk.com` forwarding + send-as Gmail (separate from Resend):** Resend handles *outbound app mail*. Human two-way email at `contact@` is a *mail-hosting* concern — set up an email alias/forwarding (Hostinger email or a forwarder) to the Gmail inbox, then add **Gmail → Settings → Accounts → "Send mail as"** with the SMTP creds so replies come from `contact@samedaydesk.com`. Don't conflate the two; transactional (Resend) and human inbox (Gmail send-as) are different paths and can share the same authenticated domain.

### 1.4 GitHub CLI (`gh`) — MUST (for the Hostinger deploy pipe)

([GitHub CLI quickstart](https://docs.github.com/en/github-cli/github-cli/quickstart))
```bash
brew install gh
gh auth login            # HTTPS + browser
gh auth status           # verify

# from the project root, create the repo and push in one shot:
git init && git add -A && git commit -m "init"
gh repo create samedaydesk --private --source=. --remote=origin --push
```
Then in the **Hostinger** panel, connect GitHub, grant repo access, pick the branch, set **build command** and **output dir** (`dist` for Vite) + entry file (`server.js`/`index.js` for the Node process); pushes auto-deploy. ([Hostinger Git deploy](https://www.hostinger.com/support/1583302-how-to-deploy-a-git-repository-in-hostinger/) · [Hostinger Vite hosting](https://www.hostinger.com/web-apps-hosting))

**Gotcha:** the architecture is a *single Node process* (Express serving `/api/*` + built SPA), so on Hostinger this is a **Node.js web app**, not a static site. Set the entry file to the Express server and ensure the build step runs `vite build` before `node server.js`. Hostinger added GitHub-deploy vulnerability auto-patching in 2025 — leave it on.

---

## 2. MCP Servers — what to actually wire vs. use the CLI

> Principle: the **app** uses SDKs/CLIs. **MCP servers** are for the *agent* to introspect/act during the build. Add an MCP only when it removes real friction over the CLI. For this one site, the high-value adds are **Firebase MCP** and the already-connected **Stripe MCP**; the rest are optional.

### 2.1 Firebase MCP — RECOMMENDED (free; same binary)

GA'd **October 2025**, built directly into `firebase-tools` — no separate package. ([Firebase MCP GA](https://firebase.blog/posts/2025/10/firebase-mcp-server-ga/) · [Firebase MCP docs](https://firebase.google.com/docs/cli/mcp-server))

Claude Code config:
```json
{
  "mcpServers": {
    "firebase": {
      "command": "npx",
      "args": ["-y", "firebase-tools@latest", "mcp", "--dir", "/Users/plasmic/dev/web/samedaydesk", "--only", "auth,firestore,storage"]
    }
  }
}
```
- 30+ tools: Auth (user mgmt), Firestore CRUD/indexes, Storage, **Security Rules validation** (validate Firestore/Storage rules — great for proving default-deny), Realtime DB, Messaging, Crashlytics. Prompts like `firebase:init` / `firebase:deploy`.
- **All tools require auth** (CLI credentials or ADC) — safe-ish, but scope with `--only` so the agent can't touch services we don't use.
- **Why it earns its place:** lets the agent inspect/seed Firestore docs and validate rules in-loop without hand-writing scripts. Zero extra install since the CLI is already required.

### 2.2 Stripe MCP — ALREADY CONNECTED, use it

The session already has a Stripe MCP with `search_stripe_documentation`, `stripe_api_read/write/search`, `fetch_stripe_resources`, `create_refund`, `stripe_implementation_planner`, plus the `stripe:test-cards` / `stripe:explain-error` / `stripe:stripe-best-practices` skills.
- **Use it for:** creating/reading Products & Prices in the sandbox, planning the Payment Element integration, pulling current docs, decoding errors, issuing test refunds (money-back guarantee flow).
- **Still need the Stripe CLI** for the one thing the MCP can't do: the live `stripe listen` webhook tunnel to localhost. MCP = control-plane/docs; CLI = runtime event tunnel. Use both.

### 2.3 Resend MCP — OPTIONAL (SDK is the workhorse)

An **official Resend MCP** exists (npm, stdio + HTTP transports) covering send/list/get/cancel/update/batch, contacts, segments, inbound. ([Resend MCP](https://resend.com/docs/mcp-server) · [resend.com/mcp](https://resend.com/mcp))
- **Verdict: skip for the build.** The app sends mail via the SDK from server code; that's the only thing that ships. The MCP only helps if you want the agent to fire ad-hoc test emails or manage contacts conversationally — nice, not necessary for a single transactional flow. Add later if a marketing/contacts list materializes.

### 2.4 GitHub MCP — OPTIONAL

GitHub's **official** MCP server is now remote-hosted (OAuth, no Docker/token wrangling) or local via Docker `ghcr.io/github/github-mcp-server`. Note the old `@modelcontextprotocol/server-github` npm package is **deprecated as of April 2025** — don't use it. ([GitHub MCP repo](https://github.com/github/github-mcp-server) · [GitHub MCP guide](https://github.blog/ai-and-ml/generative-ai/a-practical-guide-on-how-to-use-the-github-mcp-server/))
- **Verdict: optional.** `gh` already does repo-create + push (the only git ops this project strictly needs). Add the remote GitHub MCP only if you want the agent to open PRs, manage issues, or read Actions logs conversationally. Remote OAuth flavor if you do — avoid the Docker/local-token path for a one-repo project.

### 2.5 Hostinger MCP — OPTIONAL (nice for DNS)

Official **`hostinger-api-mcp`** (npm, `npm i -g hostinger-api-mcp`) exposes Websites, VPS, **Domains incl. DNS**, email, subscriptions as tools. ([Hostinger MCP repo](https://github.com/hostinger/api-mcp-server) · [How to run it](https://www.hostinger.com/tutorials/how-to-run-hostinger-api-mcp-server))
- **Verdict: optional but genuinely useful for DNS.** The single most error-prone manual step in this build is DNS — Resend SPF/DKIM/DMARC TXT records, the `contact@` forwarding, and pointing `samedaydesk.com` at the deploy. If the domain is on Hostinger DNS, the Hostinger MCP lets the agent create those records programmatically and verify them, instead of clicking through the panel. Worth wiring *just for the DNS/email-setup phase*, then it can sit idle. Requires a Hostinger API token (scope it).

---

## 3. Local Dev + Automated Browser Testing for an AI Agent

The goal: the agent drives a real **signup → choose offer → pay → confirmation** flow and asserts it works. Two complementary tools.

### 3.1 Chrome DevTools MCP — RECOMMENDED (already a plugin in this session)

Google's official MCP (32k+ stars; ~29 tools across input automation, navigation, emulation, performance tracing, network, debugging). ([Chrome DevTools MCP](https://developer.chrome.com/blog/chrome-devtools-mcp)) It's **already available here** as `mcp__plugin_chrome-devtools-mcp_chrome-devtools__*` (including `lighthouse_audit`, `performance_start_trace`, `list_network_requests`, `list_console_messages`, `fill_form`, `navigate_page`).

Standalone config (for reference):
```json
{ "mcpServers": { "chrome-devtools": { "command": "npx", "args": ["chrome-devtools-mcp@latest"] } } }
```
**Use it to:** exploratory-drive the live flow, watch the Stripe network calls + console during checkout, catch CORS/token issues, run a **performance trace / Lighthouse audit** on the landing page, and verify the Payment Element renders. This is the agent's "eyes on the running app." The bundled `chrome-devtools-mcp:a11y-debugging` and `debug-optimize-lcp` skills are directly relevant to the awwwards-worthy + FAST goals.

### 3.2 Playwright — RECOMMENDED (one durable E2E spec)

For a **repeatable, committed regression test** (vs. the agent's one-off exploration), add Playwright. Industry framing: *Chrome DevTools MCP is for the agent to observe; Playwright is for the agent to act and re-run.* ([Driving vs. debugging](https://stevekinney.com/writing/driving-vs-debugging-the-browser))
```bash
npm i -D @playwright/test @axe-core/playwright
npx playwright install chromium
```
One spec covering the money path:
```ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('signup → pay → confirm', async ({ page }) => {
  await page.goto('http://localhost:PORT');
  // sign up (against Firebase Auth emulator)
  await page.getByRole('link', { name: /sign up/i }).click();
  await page.getByLabel('Email').fill('test+e2e@example.com');
  await page.getByLabel('Password').fill('Test123!pw');
  await page.getByRole('button', { name: /create account/i }).click();
  // pick the $59 flagship and pay with the Stripe Payment Element (test card)
  await page.getByRole('button', { name: /resume \+ linkedin/i }).click();
  const frame = page.frameLocator('iframe[name^="__privateStripeFrame"]');
  await frame.getByPlaceholder('1234 1234 1234 1234').fill('4242424242424242');
  await frame.getByPlaceholder('MM / YY').fill('12 / 34');
  await frame.getByPlaceholder('CVC').fill('123');
  await page.getByRole('button', { name: /pay \$59/i }).click();
  await expect(page.getByText(/payment received/i)).toBeVisible({ timeout: 15000 });
});

test('landing page has no critical a11y violations', async ({ page }) => {
  await page.goto('http://localhost:PORT');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
});
```
**Run the full local stack for testing** (one terminal each, or a `concurrently` script):
```bash
firebase emulators:start --only auth,firestore,storage   # identity+data spine, isolated
stripe listen --forward-to localhost:PORT/api/stripe/webhook   # webhook tunnel + whsec_
npm run dev    # or: vite build && node server.js  (single Node process serving SPA + /api/*)
npx playwright test
```
**Gotcha — Stripe iframes:** the Payment Element renders in cross-origin iframes; use `frameLocator` and target by placeholder/role. Test-mode card `4000 0025 0000 3155` to exercise the 3DS challenge path.

> One Playwright spec + Chrome DevTools MCP is the right amount. Do **not** add Playwright MCP on top — it overlaps Chrome DevTools MCP for the agent's interactive needs, and the committed `.spec.ts` covers regression. Two tools, no more.

---

## 4. Analytics / Observability — Lean Recommendation

**Recommendation: PostHog, configured cookieless, with exactly one conversion funnel.** PostHog is **already available as a plugin** in this environment, which removes setup friction and tips the call.

### Why PostHog over the alternatives here
- **Funnel/conversion is the whole point** of a paid-conversion site. PostHog gives true funnels (landing → signup → offer selected → paid), retention, and session replay in one tool. ([GA4 alternatives](https://posthog.com/blog/ga4-alternatives))
- **Plausible** is lovely and truly cookieless-by-default, EU-hosted, GDPR/CCPA/PECR clean — but its funnels are basic; "not ideal if funnel analysis is critical." Good if you want dead-simple privacy-first pageviews and nothing else. ([PostHog vs Plausible](https://vemetric.com/blog/posthog-vs-plausible))
- **Vercel Analytics** is a convenience product (pageviews/referrers, no PII, no consent) — but we're **not on Vercel** (Hostinger), and it has no funnels. Out.

### Make PostHog privacy-clean (do this from day one)
PostHog uses cookies by default; for a public marketing site, run it cookieless so you can skip or simplify the consent banner: ([PostHog cookieless tracking](https://posthog.com/docs/privacy/data-collection) · [GDPR compliance](https://posthog.com/docs/privacy/gdpr-compliance))
```js
posthog.init('<KEY>', {
  api_host: 'https://us.i.posthog.com',
  persistence: 'memory',          // nothing written to the visitor's device
  person_profiles: 'identified_only',  // anonymous until they actually sign up
  // or, to never need a banner at all: cookieless_mode: 'always' (note: disables identify())
});
```
- For **logged-out marketing traffic**: `persistence: 'memory'` + `person_profiles: 'identified_only'` → anonymous pageviews/funnel with no device storage, lightest consent burden.
- For **signed-in users** (post-signup), you *can* `identify()` to stitch the funnel to the customer — but that's PII, so gate it behind consent or your privacy policy. `cookieless_mode: 'on_reject'` lets you keep full tracking only after consent. ([cookieless tracking tutorial](https://posthog.com/tutorials/cookieless-tracking))
- Practically: ship a minimal consent notice (Neomorphic LLC is a US company but will get EU traffic), default to memory/anonymous, upgrade to identified only on consent or post-auth.

### What to actually instrument (keep it to ~5 events)
`$pageview` (auto), `signup_started`, `signup_completed`, `offer_selected` (with `offer` + `price` props), `payment_succeeded`. That's enough to build the one funnel that matters and compute conversion + drop-off per offer. Resist adding more until there's a question the data must answer.

> Skip heavier observability (error tracking, full session replay always-on) at launch — PostHog can turn replay on later if conversion debugging needs it. For a small site, server logs + Stripe dashboard + Firebase console cover the rest.

---

## 5. Performance & Quality Gates

The site *is* the proof of craft, so two automated gates are worth it; both are cheap.

### 5.1 Lighthouse CI — RECOMMENDED (performance budget on the landing page)
([Lighthouse + CI patterns](https://testingplus.me/how-to-integrate-lighthouse-playwright-performance-testing-2025-guide/))
```bash
npm i -D @lhci/cli
```
`lighthouserc.json`:
```json
{
  "ci": {
    "collect": { "url": ["http://localhost:PORT/"], "numberOfRuns": 3 },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.9 }],
        "categories:accessibility": ["error", { "minScore": 0.95 }],
        "categories:best-practices": ["warn", { "minScore": 0.9 }],
        "categories:seo": ["warn", { "minScore": 0.9 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }]
      }
    }
  }
}
```
GitHub Actions: checkout → setup-node → `npm ci` → build → `npm start &` → `npx lhci autorun`. Fails the PR if the landing page regresses below budget — directly enforces the "genuinely fast + award-worthy" requirement. The Chrome DevTools MCP `lighthouse_audit` tool gives the same insight interactively during the build; LHCI is the *gate* in CI.

### 5.2 axe accessibility — RECOMMENDED (one assertion, already wired above)
`@axe-core/playwright` is Deque's official integration; the a11y test in §3.2 with `wcag2a/wcag2aa/wcag21a/wcag21aa` tags is the right scope. ([axe + Playwright + CI](https://rishikc.com/articles/accessibility-testing-ci-integration/)) axe catches more real a11y issues than Lighthouse's a11y category, so they're complementary: **Lighthouse for the perf/SEO budget, axe for thorough a11y.** Both run in the same CI job as the Playwright E2E — no separate pipeline.

**Gate philosophy (lean):** one CI workflow → build → start server → (a) Playwright signup→pay + axe, (b) LHCI on the landing page. If all green, Hostinger auto-deploys on merge to `main`. That's the entire quality bar; don't add Percy/visual-regression/k6/etc. for a single marketing site unless a real problem shows up.

---

## Consolidated "install list" for the agent

```bash
# CLIs
npm install -g firebase-tools          # Firebase: auth, emulators, rules, MCP (built-in)
brew install stripe/stripe-cli/stripe  # Stripe webhook tunnel + triggers
brew install gh                        # repo create + push -> Hostinger Git deploy

# App deps
npm i resend @react-email/components
# (Firebase client + admin SDKs, Stripe SDK, Express, Vite per the app skeleton)

# Test/quality dev-deps
npm i -D @playwright/test @axe-core/playwright @lhci/cli
npx playwright install chromium
```
**MCP servers to register:** Firebase MCP (`--only auth,firestore,storage`); keep using the already-connected Stripe MCP and the Chrome DevTools MCP plugin; wire the PostHog plugin. Treat Resend/GitHub/Hostinger MCP as optional add-ons (Hostinger MCP only really pays off for the DNS/email-setup phase).

---

## Sources
- Firebase CLI release notes — https://firebase.google.com/support/release-notes/cli
- Firebase Security Rules manage/deploy — https://firebase.google.com/docs/rules/manage-deploy
- Firebase Emulator Suite install/config — https://firebase.google.com/docs/emulator-suite/install_and_configure
- Firebase MCP Server GA (Oct 2025) — https://firebase.blog/posts/2025/10/firebase-mcp-server-ga/
- Firebase MCP Server docs — https://firebase.google.com/docs/cli/mcp-server
- Stripe CLI use guide — https://docs.stripe.com/stripe-cli/use-cli
- Stripe testing / test cards — https://docs.stripe.com/testing
- Resend Node SDK (npm) — https://www.npmjs.com/package/resend ; repo — https://github.com/resend/resend-node
- React Email + Resend — https://react.email/docs/integrations/resend
- Resend domains / DNS — https://resend.com/docs/dashboard/domains/introduction ; auth guide — https://resend.com/blog/email-authentication-a-developers-guide
- Resend MCP — https://resend.com/docs/mcp-server ; https://resend.com/mcp
- GitHub CLI quickstart — https://docs.github.com/en/github-cli/github-cli/quickstart
- GitHub MCP server (official) — https://github.com/github/github-mcp-server ; guide — https://github.blog/ai-and-ml/generative-ai/a-practical-guide-on-how-to-use-the-github-mcp-server/
- Hostinger Git deploy — https://www.hostinger.com/support/1583302-how-to-deploy-a-git-repository-in-hostinger/ ; Node/Vite hosting — https://www.hostinger.com/web-apps-hosting
- Hostinger MCP — https://github.com/hostinger/api-mcp-server ; https://www.hostinger.com/tutorials/how-to-run-hostinger-api-mcp-server
- Chrome DevTools MCP — https://developer.chrome.com/blog/chrome-devtools-mcp
- Playwright vs Chrome DevTools MCP (driving vs debugging) — https://stevekinney.com/writing/driving-vs-debugging-the-browser
- axe-core + Playwright + CI — https://rishikc.com/articles/accessibility-testing-ci-integration/
- Lighthouse + CI guide — https://testingplus.me/how-to-integrate-lighthouse-playwright-performance-testing-2025-guide/
- PostHog vs Plausible — https://vemetric.com/blog/posthog-vs-plausible
- PostHog GA4 alternatives — https://posthog.com/blog/ga4-alternatives
- PostHog cookieless / GDPR — https://posthog.com/docs/privacy/data-collection ; https://posthog.com/docs/privacy/gdpr-compliance ; https://posthog.com/tutorials/cookieless-tracking
