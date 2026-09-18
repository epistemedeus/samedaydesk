# SDS replay-nonce regression fixtures

Owner-QA pack for SameDayDesk **pulse flush-id nonces**. It cold-runs
the published engines:

- `server/lib/pulse-store/supabase-adapter.js` `createPulseStoreFromTransport`
- `server/scripts/helpers/fake-pulse-authority.js` `createFakePulseAuthority`
  (mirrors `pulse_apply_delta`: first apply, `already_applied`, `pulse_flush_id_conflict`)
- `server/lib/pulse-store/wal-schema.js` `validateWalFlushEntry` / `validateWalState`
- `server/lib/pulse-store/file-fallback.js` `createFileFallbackStore`
- `supabase/migrations/0002_pulse_durable.sql` `pulse_apply_delta(uuid, jsonb)`

Pinned nonce: `a0000000-0000-4000-8000-000000000099`. No network. This directory
does not pay, open Stripe, publish, or talk to a registry.

## Cold run

From the repository root, no prior state in this pack:

```sh
node tests/regression-sds/replay-nonce/run.mjs cold
```

Exit `0` prints a JSON report (`schema: sds.regression.replay-nonce.v1`) with
every fixture outcome. Identical nonce replay stays `already_applied` without
double-counting, a conflicting payload is `pulse_flush_id_conflict`, and WAL
rejects non-UUID flush ids.

## Seeded failure

A case the pack **must reject**. Exit `0` means the refusal fired.

```sh
node tests/regression-sds/replay-nonce/run.mjs --seeded-failure replay-as-fresh-apply
node tests/regression-sds/replay-nonce/run.mjs --seeded-failure list
```

Named probes:

| id | expected refusal |
| --- | --- |
| `replay-as-fresh-apply` | `identical_replay_not_fresh_apply` (engine `already_applied`, naive second `applied`) |
| `conflict-as-ok` | `conflicting_nonce_not_ok` (engine `pulse_flush_id_conflict`) |
| `consumed-nonce-reissued` | `consumed_nonce_not_reissued` |
| `payment-to-mint-nonce` | `payment_forbidden` |

## Tests

```sh
node --test --test-concurrency=1 tests/regression-sds/replay-nonce/test/*.test.mjs
```

## Layout

```text
fixtures/           store / WAL / SQL cases + expected nonce outcomes
fixtures/seeded/    naive claims the pack must refuse
src/                cohort + seeded runners over published engines
run.mjs             cold CLI and --seeded-failure
test/               node:test coverage of the same invariants
```
