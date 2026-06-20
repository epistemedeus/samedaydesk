# Hostinger Node.js Deployment from GitHub — Current (2025–2026) Runbook

**Research date:** 2026-06-20
**Target:** Deploy the SameDayDesk app (Express serving `/api/*` + a built Vite SPA, single Node process) to **samedaydesk.com** on Hostinger, from GitHub, with auto-deploy on push to `main`.

---

## TL;DR / Decision Summary

- **The internal playbook is essentially CORRECT and matches the current UI**, with naming nuances. The flow is: hPanel → **Websites → Add Website → Node.js Apps → Import Git Repository → Authorize GitHub → pick repo + branch → review auto-detected framework/build settings → add env vars → Deploy**. Auto-deploy on push to `main` is built in. ([Hostinger: add a Node.js Web App](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/))
- **MAJOR 2025 CHANGE — this is now possible on shared hosting.** Hostinger launched **"Node.js Web Apps Hosting"** (a *managed*, persistent-server product) in **November 2025**, and in **December 2025** rolled it down to the **Business** shared plan (up to **5** Node apps) and **Cloud** plans (up to **10** apps). This product **runs a real long-lived Node server** behind an NGINX reverse proxy — it is **NOT** static-export-only. ([Hostinger 2025 product updates](https://www.hostinger.com/blog/product-updates-2025); [HostingDiscussion news](https://hostingdiscussion.com/news/hostinger-brings-node-js-into-shared-hosting-signals-shift-toward-simpler-web-app-deployment/))
- **IGNORE older "Next.js/Node can only be static-exported on Hostinger shared hosting" advice.** That was true *before* this product existed. Many 2024-era blog posts (and even some current SEO blogspam) still say "you need a VPS for SSR" — **that is now outdated** for the managed Node.js Web Apps product. SSR/ISR/API routes and persistent Express servers work. ([Hostinger Next.js hosting](https://www.hostinger.com/web-apps-hosting/nextjs-hosting))
- **Plan needed for SameDayDesk:** **Business** web hosting (cheapest tier that supports Managed Node.js apps, ~$3.99/mo promo) is sufficient for one Express+SPA app. Cloud plans give more apps/resources. **A VPS is NOT required** for the SameDayDesk single-process Express+SPA app.
- **Supported Node versions:** **18.x, 20.x, 22.x, 24.x** (selectable). Use **22.x** (active LTS in 2026) for SameDayDesk. ([build-error troubleshooting](https://www.hostinger.com/support/fix-failed-to-build-application-error-hostinger-node-js/))
- **Port:** The platform runs NGINX on 80/443 and reverse-proxies to your app's port. **Your app MUST listen on `process.env.PORT`** (do not hardcode 3000). For Next.js the documented start command is `npm run start -- -p $PORT`. ([deploy-nextjs guide](https://github.com/hostinger/deploy-nextjs))

---

## 1. Which plan tier is required?

| Plan | Managed Node.js apps? | App limit | Notes |
|---|---|---|---|
| Single / Premium (shared) | ❌ No | — | Node.js Web Apps not available |
| **Business** (shared) | ✅ Yes | **5** | Minimum tier. Sufficient for SameDayDesk. ~$3.99/mo promo. |
| **Cloud Startup** | ✅ Yes | **10** | More CPU/RAM, dedicated resources |
| Cloud Professional / Enterprise | ✅ Yes | 10 | Higher resources |
| Agency Hosting | ⚠️ Static front-end only | — | "exported as static files, no persistent server-side process" — NOT what we want |
| **VPS** | ✅ (self-managed) | unlimited (your box) | Root access, CloudPanel templates, full control. Needed only for heavy/long-running/WebSocket-heavy workloads or custom system deps |

**Sources:** [Node.js hosting options at Hostinger](https://www.hostinger.com/support/node-js-hosting-options-at-hostinger/); [Hostinger 2025 product updates](https://www.hostinger.com/blog/product-updates-2025); [HostAdvice Node.js review](https://hostadvice.com/hosting-company/hostinger-reviews/hostinger-nodejs-hosting-review/).

**Recommendation for SameDayDesk:** **Business plan** is enough. The app is one Node process (Express + built SPA). If you later add many background jobs, websockets, or need more than ~512MB–1GB RAM headroom, move to **Cloud Startup** or a **VPS**. Buy/confirm the plan includes (or attach) the **samedaydesk.com** domain.

---

## 2. Persistent server vs static? (Critical)

**The Managed Node.js Web Apps product runs a persistent, long-lived Node server.** NGINX listens on 80/443 and forwards public traffic to your Node process on an internal port (read from `process.env.PORT`). There is a **Restart** button in the dashboard for server-side apps, which only makes sense because it's a real server. ([deploy doc](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/))

- **Express + built SPA (SameDayDesk):** ✅ Fully supported. The Express process stays running, serves `/api/*` and the static SPA, and is reverse-proxied.
- **Next.js SSR (`next start`):** ✅ Supported on this product. Hostinger publishes an official [deploy-nextjs](https://github.com/hostinger/deploy-nextjs) starter; the page explicitly states "SSR, ISR, and API routes work as expected." You do **NOT** need a VPS just to run `next start`. (You would need a VPS only if you outgrow shared resource limits.) ([Next.js hosting](https://www.hostinger.com/web-apps-hosting/nextjs-hosting))
- **Static-only path** still exists for front-end frameworks (Vite/React/Vue build → served as static), but that's a separate mode; we want the server mode for Express.

> **Gotcha — outdated info everywhere:** Search results are polluted with 2023–2024 articles saying "Hostinger shared hosting can't run `next start`, use a VPS / use static export / use Phusion Passenger." Those predate the Nov 2025 Managed Node.js product. Verify against the official `hostinger.com/web-apps-hosting/*` and `support/...node-js...` pages, not third-party blogs.

---

## 3. Supported Node.js versions

Selectable versions: **18.x, 20.x, 22.x, 24.x**. ([build-error doc](https://www.hostinger.com/support/fix-failed-to-build-application-error-hostinger-node-js/); confirmed in the Add-Node.js-App flow).

- **Use Node 22.x** for SameDayDesk (active LTS through 2026; Firebase Admin SDK, Stripe SDK, Vite all support it).
- **Match `engines` in `package.json`** to the selected version — a mismatch is a documented build-failure cause. Example:
  ```json
  { "engines": { "node": "22.x" } }
  ```
- You can change the Node version later via **Dashboard → Settings** (article: "How to select the Node.js version for your application").

---

## 4. Build / Output / Start command specifics

During setup Hostinger **auto-detects the framework** and pre-fills fields. Supported detected frameworks (Jun 2026):

- **Frontend (static build):** React, Vue.js, Angular, Vite, Parcel, Preact, Next.js, Nuxt.js, Astro, Svelte, SvelteKit
- **Backend (server process):** Next.js, Express.js, NestJS, Nuxt.js, Fastify, Astro, SvelteKit
- If detection fails → framework = **"Other"** (you can also pick "Other" manually).

([supported list](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/))

Key fields in the UI:
- **Build command** — npm build script (e.g. `npm run build`). Visible in a **Build settings** dropdown.
- **Output directory** — folder of generated build files. Common values: `dist`, `build`, `out`, `.next`. (Used to locate static assets.)
- **Entry file** — the file that starts the server. Defaults to `app.js`, derived from your `package.json` `start` script. Only required for server apps / "Other".
- **Install command** — defaults to `npm install` (or `npm ci` if a lockfile is present).
- **Branch** — defaults to `main`.

### 4a. Express + built Vite SPA (SameDayDesk — RECOMMENDED SHAPE)

This is the single-process shape your playbook assumes. Make the Express server build the SPA and serve it.

**`package.json` (root):**
```jsonc
{
  "name": "samedaydesk",
  "type": "module",
  "engines": { "node": "22.x" },
  "scripts": {
    // build the Vite SPA into ./dist (client), tsc/compile server if needed
    "build": "npm --prefix client install && npm --prefix client run build",
    // start the single Node process; MUST read process.env.PORT
    "start": "node server/index.js"
  }
}
```

**`server/index.js` (the load-bearing PORT + SPA-fallback bits):**
```js
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// API routes
app.use("/api", apiRouter);

// Serve the built Vite SPA (adjust path to your build output)
const clientDist = path.resolve(__dirname, "../client/dist");
app.use(express.static(clientDist));

// SPA fallback — send index.html for any non-API route (client-side routing)
app.get("*", (req, res) => res.sendFile(path.join(clientDist, "index.html")));

// CRITICAL: bind to the platform-provided port
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`SameDayDesk listening on ${port}`));
```

**Hostinger fields to enter:**
- Framework: **Express.js** (or "Other" if it won't auto-detect the monorepo)
- Branch: **main**
- Build command: **`npm run build`**
- Output directory: **`client/dist`** (or leave default if Express serves it itself — for a server app the entry file matters more than output dir)
- Entry file: **`server/index.js`**
- Install command: **`npm install`** (default)
- Node version: **22.x**

> **Stripe webhook caveat:** Stripe webhook verification needs the **raw** request body. Mount `express.raw({ type: "application/json" })` on the webhook route *before* any global `express.json()`. This is app-level, not Hostinger-specific, but it's the most common 400 you'll hit after deploy.

### 4b. Next.js (if you ever choose Next instead of Vite+Express)

Per Hostinger's official [deploy-nextjs](https://github.com/hostinger/deploy-nextjs) guide:
- Framework: **Next.js** (auto-detected)
- Build command: **`npm run build`**
- Start command (documented): **`npm run start -- -p $PORT`** — i.e. `next start` bound to the injected `$PORT`.
- Output directory: **`.next`**
- `next.config.mjs`: review `images.domains`, headers, rewrites. `output: 'standalone'` is **optional** (it's for minimal containerized bundles where you avoid `npm install`); on this managed product `npm run build` + `next start` is the supported default path.
- Verify locally first: `npm run build` succeeds AND `npm run start -- -p 3000` boots.

---

## 5. Environment variables

Two ways, both at the **environment-variables step during deployment** (and editable later):

1. **Import from `.env` file** (recommended — added Dec 2025): paste contents or upload `.env`; review; **Confirm**.
2. **Manual entry**: click **Add**, enter `KEY` and `value` per row; **Confirm**.

Format: `KEY=value`, e.g. `NODE_ENV=production`, `STRIPE_SECRET_KEY=...`, `FIREBASE_PROJECT_ID=...`, `RESEND_API_KEY=...`.

**Notes / gotchas:**
- Env vars are **not stored in your repo** (good — keep secrets out of GitHub).
- **Editing env vars later requires a redeploy** to take effect (Dashboard → Settings & Redeploy, or push to `main`). Article: "How to edit or add environment variables after deployment."
- **Do NOT set `PORT` yourself** — the platform assigns it and injects `process.env.PORT`. Hardcoding a port will break the reverse proxy.
- For Firebase Admin, prefer a single `FIREBASE_SERVICE_ACCOUNT_JSON` (stringified) var or individual `FIREBASE_*` vars rather than committing a key file.
- Vite client-side vars (`VITE_*`) are baked at **build** time, so they must be present **before** `npm run build` runs. Server secrets (Stripe secret, Resend, Firebase Admin) are read at **runtime**. Set both in Hostinger env vars.

**Sources:** [add env vars during deployment](https://www.hostinger.com/support/how-to-add-environment-variables-during-node-js-application-deployment/); [2025 product updates](https://www.hostinger.com/blog/product-updates-2025).

---

## 6. Domain (samedaydesk.com) + free SSL

- **Connect domain:** hPanel → **Websites** list → **Connect domain** next to the Node.js app (or **Website Dashboard → Connect domain**). Enter `samedaydesk.com`, confirm.
- If the domain is **registered at Hostinger / on the plan**, it attaches directly. If registered elsewhere, point DNS (A/CNAME records, or Hostinger nameservers) per on-screen instructions.
- **Free SSL is automatic:** "SSL certificates will be installed automatically" once the domain connection completes. No manual CSR.
- **Timeline:** up to **24 hours** for DNS propagation; app stays reachable on the temporary Hostinger URL meanwhile.
- Add both `samedaydesk.com` and `www.samedaydesk.com` (set one to redirect to the other).

**Source:** [connect a custom domain to a Node.js application](https://www.hostinger.com/support/how-to-connect-a-custom-domain-to-a-node-js-application/).

> **Stripe/Firebase/Resend follow-ups after domain is live:** add the production domain to Firebase Auth **Authorized domains**, set Stripe webhook endpoint to `https://samedaydesk.com/api/stripe/webhook`, and verify the sending domain in Resend (DKIM/SPF DNS records added in Hostinger DNS zone).

---

## 7. Auto-deploy on push to `main`

- Built in. After you connect the repo and select branch `main`, **every push to that branch triggers a rebuild**: Hostinger pulls latest, runs install + build, and restarts the app. ([deploy doc](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/))
- This is wired via a GitHub **webhook** Hostinger installs when you authorize the GitHub App. If auto-deploy ever stops, check **repo → Settings → Webhooks** for the Hostinger payload URL (content type `application/x-www-form-urlencoded`, "Just the push event"); re-authorize via "How to update GitHub repository permissions for Node.js hosting."
- **Manual redeploy:** Dashboard → **Deployments** (or **Settings & Redeploy** → Redeploy).
- **One GitHub account per hosting plan:** all Node.js sites on that plan share the same connected GitHub account. Connect the account that owns the SameDayDesk repo (or has access).

---

## 8. Logs — where to look

- **Build / deployment logs:** Websites → **Dashboard** → **Deployments** (sidebar) → click the **❯** arrow on a deployment → scroll to **Build logs**. Shows install + build script output.
- **Runtime / server logs (app booted but errors):** **File Manager** → app root (the `nodejs` folder) → open **`stderr.log`**. Also a "How to use Node.js Runtime logs at Hostinger" article and a note that an **empty `stderr.log`** can mean the app is healthy or never logged to stderr.
- Dashboard also shows **last deployment status + timestamp** and **CPU / RAM / I/O** graphs.

**Sources:** [troubleshoot failed deployment using build logs](https://www.hostinger.com/support/how-to-troubleshoot-a-failed-node-js-deployment-using-build-logs/); Help Center Node.js index.

---

## 9. Common failure modes & fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| **"Failed to build the application"** | Build script error, missing dep, Node version mismatch | Read **Build logs** (Deployments → ❯). Ensure `package.json` has correct `build`/`start`; match selected Node version to `engines`; don't commit `node_modules` in ZIP. ([build-error doc](https://www.hostinger.com/support/fix-failed-to-build-application-error-hostinger-node-js/)) |
| **"Unsupported framework" / detected as "Other"** | Monorepo or non-standard layout; detector can't find framework | Manually select framework (Express.js) or "Other", set **Entry file** (`server/index.js`) and **Output directory** explicitly. Make sure `package.json` is at the configured root. |
| **502 / 503 / app won't load after a successful build** | App didn't bind to `process.env.PORT`, crashed on boot, or missing runtime env var | Check **`stderr.log`** runtime logs. Ensure `app.listen(process.env.PORT)`. Confirm all runtime env vars set (Firebase/Stripe/Resend keys). Hit **Restart**. |
| **Module not found at runtime** | Dep in `devDependencies` not installed in prod, or build output path wrong | Move runtime deps to `dependencies`; verify Output directory; check the SPA `index.html` path in the Express static handler. |
| **Env var change had no effect** | Env vars require redeploy | Edit vars, then **Redeploy** (or push to main). |
| **`VITE_*` value undefined in browser** | Set after build / not present at build time | Vite vars are baked at build; set them before deploy, then rebuild. |
| **Stripe webhook 400 "signature verification failed"** | Body parsed before raw capture | Use `express.raw()` on the webhook route ahead of `express.json()`. |
| **Auto-deploy stopped firing** | Webhook removed / GitHub perms changed | Re-authorize GitHub; check repo Settings → Webhooks. |

---

## 10. EXACT ORDERED RUNBOOK (agent driving Chrome)

> Pre-req: SameDayDesk repo pushed to GitHub on branch `main`, with `package.json` `start` script reading `process.env.PORT`, `engines.node = "22.x"`, and a `build` script that builds the SPA. A **Business** (or Cloud) Hostinger plan is active with **samedaydesk.com** available.

1. Go to **https://hpanel.hostinger.com/** and log in.
2. Top nav → **Websites**.
3. Click **Add Website** (or **+ Create or migrate a website**).
4. Choose **Node.js Apps** (Managed Node.js Web App).
5. Select **Import Git Repository** (not "Upload files").
6. Click **Authorize** → complete the **GitHub App** OAuth → grant access to the SameDayDesk repo (or all repos). Return to hPanel.
7. **Select repository** = the SameDayDesk repo. **Branch** = **`main`**.
8. Review **auto-detected framework**. If it shows Express.js, keep it; if "Other", select **Express.js** (or **Other**) manually.
9. Set **build settings**:
   - **Build command:** `npm run build`
   - **Output directory:** `client/dist` (or your SPA build folder; leave default if the server serves it)
   - **Entry file:** `server/index.js`
   - **Install command:** `npm install` (default)
10. **Node.js version:** select **22.x**.
11. **Environment variables:** click **Import from .env file** and paste the production `.env` (or **Add** rows manually). Include `NODE_ENV=production`, Stripe secret + webhook secret, Firebase Admin creds, Resend API key, and any `VITE_*` public vars. **Do NOT add `PORT`.** Click **Confirm**.
12. Click **Deploy**. Wait for the build to finish (watch the live log).
13. If build fails → **Deployments → ❯ → Build logs**; fix; push to `main` (auto-redeploys) or click **Redeploy**.
14. Once "Deployment successful": open the temporary URL to smoke-test.
15. Attach domain: **Websites** list → **Connect domain** next to the app → enter `samedaydesk.com` → confirm. Add `www` variant. Follow any DNS instructions (if domain is on Hostinger, it auto-attaches).
16. **SSL** provisions automatically — wait until the padlock shows on `https://samedaydesk.com` (can take up to 24h for DNS; usually faster).
17. Verify **auto-deploy**: make a trivial commit to `main`, push, and confirm a new entry appears under **Deployments** and redeploys.
18. Post-deploy wiring (outside Hostinger): add `samedaydesk.com` to **Firebase Auth → Authorized domains**; set Stripe webhook to `https://samedaydesk.com/api/stripe/webhook` and copy its signing secret into Hostinger env vars (then **Redeploy**); add Resend DKIM/SPF DNS records in Hostinger's DNS zone for `contact@samedaydesk.com`.
19. If the app loads blank / 502: open **File Manager → app root → `stderr.log`**, fix the runtime error (usually a missing env var or non-`PORT` bind), **Redeploy** / **Restart**.

---

## 11. Sources

- [How to add a Node.js Web App in Hostinger](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/)
- [Node.js hosting options at Hostinger](https://www.hostinger.com/support/node-js-hosting-options-at-hostinger/)
- [Hostinger 2025 product updates (Node.js launch Nov, Business-plan rollout Dec, .env import)](https://www.hostinger.com/blog/product-updates-2025)
- [Hostinger brings Node.js into shared hosting (HostingDiscussion news)](https://hostingdiscussion.com/news/hostinger-brings-node-js-into-shared-hosting-signals-shift-toward-simpler-web-app-deployment/)
- [Hostinger Next.js hosting (SSR/ISR/API routes supported)](https://www.hostinger.com/web-apps-hosting/nextjs-hosting)
- [hostinger/deploy-nextjs — official Next.js starter + start command `npm run start -- -p $PORT`](https://github.com/hostinger/deploy-nextjs)
- [How to add environment variables during Node.js deployment](https://www.hostinger.com/support/how-to-add-environment-variables-during-node-js-application-deployment/)
- [How to connect a custom domain to a Node.js application (auto SSL)](https://www.hostinger.com/support/how-to-connect-a-custom-domain-to-a-node-js-application/)
- [How to troubleshoot a failed Node.js deployment using build logs](https://www.hostinger.com/support/how-to-troubleshoot-a-failed-node-js-deployment-using-build-logs/)
- [How to fix "Failed to build the application" (Node versions 18/20/22/24)](https://www.hostinger.com/support/fix-failed-to-build-application-error-hostinger-node-js/)
- [How to deploy a Node.js application (tutorial — entry file, start script)](https://www.hostinger.com/tutorials/deploy-node-js-application)
- [Node.js Help Center index (full article list: custom domain, env vars, redeploy, version, GitHub perms)](https://www.hostinger.com/support/hpanel/node-js/)
- [HostAdvice — Hostinger Node.js hosting review 2026](https://hostadvice.com/hosting-company/hostinger-reviews/hostinger-nodejs-hosting-review/)

---

### Verification needed at build time (open questions)
- Exact NGINX→app port injection: confirmed app must read `process.env.PORT`; the precise default/value is platform-assigned and best confirmed by logging it on first boot.
- Whether the monorepo (separate `client/` Vite + `server/` Express) auto-detects as Express.js or "Other" — confirm in the Add-App wizard; if "Other", set Entry file + Output directory manually.
- Per-plan resource ceilings (RAM/CPU) for Business vs Cloud Startup are not published as hard numbers; validate under real load and upgrade to Cloud/VPS if the Node process is OOM-killed.
