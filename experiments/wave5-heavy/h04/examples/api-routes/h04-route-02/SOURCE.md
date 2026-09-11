# h04-route-02 — observatory Express API added

Caller-owned OpenAPI YAML translated from this repo's Express routers. Not copied from useful-jobs SAMPLE `samples/openapi/*` (museum/inventory). `used.json` pins method+path that appeared.

## SHAs

| Role | Full SHA | Subject |
| --- | --- | --- |
| before | `d4fec15d822bed6bdb98b6723bdbfbf88c9e5796` | Add read-only MoltJobs market-observations bridge for Neomorphic. |
| after | `8c1c4f706c75868d1556db483deff98d29758073` | S54: external agent-economy observatory bridge and capture CLI. |

`8c1c4f7^` is `d4fec15`. Repo: `epistemedeus/samedaydesk`.

## Before — no observatory mount

`git show d4fec15d822bed6bdb98b6723bdbfbf88c9e5796:server/index.js`

```js
app.use("/api", healthRouter);
app.use("/api/market-observations", marketObservationsRouter);
// no observatoryRouter
```

`git ls-tree --name-only d4fec15d822bed6bdb98b6723bdbfbf88c9e5796:server/routes` includes `market-observations.js` and `health.js`. There is no `observatory.js`.

`git show d4fec15d822bed6bdb98b6723bdbfbf88c9e5796:server/routes/health.js`:

```js
router.get("/health", (_req, res) => { /* ... */ });
```

Mounted at `/api` → public path `GET /api/health`.

`git show d4fec15d822bed6bdb98b6723bdbfbf88c9e5796:server/routes/market-observations.js`:

```js
export const BRIDGE_ROUTE = "/api/market-observations/moltjobs-stats";
router.get("/moltjobs-stats", async (req, res) => { /* ... */ });
```

Mounted at `/api/market-observations` → public path `GET /api/market-observations/moltjobs-stats`.

## After — observatory method+path appears

`git show 8c1c4f706c75868d1556db483deff98d29758073:server/index.js`

```js
import observatoryRouter from "./routes/observatory.js";
app.use("/api/market-observations", marketObservationsRouter);
app.use("/api/observatory", observatoryRouter);
```

`git show 8c1c4f706c75868d1556db483deff98d29758073:server/routes/observatory.js`

```js
export const OBSERVATORY_ROUTE = "/api/observatory";
router.get("/sources", (_req, res) => {
  return res.status(200).json(listCatalog());
});
router.get("/snapshot", async (_req, res) => {
  const snapshot = await runtime.observeAll();
  return res.status(200).json(snapshot);
});
router.get("/sources/:sourceId", async (req, res) => {
  /* 200 observation or 404 unknown_source */
});
```

Resolved public operations that appeared:

| Method | Path |
| --- | --- |
| GET | `/api/observatory/sources` |
| GET | `/api/observatory/snapshot` |
| GET | `/api/observatory/sources/{sourceId}` |

Unchanged used pins: `GET /api/health`, `GET /api/market-observations/moltjobs-stats`.

## Engine

SDS52 `api-upgrade-brief` at `aeef964fa188443078958d9d6d393afae1d542ee`:

```sh
node server/paid-useful-jobs/bin/cli.mjs run api-upgrade-brief \
  --before before.yaml --after after.yaml --used used.json \
  --funding unfunded --out-dir /tmp/w5-h04/h04-child-route-runs/h04-route-02
```
