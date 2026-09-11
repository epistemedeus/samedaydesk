# RECEIPT — W5-M18 reproducible changed-page trial

Tool: `experiments/wave5/m18/`
Date: 2026-09-11
Node: v22.14.0
Write branch: `cursor/w5-m18-reproducible-changed-page-trial-7467`
Starting ref: `aeef964fa188443078958d9d6d393afae1d542ee` (SDS52 / PR52)
PR: https://github.com/epistemedeus/samedaydesk/pull/105

## Outcome

Thin consumer of the pinned SDS-local page-change CLI. A useful changed fact is checked against captured extract-batch bytes. Capture freshness is evaluated at the query clock. Engine `claims.fresh` stays false at this pin. Valid no-change, reorder, incomplete truncation, and live-URL refusal stay labelled as analysis or refusal, not transport success. No fetch, pay, merchant kernel, catalog, or homepage edit.

## Pins tested

| Item | Value |
| --- | --- |
| Engine | W4-commerce-13 `91b57334818ecd7940cb854e9864f3b1749d1d1d` `tools/page-change-offline-job/bin/page-change.mjs` |
| SDS52 | `aeef964fa188443078958d9d6d393afae1d542ee` |
| Published before sha256 | `23833bf7b28ca27a074cb9d73daaa2ec3beed14a55d767567c5fab50b66605f4` |
| Published after sha256 | `a7fdf95f161c67529a7254b1d2e1c4efa068506ac01edaee3c2561a5d09c9bd6` |
| Report schema | `pilot/page-change-brief/v1` |
| Trial schema | `samedaydesk.wave5.m18.changed-page-trial.v0` |
| Postgres | `127.0.0.1:5432` `ECONNREFUSED`; no SQL interface invented |

## Literal journey

```sh
node experiments/wave5/m18/bin/trial.mjs run \
  --case complete-changed \
  --out-dir /tmp/m18-complete

node experiments/wave5/m18/bin/trial.mjs run \
  --case published-customer-job \
  --out-dir /tmp/m18-published
```

Recorded `complete-changed`: `verdict=changed`, title `Alpha v1` to `Alpha v2` verified, `factsVerified=true`, trial freshness `within_limit_at_query`, engine `freshness=unknown`.

Recorded `published-customer-job`: widget title `Q3 widget RFQ` to `Q3 widget RFQ (deadline moved)` verified, overall `complete=false`, `usefulOutputProven=true`.

## Tests

```sh
node --test --test-concurrency=1 experiments/wave5/m18/test/*.test.mjs
```

**PASS** — 20 tests, 0 fail, 0 skip on Node v22.14.0. Also `trial run --all` over 7 cases (`ok true`).

Seeded / adversarial:

| Input | Kind |
| --- | --- |
| `http://127.0.0.1:…` as `--before` | `valid_refusal` `live_fetch_url`, server hits=0 |
| missing `--clock` | `valid_refusal` `clock_required` |
| `--example` | `valid_refusal` `sample_as_delivered_watch` |
| missing engine root | `engine_unavailable` (not a skip) |
| `--max-sources 1` on published snapshots | valid `incomplete` analysis; widget fact not in engine report; `snapshot.truncated` stays false |
| unlike clocks / unlike capture bytes | unlike `termsVersion`; same bytes+clock keep `sha256:a51d5a25585a8dde706cdc954fa4fbc2aeed50b3599cfb8791c601eb5932c0f4` |

## Current-source findings (engine pin, not amended here)

- `--max-stale-ms` is accepted and unused. `claims.fresh` / `claims.current` stay false; `freshness` stays `unknown`.
- `snapshot.*.truncated` stays false when parse-batch hits `source_limit`.
- `sdd.page_change_offline` still names `skill page-change / merchant npm run page-change`.
- useful-jobs catalog has no page-change job.
- Sparse pin worktree cannot run the engine's own journey tests that require `tools/recurring-job-recipes/` on SDS_ROOT. This trial passes explicit capture paths.

## Remaining integration bindings

1. M05: apply stale/truncation onto engine claims if that remains the selected kernel.
2. M09: independent snapshot corpus not present; bind when exported.
3. D24: clean-environment install of this package plus the engine pin, without the SDS monorepo.
4. M01: catalog listing and offer-routing artifact path.
5. Field: caller supplies already-held extract-batch JSON and a query clock. Live extract/pay/customer watch is not run here.

## Honesty

No deploy, purchase, live payment, account change, or customer messages. SameDayDesk / EIN.LLC / Neomorphic homepages untouched. No Other-pool models. No default-branch push.
