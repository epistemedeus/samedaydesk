# FEATURE-MAP — W5-M18 reproducible changed-page trial

Own directory: `experiments/wave5/m18/` only.

## Preflight (this checkout)

| Looked for | Result |
| --- | --- |
| SDS52 wrapper `server/paid-useful-jobs/` | Present at `aeef964`. Catalog has no page-change job. **Not edited.** |
| W4-commerce-13 engine `tools/page-change-offline-job/` | Absent from SDS52. Consumed read-only at pin `91b57334818ecd7940cb854e9864f3b1749d1d1d`. **Not vendored.** |
| M09 `experiments/wave5/m09/` | Absent. Owner-labelled captures in `captures/` plus SDS52 published customer-job snapshots. |
| D24 `experiments/wave5/d24/` | Absent. This kit is a Node CLI plus engine pin, not a claimed clean-env install. |
| offer-routing `sdd.page_change_offline` | Selects merchant skill artifact. **Not edited.** Remaining M01/Root binding. |
| Merchant `compare.mjs` | Not imported. |

## User goals

| User goal | Entrypoint | Command | State | Tests | Account / spend |
| --- | --- | --- | --- | --- | --- |
| Verify a complete title change against captured bytes | `captures/complete-changed/` | `node bin/trial.mjs run --case complete-changed --out-dir DIR` | `verdict=changed`, fact verified, `within_limit_at_query` | `test/journey.test.mjs` | None |
| Published widget deadline change | SDS52 customer-job snapshots | `--case published-customer-job` | `verdict=changed`, incomplete, fact verified | same | None |
| Valid no-change | `captures/unchanged/` | `--case unchanged` | `verdict=unchanged` | same | None |
| Heading reorder is not a title change | `captures/reorder-headings/` | `--case reorder-headings` | `verdict=reordered` | same | None |
| Stale capture still verifies the fact | `captures/stale-after/` | `--case stale-after` | fact verified, `stale_at_query` | `test/freshness.test.mjs` | None |
| Truncation can hide the fact | published snapshots, `--max-sources 1` | `--case truncation-max-sources` | `incomplete`, fact not in engine report | `test/truncation.test.mjs` | None |
| Refuse live URL | real `127.0.0.1` server | engine `compare --before http://…` | `valid_refusal` `live_fetch_url`, hits=0 | `test/seeded-failures.test.mjs` | None |

## Files

| Path | Role |
| --- | --- |
| `bin/trial.mjs` | Public CLI |
| `lib/trial.mjs` | Spawn engine, verify facts, query-time freshness |
| `captures/` | Owner-labelled extract-batch captures and SDS52 path pins |
| `PINS.json` | Engine and SDS52 pins |
| `test/*.test.mjs` | `node:test` against the real CLI |

## Later integration bindings (Root / siblings)

1. M05: apply `maxStaleMs` inside the engine; copy parse-batch truncation onto `snapshot.*.truncated`; do not claim `claims.fresh` without a currency proof.
2. M09: replace or extend owner captures with the independent snapshot corpus.
3. D24: clean-environment install of this package plus the engine pin, without the SDS monorepo.
4. M01: point `sdd.page_change_offline` at `tools/page-change-offline-job/bin/page-change.mjs` and list the job in the catalog when that is the selected offer.
5. Field: caller supplies already-held extract-batch JSON from a permitted source and a query clock. This worker does not fetch, pay, or message customers.

## Untested

- Live `POST /extract/batch` or merchant `POST /recipes/page-change`
- Recruited or independent customer jobs
- M05 amended engine behavior
- D24 clean-env package install
