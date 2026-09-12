# H6D RESULT — useful-job real corpus distribution

Parent native session: `01a09456-c82b-7b41-ad58-e5557da52ed3`  
Model: `grok-4.6` · effort `xhigh`  
Branch: `codex/wave6-h6d-20260912`  
Baseline pin: `ad9bc7b448cf1f635ff1488affbe206aaf981ac0`  
Owned path: `experiments/wave6/h6d-real-consumers/`  
useful-jobs **1.4.0** `2575215` bytes sha256 `2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f`

Cash $0. No merge/deploy. No purchase authority. Engines unmodified.

## Capacity (one-shot boundaries, no recurring monitor)

| Boundary | MemAvailable | availablePct | concurrent |
| --- | --- | --- | --- |
| pre-admit 12 | 10522716 kB | 64.17% | 0 |
| after spawn 12 | 10445792 kB | 63.70% | 12 |
| expand-to-16 | 10406428 kB | 63.46% | 16 |
| completion | 10409564 kB | 63.48% | 16 claimed |

Peak concurrent **16**. Reserve stayed well above 25%; wave-2 pages were admitted.

## Tests

`NODE_OPTIONS=--max-old-space-size=768 node --test test/*.test.mjs consumers/*/test/*.test.mjs`

| Suite | pass | fail |
| --- | --- | --- |
| integrated parent + 16 consumers | **173** | **0** |
| consumer RESULT.json claimed | 162 | 0 |

All 16 consumers `testsPass: true`. Catalog `ready: 16`.

## Children

| id | family | job | source | tests | child session |
| --- | --- | --- | --- | --- | --- |
| L01-commander-lockfile | lockfile | lockfile-pin-delta | `tj/commander.js` 9098b4863ef7… → d785d8b3b944… | 6 | `01a09460-9b10-7690-9e59-a735507c071e` |
| L02-yargs-lockfile | lockfile | lockfile-pin-delta | `yargs/yargs` 4153e0f097ae… → 8878a894111e… (registry pins identical; local version only) | 6 | `01a09460-9b10-7690-9e59-a74809f7eeee` |
| L03-glob-lockfile | lockfile | lockfile-pin-delta | `isaacs/node-glob` aee5a632c5c2… → 7df583d631ff… (tap/uuid) | 13 | `01a09460-9b10-7690-9e59-a75bd2cc4cd7` |
| L04-winston-lockfile | lockfile | lockfile-pin-delta | `winstonjs/winston` 4b963a9f5b1e… → 96dccd6e3217… (async 3.2.5→3.2.6) | 6 | `01a09460-9b10-7690-9e59-a76eb806e174` |
| S01-jsonschema-recursive-anchor | schemaWebhook | json-schema-webhook-drift | `json-schema-org/json-schema-spec` `$recursiveAnchor` type | 9 | `01a09460-9b10-7690-9e59-a772f46d67ca` |
| S02-octokit-pr-opened | schemaWebhook | json-schema-webhook-drift | `octokit/webhooks` pull_request opened `auto_merge` (not organization.renamed) | 10 | `01a09460-9b10-7690-9e59-a782f4968305` |
| S03-cyclonedx-bom-schema | schemaWebhook | json-schema-webhook-drift | `CycloneDX/specification` 1.6 annotations + 1.5→1.6 | 11 | `01a09460-9b10-7690-9e59-a79f1bdd7933` |
| S04-spdx-json-schema | schemaWebhook | json-schema-webhook-drift | `spdx/spdx-spec` JSON Schema 2.3 vs 3.0.1 | 11 | `01a09460-9b10-7690-9e59-a7acde3cd288` |
| R01-github-rest-routes | apiRoutes | api-upgrade-brief | `github/rest-api-description` 2026-09-11→12 (not OpenAI) | 8 | `01a09460-9b10-7690-9e59-a7b0bfc37b2d` |
| R02-stripe-openapi-routes | apiRoutes | api-upgrade-brief | `stripe/openapi` spec3.yaml 2026-07-29→08-26 | 10 | `01a09460-9b10-7690-9e59-a7c0277e91ea` |
| R03-moby-engine-api | apiRoutes | route-table-diff | `moby/moby` swagger.yaml umask→Healthcheck (path set unchanged) | 11 | `01a09460-9b10-7690-9e59-a7d55e176672` |
| R04-slack-web-api | apiRoutes | api-upgrade-brief | `slackapi/slack-api-specs` 1.5.0→1.7.0 | 14 | `01a09460-9b10-7690-9e59-a7e6b0922672` |
| P01-nodejs-org-sitejson | pageSnapshots | page-change-offline-job | `nodejs/nodejs.org` site.json survey badge | 9 | `01a09463-2aa2-70a1-a5ff-143d866fa743` |
| P02-express-docs | pageSnapshots | page-change-offline-job | `expressjs/expressjs.com` content.md Code Tabs | 12 | `01a09463-2aa2-70a1-a5ff-14437eb09696` |
| P03-spdx-mit-html | pageSnapshots | page-change-offline-job | `spdx/license-list-data` MIT.html + jsonld | 15 | `01a09463-2aa2-70a1-a5ff-1450180dfc58` |
| P04-sds-useful-jobs-page | pageSnapshots | page-change-offline-job | SDS UsefulJobs.tsx S260 → 1.4.0 overlay | 11 | `01a09463-2aa2-70a1-a5ff-14690a6696f9` |

Not used: OpenAI routes, octokit `organization.renamed`, H04 mocha/axios lock excerpts, H04 schema-validator/resources/`/x402/verified`, W5-M06–M09 corpora, HG04 CI wrapper.

## Parent composition

- Catalog + labeled non-equivalent migrations: `bin/select-job.mjs`, `catalog/catalog.json`
- Kit pin verify/extract: `lib/kit.mjs`
- Independent witnesses per consumer (do not import kit compare modules)
- Engine disagreements recorded as `regression-artifact.json` (yarn refuse code name; JSON Schema added-path summary / remote `$ref`; SPDX `/$schema` fingerprint; Stripe shallow used-ops). Engines not patched.

## Next remaining proof

GitHub-hosted CI on the draft PR (this VM already ran 173/173). Engine regression artifacts stay artifacts unless an engine-owning assignment takes them. No live merchant or paid extract claim.
