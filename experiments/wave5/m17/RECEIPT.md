# RECEIPT — W5-M17 reproducible API-route change trial

Repo: `epistemedeus/samedaydesk`
Owned path: `experiments/wave5/m17/`
Feature branch: `cursor/w5-m17-reproducible-api-route-change-trial-a46a`
Starting ref: `fable/f08-paid-wrappers` `aeef964fa188443078958d9d6d393afae1d542ee`
Feature tip: `31d9c55793f81fb8407c40655f7c3d9161114a88`
Integration owner: W5-M01
Label: owner-qa dry run. Not a sale, not a customer, not field execution.

## Tested versions

| Binding | Version tested | Remaining |
| --- | --- | --- |
| SDS52 / PR52 | `aeef964fa188443078958d9d6d393afae1d542ee` | Live `createSdsApp` and `SPA_ROUTE_SHELLS` |
| M04 / Co12 | `7387eb677abd442dfab9081cb0ad95451fd2a762` PR64 CLI `tools/route-table-diff/bin/route-diff.mjs` | M04 may amend the engine; this kit is bound to this SHA |
| M08 | unbound | No Next/FastAPI/source parsers. SDS Express HTTP observation only |
| D24 | unbound | No clean-env package install |
| F | not executed | No third-party project, offer, spend, or messages |

Pilot packet: `epistemedeus/pilot@95b3f3a47f5b1b69bd237e4c978fc3376221365d` PLAN / REVIEW-INTEGRATION / TASKS.

pstack: skills read from plugin cache `9717366/68d834d9ca8f34c375ecb8057bfbcde5396a01f8` (`principle-prove-it-works`, `principle-test-behavior-not-implementation`, `principle-boundary-discipline`, `principle-subtract-before-you-add`, `setup-pstack`). Model from Cursor Cloud run-info: `cursor-grok-4.6-xhigh`. No `/` skill invocation, no extra Cloud agents.

## Commands

```bash
cd experiments/wave5/m17 && npm test
node --test --test-concurrency=1 experiments/wave5/m17/test/*.test.mjs
node experiments/wave5/m17/bin/trial.mjs run --out-dir /tmp/w5-m17-trial
```

Node 22.14.0. No extra kit npm packages. Engine is resolved from git worktree/env/in-tree, never vendored.

## Executed tests

`node --test --test-concurrency=1 experiments/wave5/m17/test/*.test.mjs`

10 passed, 0 failed, 0 skipped.

Nested Co12 pin replay (`runEnginePackageTests` against `7387eb67`): 14 passed, 0 failed.

Postgres is not an input (`postgres: not-an-input`). Missing engine is `incomplete`, never a skipped pass.

## Current-source findings (SDS52 + Co12 pin)

1. **Permutation is not a breaking change.** Live `SPA_ROUTE_SHELLS` reversed: Co12 `counts` all 0, `tableDigest` before `sha256:49d24d600dbe1982545d2b2f02e038fd0b7d55acc1f4d414b243b6b2d5061023` ≠ after `sha256:3f3a12d52f41f7905d52a4cbbbdecf8d05f4907c85471d781a592aaebccc5aa3`. Review prediction reproduced. This kit classifies that as `analysis_no_change`, not a compatibility break. Unlike digest/terms hashes are not forced equal.
2. **MCP Streamable HTTP is GET and POST on `/mcp`.** HTTP: GET 200 text, POST empty 202, POST initialize 200 JSON-RPC `protocolVersion` `2024-11-05`. Mapping both rows onto Co12 path identity yields `duplicate_path` (`analysis_refusal`, not an engine crash). A path-only no-change cannot certify method-level API compatibility.
3. **Query is live behavior Co12 cannot catalog.** GET `/mcp` and GET `/mcp?cs=w5-m17-not-a-license` differ. Co12 `invalid_path` when the query is placed in `path`.
4. **SPA shells are not the API table.** Unbuilt `createSdsApp` GET `/x402` is 404 `Cannot GET /x402`. `mountProductionClient` after `writeRouteShells` GET `/x402` is 200 with title `Agent Payment Infrastructure: x402 and MPP | SameDayDesk`. Treating a Co12 SPA catalog as HTTP API compatibility is a domain error.
5. **Homepage `/` is a React history route and a valid Co12 refusal** (`homepage_rewrite_refused`), not a crash.
6. **Integer `termsVersion` is refused** (`integer_terms_version_refused`). Public HTTPS catalogs are refused (`external_catalog_refused`).

No M04 engine patch (not an owned path). The named ordering/custom-catalog predictions hold on the current pin. Duplicate paths are already refused by Co12; the remaining API gap is identity (method + query), not a missing duplicate check.

## Remaining live steps (Root / journey owner)

1. Rebind after M04 amends `tools/route-table-diff` if method-aware identity is added.
2. M08: parsers for claimed extra frameworks, plus explicit reject of unsupported formats.
3. D24: install this kit plus the M04 pin in a clean environment and replay `npm test`.
4. Field (F): run `bin/trial.mjs run` on another allowed project only after an offer/account is actually ready. Do not fabricate customers.

Draft PR: automatic open was registered for operator approval. Compare: https://github.com/epistemedeus/samedaydesk/compare/fable/f08-paid-wrappers...cursor/w5-m17-reproducible-api-route-change-trial-a46a

No deploy, spend, payout, or unsolicited messages from this worker.
