# h04-ap-route-methods — method/handler records without canonical (synthetic-mechanism)

Caller-owned wrapper `{schema, routes:[...]}` whose records are `{method, path}` / `{method, path, handler}` with **no** `canonical` or `title`.

**Source kind:** `synthetic-mechanism`. Not extracted from `server/lib/spa-route-shells.js`. Not copied from `tools/route-table-diff/fixtures/*`. Not a duplicate of `h04-route-01` or `h04-route-03`.

## Mechanism

`before.json` records:

- `{ method: "GET", path: "/health" }`
- `{ method: "POST", path: "/webhooks/stripe", handler: "stripeWebhook" }`

`after.json` is the same shape with `GET /health` changed to `PUT /health`.

M01 `route-table-diff` catalog: accepted record is `{path, canonical, title, robots?}`. OpenAPI path maps and method/handler records refuse `unsupported_catalog`. This job does not invent SDS fields from unlike schemas.

## Oracle (raw catalogs, not engine stdout)

Raw keys on each record: `method` and `path` (plus `handler` on the webhook row). `canonical` absent. `title` absent. Domain prediction: refusal `unsupported_catalog`, exit 2, not an analysis of GET→PUT.

If the engine instead accepts the catalogs, record the actual analysis outcome. Do not invent a method-aware diff.

## CLI

```bash
cd /tmp/w5-h04/ro-m01
node experiments/wave5/m01/bin/run-job.mjs route-table-diff \
  --before <this-dir>/before.json \
  --after <this-dir>/after.json \
  --out-dir /tmp/w5-h04/h04-ap-route-runs/h04-ap-route-methods
```

Composition SHA `a20232b0f777b0f737cdffefb64a9ca9d9c9ba0e`.

## Actual M01 run

`/tmp/w5-h04/h04-ap-route-runs/h04-ap-route-methods`

- exit 2, `outcome.kind=refused`, `code=unsupported_catalog`
- engine did **not** accept the catalogs or emit a GET→PUT analysis
- error: `Framework route records need an SDS adapter. This job does not invent canonical or title from method, handler, or operationId fields.`
- detail `{ index: 0, path: "/health" }`
- promised `route-diff.json` / `route-diff.md` were not written (valid refusal, not incomplete delivery)

Matches expected `unsupported_catalog` refusal.
