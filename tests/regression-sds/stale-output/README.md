# SDS stale-output regression (W0-X72)

Fixtures and verifier that **reject** stale or greenwashed useful-jobs / listing / verify output — claims of `ok`/`pass` on an outdated sha, old version, or fabricated fresh stamp.

Write boundary: `tests/regression-sds/stale-output/**` only. No Stripe/x402. No edits outside this tree.

## Layout

```
tests/regression-sds/stale-output/
  MANIFEST.json
  run.mjs              # cold corpus + --seeded-greenwash
  verify.mjs           # single fixture
  corpus.test.mjs
  lib/{pin,classify,envelope}.mjs
  fixtures/cases/*.json
```

Current pin (cite `client/src/data/usefulJobsKit.json`): **1.4.7** /
`e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec` / 5255824 bytes.

## Commands

```bash
# Cold: every bad case correctly rejected → exit 0
node tests/regression-sds/stale-output/run.mjs --json

# Seeded greenwash fed as accept → exit 1, error.code SEED_REJECT
node tests/regression-sds/stale-output/run.mjs --seeded-greenwash --json

# Seeded current pin (negative control) → exit 1, error.code SEED_FALSE_ACCEPT
node tests/regression-sds/stale-output/run.mjs --seeded-greenwash \
  --seed-file fixtures/cases/current-pin-ok.json --json

# Direct verify of greenwash as accept
node tests/regression-sds/stale-output/verify.mjs \
  --fixture fixtures/cases/greenwash-stale-pin.json --expect accept --json

# Fixture path outside the package → exit 2 PATH_REFUSE
node tests/regression-sds/stale-output/verify.mjs \
  --fixture /tmp/stale-output-outside.json --json

node --test tests/regression-sds/stale-output/corpus.test.mjs
```

## Cases

| id | class | defect |
| --- | --- | --- |
| useful-jobs-stale-sha | stale | ok on 1.1.0 sha while labeling 1.4.7 |
| useful-jobs-stale-version | stale | pass on version 1.1.0 |
| fabricated-fresh-stamp | fabricated | ok + fabricated freshStamp, wrong sha |
| greenwash-stale-pin | **greenwash** | ok/pass while pin is stale 1.4.0 |
| listing-stale-digest | stale | listing ok with mismatched/stale digest |
| verify-outdated-sha-pass | stale | verify pass on 1.0.0 sha |
