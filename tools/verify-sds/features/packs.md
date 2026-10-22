# packs

Local acquisition packs: s176 record-repeat (OpenAPI / price-row / keyed CSV /
RSS), s185 distribution-repair (listing diagnosis), and s178 consumer-repeat
(evidence jobs). Files on disk only. No fetch, charge, or schedule. The $39
AI-readiness Fix Pack is **listed** on MCP, never purchased from this map.

| field | value |
| --- | --- |
| goal | local compare, listing diagnosis, and consumer evidence on caller files |
| entrypoint | `experiments/s176-record-repeat-package/bin/record-repeat.mjs`, `experiments/s185-distribution-repair-package/bin/distribution-repair.mjs`, `/kit/s178-consumer-repeat-kit.tgz` |
| command | `node bin/record-repeat.mjs sample --all`; `node bin/distribution-repair.mjs sample --positive` |
| state | labeled samples; HTML/malformed return JSON `ok:false` without inventing rows |
| tests | each package `"test": "node --test test/*.test.mjs"` |
| prerequisite | Node 22; no network; no Stripe |

## Surfaces

| id | kind | repo / public |
| --- | --- | --- |
| `packs.record-repeat.page` | page | `/for-agents/record-repeat` · `client/src/pages/RecordRepeat.tsx` |
| `packs.record-repeat.discovery` | machine | `/discovery/record-repeat.json` |
| `packs.record-repeat.kit` | archive | `/kit/record-repeat-job-ab84d79b0272.tar.gz` |
| `packs.record-repeat.cli` | cli | `experiments/s176-record-repeat-package/bin/record-repeat.mjs` |
| `packs.record-repeat.family.openapi-used-ops` | family | used-operation pin only |
| `packs.record-repeat.family.pricing-row-unit` | family | curated rows with units; HTML refused |
| `packs.record-repeat.family.csv-keyed-drift` | family | key required; duplicate keys blocked |
| `packs.record-repeat.family.rss-atom-brief` | family | corrections/dedup; non-feed HTML refused |
| `packs.distribution-repair.page` | page | `/for-agents/distribution-repair` |
| `packs.distribution-repair.discovery` | machine | `/discovery/distribution-repair.json` |
| `packs.distribution-repair.kit` | archive | `/kit/distribution-repair-ab84d79b0272.tar.gz` |
| `packs.distribution-repair.cli` | cli | `experiments/s185-distribution-repair-package/bin/distribution-repair.mjs` |
| `packs.consumer-repeat.page` | page | `/for-agents/consumer-repeat` |
| `packs.consumer-repeat.discovery` | machine | `/discovery/consumer-repeat.json` |
| `packs.consumer-repeat.kit` | archive | `/kit/s178-consumer-repeat-kit.tgz` |
| `packs.fix-pack.listed` | paid-listed | `server/lib/fixpack-artifact.js` · list only, never redeem |

## Sub-features

- `s176-sample` `sample --all` walks the four families.
- `s176-html` pricing HTML is `unsupported-pricing-format` (child may exit 0 with `ok:false`).
- `s185-positive` `sample --positive`.
- `s185-malformed` `diagnose examples/malformed.json` is `forbidden_claim`.
- s178 acquire verifies 718948 bytes and sha256 `04e9b6f382eedd91ae27b0d0faa68abbee7c26a1f06f52e415cb5a5884dfe05d`, then `bin/s178-cli.mjs list`.
- Fix Pack (`generate_complete_fix_pack`, $39) is a pack **name** on MCP `tools/list`. This map does not buy it, does not pass `cs_`, and does not call the tool.

## How to get to it (user POV)

- `/for-agents/record-repeat`, `/for-agents/distribution-repair`, `/for-agents/consumer-repeat`.
- Public kit tarballs under `/kit/`.
- Machine discovery under `/discovery/{record-repeat,distribution-repair,consumer-repeat}.json`.
- In-tree CLIs under `experiments/s176-record-repeat-package` and `experiments/s185-distribution-repair-package` for operators who already have the repo.

## Driving it from this map

Preconditions: Node 22. No network. No payment.

- **Map coverage.** `node tools/verify-sds/features/check-map.mjs --json`. `result.families` includes `packs`.
- **s176.** `node experiments/s176-record-repeat-package/bin/record-repeat.mjs sample --all`.
- **s185.** `node experiments/s185-distribution-repair-package/bin/distribution-repair.mjs sample --positive`.
- Product `ok:false` with child exit 0 is **not** verifier success unless the driver is explicitly proving a refuse.

## Gotchas

- s176/s185 HTML/malformed return JSON `ok:false` **exit 0**. Wrap to nonzero when the verifier is fed that seed.
- Isolate `--out-dir` / temp dirs; do not write into the package tree.
- s176 in-tree needs s134 + s163 (vendored or sibling). The public lean archive vendors them.
- Incomplete s185 captures cannot prove global unlisting.
- Do not confuse `/x402` (`client/src/pages/Mcp.tsx`) with these packs or with Express `/mcp`.
- Do not mutate payment/checkout/registry to "prove" the Fix Pack.
