# Deploying to Hostinger from GitHub (static site OR Node app)

Hostinger **Business/Cloud** plans deploy straight from GitHub and **auto-redeploy
on every push to `main`** (hPanel → the website shows "Connected with GitHub" +
an **Auto-deployment** badge, with a **Deployments** tab). This covers both kinds
of site. Paste this to the agent and say *"deploy per this doc via Chrome
control"* — the **AGENT RUNBOOK** at the bottom is written for that.

---

## Key fact: it's a JavaScript-app pipeline

Hostinger's "Deploy from GitHub" detects a framework from **`package.json`** and
runs a **build → output directory** (and, for servers, a **start command**).
A bare repo with no `package.json` is rejected with *"Unsupported framework or
invalid project structure."* So even a hand-authored static site needs a minimal
`package.json` + build.

Supported presets include: Angular, Astro, Express, Fastify, Hono, NestJS,
Next.js, Nuxt, Parcel, React, React Router, Svelte, SvelteKit, Vite, Vue.js, and
**Other**. Pick the matching preset, or **Other** for custom setups.

---

## A. Static site (hand-authored HTML/CSS/JS, no real build)

Give Hostinger the structure it expects; the "build" is just a file copy.

`package.json`:
```json
{ "name": "site", "private": true, "scripts": { "build": "node build.js" } }
```

`build.js` (Node built-ins only — copies deployable files into `dist/`, leaving
internal docs out of the published site):
```js
const fs = require("fs"), path = require("path");
const out = path.join(__dirname, "dist");
const SITE = ["index.html","favicon.svg","apple-touch-icon.png",".htaccess","styles","scripts","fonts","assets"];
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out);
for (const i of SITE) { const s = path.join(__dirname, i); if (fs.existsSync(s)) fs.cpSync(s, path.join(out, i), { recursive: true }); }
console.log("built dist/");
```

`.gitignore`: add `dist/` and `node_modules/`.

