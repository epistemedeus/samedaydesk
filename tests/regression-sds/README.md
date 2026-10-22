# SameDayDesk SDS regression corpus

Known SDS defects as executable fixtures. Replay is local: spawn product CLIs, inspect in-tree sources, or classify captured HTTP. No live apex TLS. No Stripe/x402 payment. No MCP `tools/call`. No checkout mutation.

```
tests/regression-sds/
  schema.json
  catalog.json
  run.mjs
  lib/
  cases/<id>/case.json
```

Write boundary is this tree only.

## Run

```
node tests/regression-sds/run.mjs --json
node tests/regression-sds/run.mjs --seeded-failure false-green --json
node tests/regression-sds/run.mjs --seeded-failure false-reject --json
node --test tests/regression-sds/*.test.mjs
```

Node 22.x.

## Honest vs naive (false-green)

Each case records the real product outcome, then two verdicts:

- Honest: `ok:true` (or HTTP 2xx without an `ok` field) is accept; `ok:false` / challenge / 402 is reject.
- Naive `exit0`: process exit 0 is accept. This is the obtain-archive / s185 wrapper bug.
- Naive `http-200`: HTTP 200 is accept (issue #1 soft-404).
- Naive `html-body`: any HTML body is accept (hcdn challenge page).

A designated seeded false-green (`archive-wrong-digest`) is SHA mismatch with child exit 0. A designated seeded false-reject (`offer-routing-complete-issue`) is mapped refuse with exit 2. `--seeded-failure` always exits 1 and quotes `SEED_REJECT`.

## Surfaces

| surface | SDS defects in this corpus |
| --- | --- |
| merchant | issue #1 unknown-path 200 / captured soft-404, AI-readiness homepage canonical, PR18 unread `req.listing`, S125 pulse PG echo, pulse RPC uniqueHumans leak, MCP missing tool, S51 correspondence isolation, hcdn challenge, unpaid 402 |
| buyer | obtain-archive wrong digest (seeded false-green), result-reuse missing `--out` |
| verifier | evidence-record organic label, payment replay block |
| pack | s185 missing input exit 0 |

## Limits

Live apex TLS is not used. CDN/402 classes are fixture-classified. Correspondence replay mounts the in-process Express prefix with an empty env (unconfigured); it does not edit `vendor/neomorphic-correspondence`.
