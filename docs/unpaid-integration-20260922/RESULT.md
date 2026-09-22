# Unpaid verification integration

Receiving clone: `epistemedeus/samedaydesk` at main `a10c2ab63ff089b93f07c23c70cf7cd522fb0947` (SDS248, 2026-09-22). Implementation commit `1da9809f6128d08d283f78ac7b271035f058e03f` on `codex/sds-unpaid-integration-20260922`. This file is the following commit on that branch.

Draft PR (not merged): https://github.com/epistemedeus/samedaydesk/pull/249

One cold command, from any working directory:

```bash
node docs/agent-sds/unpaid-cold.mjs
```

Exit 0. It checks the unpaid 402 amount/status contract, distinguishes a missing observation from a measured zero, and reports Bazaar-versus-origin drift from dated fixtures. It does not pay, sign, check out, publish, or scan a live catalog.

## Sources

Heads rechecked on GitHub immediately before copy. All four were still open drafts at the September 22 16:08 UTC pins. Source branches were not updated.

| Source | Head consumed | Receiving path | Disposition |
| --- | --- | --- | --- |
| #212 `heavy/botwave-sds2-x200` | `cfe79aedb29cad04794baa53e7c0c10c5bc6dbe5` | `tools/verify-sds/w821-402-matrix/**` | Adapted. 23-route unpaid 402 matrix, catalog cross-check, forged-settlement refusal. |
| #214 `heavy/botwave-sds2-x201` | `23939a7429b73a989281ece86e58b235f763957b` | `tests/regression-sds/w822-absence/**` | Adapted. Absence is not demand. Added unknown-versus-zero cases. |
| #216 `heavy/botwave-sds2-x75` | `bdc7334e20991c9a48d52a0a6b1ecb2f7bf11639` | `tools/commerce-receipts/bazaar-drift/**` | Adapted. Dated origin/Bazaar drift receipt. `GET /read` stays origin `0.005` versus Bazaar `0.05`. |
| #234 `heavy/botwave-x73-howto-unpaid-mcp-rev` | `4720f55cbefa922e921c400fff85c613491c8209` | `docs/agent-sds/howto-unpaid-mcp.md` | Adapted. Command fences kept and executed by the journey. Front door added. |
| #188 `heavy/botwave-sds2-x73` | `4720f55cbefa922e921c400fff85c613491c8209` | none | Omitted as an independent source. Same commit as #234. PACKET-32 reviewed #188 at `140ab1098f7cbdac1a29bb0a55ba18717cc12c3c` only. |

PACKET-34 findings accepted those four heads from the packet summary only. This pass read the full trees and the receiving main (including SDS248 discovery) before copying.

## What was not copied

- SDS248 useful-jobs discovery (`packs/e4-maintained-runtime-discovery/**`, `docs/agent/**`). Already on main via `a10c2ab6`. The journey calls `node packs/e4-maintained-runtime-discovery/bin/discover.mjs --committed`. It does not add a second discovery schema, catalog, or client.
- #188 as a second howto. The #234 tree is the only unpaid MCP document.
- `tests/regression-sds/absence-not-demand-w7/**`. Not on this main. w822 still records that boundary as disjoint.
- `node_modules`, the client app, homepage, server payment code, prices, credentials, and unrelated workflows.
- Live CDP, live x402 catalog, apex `curl` probes, Stripe, signing, and checkout. The howto's live curls stay in `text` fences and were not run.

## Dated fixtures, not today's service

| Fixture | Stamp in the committed file | Role |
| --- | --- | --- |
| `fixtures/presence/catalog/x402.json` `lastUpdated` | `1788454976` = `2026-09-03T17:02:56.000Z` | 402 amount pin. Not refreshed. |
| Bazaar observation `data/bazaar-tracker/observations.json` | `observedAt` `2026-09-03T09:54:04.798Z` | SDS row count 8. |
| Origin pin inside bazaar-drift | `observedAt` `2026-09-03T10:52:00.000Z`, OpenAPI `1.23.40` | 25 paid ops. `GET /read` atomic `5000` / display `0.005`. |

