# h04-ap-route-dup — duplicate path after SDS identity (synthetic-mechanism)

Caller-owned SDS-shaped catalogs `{schema, routes:[{path,canonical,title,robots?}]}`.

**Source kind:** `synthetic-mechanism`. Not extracted from `server/lib/spa-route-shells.js`. Not copied from `tools/route-table-diff/fixtures/*`. Not a duplicate of `h04-route-01` or `h04-route-03`.

## Mechanism

`before.json` has four unique paths:

- `/inventory/bins`
- `/inventory/lots`
- `/inventory/holds`
- `/inventory/cycle-counts` (`robots: noindex,follow`)

`after.json` keeps those four records and appends a second `/inventory/lots` row with a different title and canonical (`https://h04-ap-route.test/inventory/lots-alias`). Raw path string `/inventory/lots` appears twice.

## Oracle (raw catalogs, not engine stdout)

After-side path multiplicity: `/inventory/lots` count 2. Unique path set is unchanged. Domain prediction: analysis `outcome=breaking`, `breaking=true`, collisions listed for path `/inventory/lots`. Must not be a crash or `unsupported_catalog` refusal. `usefulNoChange` false.

## CLI

```bash
cd /tmp/w5-h04/ro-m01
node experiments/wave5/m01/bin/run-job.mjs route-table-diff \
  --before <this-dir>/before.json \
  --after <this-dir>/after.json \
  --out-dir /tmp/w5-h04/h04-ap-route-runs/h04-ap-route-dup
```

Composition SHA `a20232b0f777b0f737cdffefb64a9ca9d9c9ba0e`.

## Actual M01 run

`/tmp/w5-h04/h04-ap-route-runs/h04-ap-route-dup`

- exit 0, `outcome.kind=analysis`, `analysis=breaking` (not a crash, not a refusal)
- `ok: true`, `breaking: true`, `counts.collisions: 1`
- collision `{ kind: "path", side: "after", path: "/inventory/lots", indexes: [1, 4] }`
- added/removed/changed/titleOnly all empty
- matches expected (breaking analysis with listed collision)
