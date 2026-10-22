# SDS absence≠demand regression (W0-X138 / w7)

Fixtures and verifier that **reject** claims treating absence as market or paid demand — unavailable `paidActivity`, organic heuristics, catalog counts, empty pricing/commerce-demand, or missing routes invented as demand.

Honest reports of the same gaps (`ok: true` without a demand claim) are not defects.

Write boundary: `tests/regression-sds/absence-not-demand-w7/**` only. No Stripe/x402. No `--live`. No edits outside this tree.

Cite (read-only): observatory `paidActivity` must stay explicit when unavailable; record-jobs pricing family non-claim “No demand.”

## Layout

```
tests/regression-sds/absence-not-demand-w7/
  MANIFEST.json
  run.mjs              # cold corpus + --seeded-absence-as-demand / --expect accept
  verify.mjs           # single fixture
  corpus.test.mjs
  lib/{pin,classify,envelope,fixture,child}.mjs
  fixtures/cases/*.json
  fixtures/controls/*.json
  fixtures/seeded/*.json
```

## Commands

```bash
# Cold: every absence-as-demand case correctly rejected → exit 0
node tests/regression-sds/absence-not-demand-w7/run.mjs --json

# Seeded absence-as-demand fed as accept → exit ≠0, error.code SEED_REJECT
node tests/regression-sds/absence-not-demand-w7/run.mjs --seeded-absence-as-demand --json
node tests/regression-sds/absence-not-demand-w7/run.mjs --expect accept --json

# Direct verify of seed as accept
node tests/regression-sds/absence-not-demand-w7/verify.mjs \
  --fixture fixtures/cases/route-absent-as-demand.json --expect accept --json

node --test tests/regression-sds/absence-not-demand-w7/corpus.test.mjs
```

`--fixture` is confined to `fixtures/`. `--live` and unknown flags exit 2. A matching accept (no defect) on the seeded path exits 1 `SEED_MISSED`.

## Cases

| id | class | defect |
| --- | --- | --- |
| paid-activity-unavailable-as-demand | absence-as-demand | invent paidCustomers while paidActivity.available=false |
| organic-heuristic-as-paid-demand | absence-as-demand | organic heuristic claimed as paid demand |
| catalog-count-as-demand | absence-as-demand | catalog totalCount/useCount sold as demand |
| pricing-row-absence-as-demand | absence-as-demand | empty pricing rows claimed as market demand |
| empty-commerce-demand-invented | absence-as-demand | empty commerce-demand invented as positive demand |
| route-absent-as-demand | **seed** | missing route treated as demand to add/buy |
