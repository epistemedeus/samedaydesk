# SDS stale-archive reject regression (w8)

Fixtures and verifier that **reject** treating a stale useful-jobs archive as the current catalog.

Current pin is committed **1.4.7** (`e2e9b44e…69dec`, `5255824` bytes). Immutable **1.0.0–1.4.0** stay on disk; **1.1.0** is the W0-B2 negative control and must not pass as current.

Write boundary: `tests/regression-sds/stale-archive-reject-w8/**` only. No Stripe/x402. No `--live`. No edits outside this tree.

Cite (read-only): `client/src/data/usefulJobsKit.json`, kit + `/for-agents` archive twins, `experiments/s260-useful-jobs-public-integration/bin/obtain-archive.mjs` (`wrong-size` / `wrong-digest`, child exit 0 + `refused:true`).

## Commands

```bash
# Cold: hash real archives, reject stale-as-current, accept honest current → exit 0
node tests/regression-sds/stale-archive-reject-w8/run.mjs --json

# Seeded 1.1.0-as-current fed as accept → exit 1, error.code SEED_REJECT
node tests/regression-sds/stale-archive-reject-w8/run.mjs --seeded-failure --json

node tests/regression-sds/stale-archive-reject-w8/verify.mjs \
  --fixture fixtures/cases/stale-110-as-current.json --expect accept --json

node --test --test-concurrency=1 tests/regression-sds/stale-archive-reject-w8/*.test.mjs
```

`--live`, `--pay`, `--stripe`, `--publish`, `--neo` exit 2 (`LIVE_REFUSE` / `PAY_REFUSE`).

## Cases

| id | expect | defect |
| --- | --- | --- |
| current-147-honest | accept | claim matches 1.4.7 pin |
| obtain-current-147-honest | accept | real obtain-archive of 1.4.7 succeeds |
| honest-stale-110-refused | accept | 1.1.0 named negative control, not claimed current |
| stale-100-as-current | reject | 1.0.0 claimed current |
| stale-110-as-current | **seed reject** | 1.1.0 claimed current |
| stale-120-as-current | reject | 1.2.0 claimed current |
| stale-130-as-current | reject | 1.3.0 claimed current |
| stale-140-as-current | reject | 1.4.0 claimed current |
| spoofed-147-label-110-bytes | reject | 1.4.7 label on 1.1.0 sha/bytes |
| fabricated-current-digest | reject | invented digest as current |
| previous-listed-as-current | reject | kit previous listed as live |
| obtain-stale-110-vs-current | reject | obtain 1.1.0 vs 1.4.7 pin → `wrong-size` |
| obtain-stale-110-wrong-digest | reject | 1.1.0 bytes vs 1.4.7 sha → `wrong-digest` |