The journey reports `catalog.role = "dated-fixture"` and `liveServiceClaim: false`. `liveCatalogScan` is false. No new live catalog scan was performed.

## Defects fixed while adapting

- The w821 boundary test required the checkout directory to be named `samedaydesk` or to end in `repo`. This clone is `SDS-UNPAID-INTEGRATION`, so that assertion failed on receiving main. It now checks `package.json` `"name": "samedaydesk"`.
- w821 and bazaar-drift treated relative CLI paths as cwd-relative and exported them with a `startsWith(repoRoot)` chop. From another directory the file was missed or the exported path was the caller's string. Relative paths now resolve inside the clone first. Exported paths are repository-relative (`path.relative`), so a sibling directory that merely shares the repo path prefix is not clipped.
- `verify.mjs` threw on a missing fixture instead of a JSON exit. Missing fixtures now exit 2 with `MISSING_FIXTURE`.
- A missing metric stored as numeric `0` was not distinguished from a real zero measurement or from an unknown null. `unknown` (null / withheld), `observed_zero` (`state: "ok"`, value 0), and `unknown_as_zero` (unknown state with a number, including 0) are separate. Storing unknown as zero is rejected (`unknown_as_zero`, `missing_as_zero_demand`).

## Commands and exits

Node v22.14.0. No payment. Working directory was the clone unless noted.

| Command | Exit |
| --- | --- |
| `node tools/verify-sds/w821-402-matrix/cli.mjs --cold` | 0 |
| `node tools/verify-sds/w821-402-matrix/cli.mjs --seeded-failure bad-amount` | 1 `SEED_REJECT` / `stale_listed_amount` |
| `node tools/verify-sds/w821-402-matrix/cli.mjs --seeded-failure bad-status` | 1 `SEED_REJECT` / `bad_status` |
| `node tools/verify-sds/w821-402-matrix/cli.mjs --seeded-failure forged-settle` | 1 `SEED_REJECT` / `forged_settle` (naive accept, honest reject) |
| `node tools/verify-sds/w821-402-matrix/cli.mjs --live` | 2 `REFUSED` |
| `node tools/verify-sds/w821-402-matrix/cli.mjs --pay` | 2 `REFUSED` |
| `node tools/verify-sds/w821-402-matrix/cli.mjs --seeded-failure` (no value) | 2 `USAGE` |
| `node tools/verify-sds/w821-402-matrix/cli.mjs --not-a-real-flag` | 2 `USAGE` |
| `node tools/verify-sds/w821-402-matrix/cli.mjs tools/verify-sds/w821-402-matrix/fixtures/valid/does-not-exist.json` | 1 `invalid_shape` |
| same forged-settle fixture path, cwd = empty temp dir | 1; `file` is `tools/verify-sds/w821-402-matrix/fixtures/invalid/forged-settle.json` and does not resolve under that temp dir |
| `node --test --test-concurrency=1 tools/verify-sds/w821-402-matrix/test.mjs` | 0 (37 pass) |
| `node tests/regression-sds/w822-absence/run.mjs --json` | 0 (20 cases, pins ok) |
| `node tests/regression-sds/w822-absence/run.mjs --seeded-failure --json` | 1 `SEED_REJECT` |
| `node tests/regression-sds/w822-absence/run.mjs --not-a-real-flag --json` | 2 `unknown_flag` |
| `node tests/regression-sds/w822-absence/run.mjs --live --json` | 2 `LIVE_FORBIDDEN` |
| `node tests/regression-sds/w822-absence/verify.mjs` missing fixture | 2 `MISSING_FIXTURE` |
| `verify.mjs --expect accept` on `missing-metrics-not-zero-honest.json`, cwd = temp dir | 0; `path` is the absolute fixture; `observationClass` `unknown` |
| `node --test --test-concurrency=1 tests/regression-sds/w822-absence/*.test.mjs` | 0 (23 pass) |
| `node tools/commerce-receipts/bazaar-drift/cli.mjs --cold --pretty` | 0; `paid: false`; `decision: hold`; `code: bazaar_price_conflict`; origin `/read` `0.005`, Bazaar `0.05` |
| `node tools/commerce-receipts/bazaar-drift/cli.mjs --seeded-failure read-claimed-match --pretty` | 1 `SEED_REJECT` / `rematerialized_claim` |
| `node tools/commerce-receipts/bazaar-drift/cli.mjs --pay` | 2 `REFUSED` |
| `node tools/commerce-receipts/bazaar-drift/cli.mjs` (no mode) | 2 |
| `node tools/commerce-receipts/bazaar-drift/cli.mjs --cold`, cwd = temp dir | 0 |
| `node --test --test-concurrency=1 tools/commerce-receipts/bazaar-drift/test.mjs` | 0 (17 pass) |
| `node packs/e4-maintained-runtime-discovery/bin/discover.mjs --committed --compact` | 0; package `useful-jobs` `1.4.7`; not a new client |
| `node docs/agent-sds/unpaid-cold.mjs` | 0; `paid: false`; `liveCatalogScan: false`; `unknownVersusZero.distinct: true`; forged settlement caught |
| same journey, cwd = temp dir | 0; exported paths (43) are inside the clone, not under the temp dir |
| `node docs/agent-sds/unpaid-cold.mjs --pay` | 2 `REFUSED` |
| `node docs/agent-sds/unpaid-cold.mjs --not-a-real-flag` | 2 `USAGE` |
| `node docs/agent-sds/unpaid-cold.mjs nope.json` | 2 `USAGE` |
| `node --test --test-concurrency=1 docs/agent-sds/unpaid-cold.test.mjs` | 0 (3 pass). This runs the howto loopback fence (exit 0, `paidToolCalled: false`, `loopbackCallRefused: true`) and the paid-call seed (`PAID_REFUSE`, `seeded_exit:1`, `networkCalls: 0`) |
| e4 committed tests + `docs/agent/follow-the-doc.test.mjs` | 0 (41 pass) |
| `npm run test:hosted-startup` | 0 (4 pass) |
| `npm run build` | 0 (hosted startup again, then client `tsc` and Vite production build) |