**Wizard settings:** Framework **Other** · Branch **main** · Node **22.x** ·
Root **`./`** · Build **`npm run build`** · Output **`dist`** · Start command
**empty** (it's static) · Auto-deployment **ON**.

Optional `.htaccess` in the output (LiteSpeed honors it): deny serving internal
files, set cache headers, basic security headers. Version asset URLs
(`main.css?v=N`) so deploys bust browser/CDN caches.

---

## B. Node app (Express API + SPA, with Firebase/Resend/Stripe)

Single Node process serves the API at `/api/*` and the built SPA otherwise
(see the Express wiring below). One repo, one app on Hostinger.

**`package.json` (the deployed app)** needs:
- `"build"`: install/build the SPA **and** bundle the server into one output dir.
- `"start"`: the entry Hostinger runs (e.g. `node dist/app.mjs`).
- `"engines": { "node": ">=22" }`.

**Wizard settings:** Framework **Other** (or Express) · Branch **main** ·
Node **22.x** · Root **`./`** (or the app subfolder in a monorepo) · Build
**`npm run build`** (or `pnpm…`) · Output the folder containing the server entry ·
**Start command** set (e.g. `node app.mjs`) · Auto-deployment **ON**.

**Env vars:** add every server var in hPanel → the website → **Environment
variables** (do **not** set `PORT` — Hostinger injects it). For this stack:
`NODE_ENV=production`, `PUBLIC_URL`, all `FIREBASE_*`, `FIREBASE_SERVICE_ACCOUNT_KEY`,
`STRIPE_*`, `RESEND_*`, `JWT_SECRET`, `ADMIN_*`. Client `FIREBASE_*`/
`STRIPE_PUBLISHABLE_KEY` must be present **at build time** (the bundler bakes them
into the SPA, usually as `VITE_*`/`NEXT_PUBLIC_*`).

**Serving the SPA from the API process** (Express) — and the **raw-body webhook
caveat**:
```ts
// raw body for Stripe BEFORE express.json()
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }), (req,_r,n)=>{ (req as any).rawBody = req.body; n(); });
app.use(express.json());
app.use("/api", apiRouter);
if (process.env.NODE_ENV === "production") {
  app.use(express.static(SPA_DIST, { extensions: ["html"], setHeaders: (res, f) => {
    if (f.endsWith(".html")) res.setHeader("Cache-Control","no-cache");
    else if (f.includes("/_astro/") || /\.[0-9a-f]{8}\./.test(f)) res.setHeader("Cache-Control","public, max-age=31536000, immutable");
    else res.setHeader("Cache-Control","public, max-age=3600");
  }}));
}
```
Lock **CORS** to `PUBLIC_URL` in production (or rely on same-origin since the SPA
is served by the same process).

---

## Ongoing deploys (both kinds)

```bash
git add -A && git commit -m "…" && git push origin main
```
Hostinger rebuilds and republishes automatically. Watch the **Deployments** tab.

## Verify (from the shell)

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://DOMAIN/             # 200
curl -sS -o /dev/null -w "%{http_code}\n" https://DOMAIN/api/health   # node app
# static: confirm internal docs aren't served (expect 404):
curl -sS -o /dev/null -w "%{http_code}\n" https://DOMAIN/reference/
```

## Caching gotchas

- Favicons cache hard — bump `favicon.svg?v=N` and hard-refresh.
- Unhashed `css/js` that redeploy over themselves: version their URLs (`?v=N`) or
  serve them `no-cache`; cache **hashed** asset filenames `immutable`.
- Stale page after deploy → hPanel → **Cache → Clear cache** + hard refresh.

## First-time setup notes

- **One GitHub account per hosting plan** — all GitHub-deployed sites on that plan
  use it. Authorize Hostinger's GitHub app once.
- Domain/SSL/CDN/email live at the **plan/domain** level, independent of the
  website's files — removing/replacing a website's files doesn't delete them
  (but back up first and verify before deleting anything live).
- Retiring an old folder-uploaded site: back up → connect GitHub + deploy →
  verify the new site is live → *then* remove old files. Never before.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Unsupported framework / invalid project structure" | No `package.json`; add the build shim, push, hit refresh ↻ in the repo picker. |
| Build fails | Open the deploy **log**; check build command + output dir + Node version. |
| CSS/fonts 404 | Output directory wrong (static: must be `dist`). |
| Node app 502 / won't boot | Check **Start command**, `engines`, and that env vars are set; read **Runtime logs**. |
| Stripe webhook 400 "bad signature" | Raw body not mounted before `express.json()`, or wrong `STRIPE_WEBHOOK_SECRET`. |
| Firebase Admin init fails | `FIREBASE_SERVICE_ACCOUNT_KEY` newline/quote escaping — parse defensively or base64 it. |
| Stale assets after deploy | Version asset URLs / clear Hostinger cache. |

---

## AGENT RUNBOOK (Chrome control)

Use the **chrome-devtools MCP** (`…__navigate_page`, `…__take_snapshot`,
`…__click`, `…__fill`, `…__wait_for`, `…__take_screenshot`). Assume the user is
logged into hPanel.

1. Make the repo deployable first (static: `package.json` + `build.js`→`dist`;
   node: `build`/`start` scripts). Commit + push **before** touching hPanel.
2. `take_snapshot`; prefer snapshot UIDs over pixel clicks.
3. hPanel → Websites → Add Website → **Node.js Apps / Deploy from GitHub** →
   Import Git Repository → pick the repo (refresh ↻ if it shows stale structure).
4. On **Review build settings**, set: Framework **Other**, Branch **main**,
   Node **22.x**, Root **`./`**, Build **`npm run build`**, Output (**`dist`** for
   static; server-entry dir for node), Start (empty for static; set for node).
5. Add **Environment variables** (node app) before/just after first deploy.
6. Click **Deploy**; poll the **Deployments** tab with `wait_for` until *Completed*.
7. Verify: `navigate_page` to the domain, `take_screenshot`, and check
   `list_network_requests` for 200s (and `/api/health` for node apps).

**Pause and hand to the user for:** GitHub **OAuth / app authorization**;
**deleting/overwriting** a live site (only after the new deploy verifies);
anything touching **billing, domains, or DNS**.

Shell verification without Chrome: `curl -I https://DOMAIN` and the curls above.
