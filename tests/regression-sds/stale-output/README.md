# SDS stale-output regression (W0-X72)

Fixtures and verifier that **reject** stale or greenwashed useful-jobs / listing / verify output: claims of `ok`/`pass` on an outdated sha, old version, or fabricated fresh stamp.

Write boundary: `tests/regression-sds/stale-output/**` only. No Stripe/x402. No edits outside this tree. Live pin is cited from `client/src/data/usefulJobsKit.json` and `client/public/for-agents/useful-jobs/*.sha256.json` (read-only).

## Layout

```
tests/regression-sds/stale-output/
  MANIFEST.json
  run.mjs              # cold corpus + --seeded-greenwash
  verify.mjs           # single fixture
  *.test.mjs
  lib/{pin,classify,envelope,catalog,spawn-env,root}.mjs
  fixtures/cases/*.json
  fixtures/seeded/
```

Current pin (cite kit + sha256.json): **1.4.7** /
`e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec` / 5255824 bytes.

## Commands

```bash
# Cold: every stale/greenwash case rejected, current-pin control accepted → exit 0
node tests/regression-sds/stale-output/run.mjs --json

# Seeded greenwash fed as accept → exit 1, error.code SEED_REJECT
node tests/regression-sds/stale-output/run.mjs --seeded-greenwash --json
node tests/regression-sds/stale-output/run.mjs --seeded-failure --json

# Direct verify of greenwash as accept
node tests/regression-sds/stale-output/verify.mjs \
  --fixture fixtures/cases/greenwash-stale-pin.json --expect accept --json

# Matching current pin as a "seeded failure" does not diverge → SEED_MISS
node tests/regression-sds/stale-output/run.mjs \
  --fixture tests/regression-sds/stale-output/fixtures/seeded/matching-current.json --json

node --test --test-concurrency=1 tests/regression-sds/stale-output/*.test.mjs
npm test --prefix tests/regression-sds/stale-output
```

`run.mjs --seeded-failure` always exits 1. `SEED_REJECT` means the product refused the claimed accept. `SEED_MISS` means the fixture did not diverge from the claimed verdict.

## Cases

| id | class | defect |
| --- | --- | --- |
| useful-jobs-stale-sha | stale | ok on 1.1.0 sha while labeling 1.4.7 |
| useful-jobs-stale-version | stale | pass on version 1.1.0 |
| fabricated-fresh-stamp | fabricated | ok + freshness stamp, wrong sha (no self-label) |
| greenwash-stale-pin | **greenwash** | ok/pass while pin is stale 1.4.0 |
| listing-stale-digest | stale | listing ok with 1.4.0 digest / observedAt before 1.4.7 builtAt |
| verify-outdated-sha-pass | stale | verify pass on 1.0.0 sha labeled 1.4.7 |
| current-pin-honest | control | live 1.4.7 pin is not stale |

Classifier does not treat every success as stale: the control case must accept.