Unknown versus zero inside the passing w822 corpus:

| Case | Class | Verdict |
| --- | --- | --- |
| `missing-metrics-not-zero-honest` | `unknown` (null missing metrics, demand withheld) | accept |
| `observed-zero-not-unknown` | `observed_zero` (measured 0, not missing) | accept |
| `unknown-stored-as-zero` | `unknown_as_zero` | reject |

The howto bash seed is a subshell that prints `seeded_exit:1` after Node exits 1, so the bash status is 0. The journey requires `seeded_exit:1`, `code: PAID_REFUSE`, and `neverPostedCall: true`. It does not POST `tools/call`.

## Residuals

- Root owns acceptance. This draft is not merged and nothing was deployed.
- #212, #214, #216, #234, and #188 stay open. Their branch tips were not moved. #188 remains the same commit as #234 and is still not an independent review of `4720f55`.
- The optional Express gate `node --test server/scripts/test-mcp-protocol-negotiation.js` was not run. The howto leaves it for a clone that already has dependencies and marks it out of the cold path. The cold path hashes `server/routes/mcp.js` instead (tools-block SHA-256 `068cbfdb8ddab4dac7eef335d51fbe347728d6ccca65bef0365a3eb831db6caf`, still matches main).
- `npm run build` installed root and client dependencies locally. Those trees are gitignored and were not committed. `client/package-lock.json` was restored after the client install touched it. `client/public/x402/verified.json` did not change.
- Drift amounts are the 2026-09-03 fixtures. This run does not say whether a live Bazaar listing still disagrees with origin today.
