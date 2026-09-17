# SDS clock-skew regression fixtures

Owner-QA pack for SameDayDesk **provider vs observer clocks**. It cold-runs
the published engines:

- `server/lib/observatory/contract.js` `classifyProviderTimestamp`
  (`FUTURE_SKEW_MS` = 2 minutes, `STALE_PROVIDER_MS` = 2 hours)
- `server/routes/market-observations.js` `refineSourceTimeState`
  (`SOURCE_TIME_STALE_MS` = 1 hour)
- observatory adapters `moltjobs.observe` and `x402stats.observe`

Pinned observer clock: `2026-09-17T12:00:00.000Z`. No network. This directory
does not pay, open Stripe, publish, or talk to a registry.

## Cold run

From the repository root, no prior state in this pack:

```sh
node tests/regression-sds/clock-skew/run.mjs cold
```

Exit `0` prints a JSON report (`schema: sds.regression.clock-skew.v1`) with
every fixture outcome. Future-skewed clocks are `invalid`, stale clocks stay
stale without rewriting metrics to zero, and provider timestamps stay
distinct from observer `fetchedAt`.

## Seeded failure

A case the pack **must reject**. Exit `0` means the refusal fired.

```sh
node tests/regression-sds/clock-skew/run.mjs --seeded-failure future-as-ok
node tests/regression-sds/clock-skew/run.mjs --seeded-failure list
```

Named probes:

| id | expected refusal |
| --- | --- |
| `future-as-ok` | `future_skew_not_ok` (engine `invalid`, naive claim `ok`) |
| `stale-as-fresh-zero` | `stale_not_rewritten_as_fresh_zero` (metrics stay 12 / 47303) |
| `collapse-clocks` | `clocks_must_stay_distinct` |
| `payment-to-correct-clock` | `payment_forbidden` |

## Tests

```sh
node --test --test-concurrency=1 tests/regression-sds/clock-skew/test/*.test.mjs
```

## Layout

```text
fixtures/           classify + adapter cases + expected states
fixtures/seeded/    naive claims the pack must refuse
src/                cohort + seeded runners over published engines
run.mjs             cold CLI and --seeded-failure
test/               node:test coverage of the same invariants
```
