# h04-ap-route-reorder — equivalent reorder (synthetic-mechanism)

Caller-owned SDS-shaped catalogs `{schema, routes:[{path,canonical,title,robots?}]}`.

**Source kind:** `synthetic-mechanism`. Not extracted from `server/lib/spa-route-shells.js`. Not copied from `tools/route-table-diff/fixtures/*`. Not a duplicate of `h04-route-01` (useful-jobs add) or `h04-route-03` (copy-only).

## Mechanism

Same six identity records, different array order (non-reverse permutation):

| before index | after index | path |
| --- | --- | --- |
| 0 | 3 | `/kit/solana-pulse` |
| 1 | 5 | `/docs-lab/indexnow` |
| 2 | 0 | `/guides/agent-payments` |
| 3 | 4 | `/reports/observatory-capture` |
| 4 | 2 | `/research/cdp-bazaar` |
| 5 | 1 | `/lab/feed-agenda` (`robots: noindex,follow`) |

`path`, `canonical`, `title`, and `robots` are byte-identical per path. Homepage `/` is excluded.

## Oracle (raw catalogs, not engine stdout)

Identity set of `{path,canonical,title,robots}` is equal. Path sequence differs. Domain prediction: engine `outcome` is `permutation` (or `no-change` if order is ignored). `breaking` false. `usefulNoChange` true.

## CLI

```bash
cd /tmp/w5-h04/ro-m01
node experiments/wave5/m01/bin/run-job.mjs route-table-diff \
  --before <this-dir>/before.json \
  --after <this-dir>/after.json \
  --out-dir /tmp/w5-h04/h04-ap-route-runs/h04-ap-route-reorder
```

Composition SHA `a20232b0f777b0f737cdffefb64a9ca9d9c9ba0e`.

## Actual M01 run

`/tmp/w5-h04/h04-ap-route-runs/h04-ap-route-reorder`

- exit 0, `outcome.kind=analysis`, `analysis=permutation`
- `breaking=false`, `orderChanged=true`
- counts all zero; `tableDigest` before === after
- matches expected (`permutation`, useful no-change, not breaking)
