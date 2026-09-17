# SDS absence≠demand regression (W0-X301 / w1102)

Fixtures and verifier that **reject** claims treating SDS absence as market or paid demand, and that **accept** honest withheld-demand records. Cold run also imports real SDS observatory/pulse/QA artifacts and fails closed if those pins drift.

Write boundary: `tests/regression-sds/w1102-absence/**` only. No Stripe/x402. No `--live`. No edits outside this tree.

Cite (read-only): observatory `WITHHELD_CONCLUSIONS` and `paidActivity` unavailable; pulse empty tool-name map and GET `/mcp` are not demand; owner-QA work briefs `notDemand: true`; pricing-row family non-claim; evidence-record prohibited inferences `catalog_presence_is_demand` and `analytics_count_is_independent_demand`.

## Layout

```
tests/regression-sds/w1102-absence/
  MANIFEST.json
  run.mjs              # cold pins + corpus; --seeded-absence-as-demand
  verify.mjs           # single fixture
  corpus.test.mjs
  pin.test.mjs
  lib/{root,pin,classify,envelope,catalog,evaluate}.mjs
  fixtures/cases/*.json
  fixtures/seeded/README.md
```

## Commands

```bash
# Cold: SDS pins hold and every fixture matches expect → exit 0
node tests/regression-sds/w1102-absence/run.mjs --json

# Seeded absence-as-demand fed as accept → exit ≠0, error.code SEED_REJECT
node tests/regression-sds/w1102-absence/run.mjs --seeded-absence-as-demand --json

# Direct verify of seed as accept
node tests/regression-sds/w1102-absence/verify.mjs \
  --fixture fixtures/cases/mcp-surface-get-as-demand.json --expect accept --json

node --test tests/regression-sds/w1102-absence/*.test.mjs
```

## Cases

| id | class | verdict |
| --- | --- | --- |
| paid-activity-unavailable-honest | honest-withheld | accept |
| empty-tool-map-honest | honest-withheld | accept |
| owner-qa-not-demand-honest | honest-withheld | accept |
| discovery-not-demand-honest | honest-withheld | accept |
| analytics-count-honest | honest-withheld | accept |
| paid-activity-unavailable-as-demand | absence-as-demand | reject |
| catalog-count-as-demand | absence-as-demand | reject |
| organic-heuristic-as-paid-demand | absence-as-demand | reject |
| pulse-empty-tool-map-as-demand | absence-as-demand | reject |
| pulse-empty-tool-map-as-zero | absence-as-zero | reject |
| unique-humans-estimate-as-demand | absence-as-demand | reject |
| pricing-row-absence-as-demand | absence-as-demand | reject |
| discovery-as-demand | absence-as-demand | reject |
| owner-qa-issue-as-demand | absence-as-demand | reject |
| empty-commerce-demand-invented | absence-as-demand | reject |
| route-absent-as-demand | absence-as-demand | reject |
| analytics-count-as-demand | absence-as-demand | reject |
| mcp-surface-get-as-demand | **seed** | reject |
