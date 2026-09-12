# h04-ap-route-params — colon vs brace path parameter spelling (synthetic-mechanism)

Caller-owned SDS-shaped catalogs `{schema, routes:[{path,canonical,title,robots?}]}`.

**Source kind:** `synthetic-mechanism`. Not extracted from `server/lib/spa-route-shells.js`. Not copied from `tools/route-table-diff/fixtures/*`. Not a duplicate of `h04-route-01` or `h04-route-03`. SDS crawler shells have no `:sku` / `{sku}` parameters.

## Mechanism

Stable route (identical both sides):

- path `/api/warehouse/status`
- canonical `https://h04-ap-route.test/api/warehouse/status`

Concrete parameter spelling change (raw path strings):

| side | path | canonical |
| --- | --- | --- |
| before | `/api/items/:sku` | `https://h04-ap-route.test/api/items/:sku` |
| after | `/api/items/{sku}` | `https://h04-ap-route.test/api/items/{sku}` |

`"/api/items/:sku" !== "/api/items/{sku}"` as UTF-8 strings. Oracle does not treat Express colon params and OpenAPI braces as one identity.

## Oracle (raw catalogs, not engine stdout)

- 1 path present only in before: `/api/items/:sku`
- 1 path present only in after: `/api/items/{sku}`
- 1 path unchanged: `/api/warehouse/status`
- If the engine keeps raw path strings distinct: added 1, removed 1, collisions 0, `breaking` true because of the removal.
- If the engine unified them: added 0, removed 0. Record whichever the engine actually does. Do not invent a merge.

## CLI

```bash
cd /tmp/w5-h04/ro-m01
node experiments/wave5/m01/bin/run-job.mjs route-table-diff \
  --before <this-dir>/before.json \
  --after <this-dir>/after.json \
  --out-dir /tmp/w5-h04/h04-ap-route-runs/h04-ap-route-params
```

Composition SHA `a20232b0f777b0f737cdffefb64a9ca9d9c9ba0e`.

## Actual M01 run

`/tmp/w5-h04/h04-ap-route-runs/h04-ap-route-params`

Engine treats colon vs brace as **two paths**, not one parameterized identity:

- exit 0, `outcome.kind=analysis`, `analysis=breaking`
- added `["/api/items/{sku}"]`
- removed `["/api/items/:sku"]`
- collisions 0
- `/api/warehouse/status` unchanged
- canonicals kept as `https://h04-ap-route.test/api/items/:sku` and `https://h04-ap-route.test/api/items/{sku}`

Matches the raw-string oracle (distinct paths ⇒ removal is breaking).
