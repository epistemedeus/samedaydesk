# SDS absence≠demand regression (W0-X256 / w1002)

Fixtures and verifier that **reject** claims treating SDS absence as market or paid demand, and that **accept** honest withheld-demand records. Cold run also imports real SDS observatory/pulse/owner-QA/evidence-record artifacts and fails closed if those pins drift.

Write boundary: `tests/regression-sds/w1002-absence/**` only. Disjoint from `absence-not-demand-w7/**`, `w802-absence/**`, `w822-absence/**`, `w902-absence/**`, `w922-absence/**` and later window packs. No Stripe/x402. No `--live`. No edits outside this tree.

Cite (read-only): x402scan is documented-unavailable and never called as success; moltjobs totals-vs-marketplace is composition not conversion; sources are not additive; missing is not zero; GET `/mcp` hits, empty pulse tool maps, owner-QA issues, catalog counts, and analytics counts are not demand. Seller-conformance inspection and one recruited Agent402 receipt are not organic or repeat demand. Issue-evidence observations set `notDemand` / `notDemandSignal`.

## Layout

```
tests/regression-sds/w1002-absence/
  MANIFEST.json
  run.mjs              # cold pins + corpus; --seeded-absence-as-demand
  verify.mjs           # single fixture
  corpus.test.mjs
  pin.test.mjs
  classify.test.mjs
  lib/{root,pin,classify,envelope,catalog,evaluate}.mjs
  fixtures/cases/*.json
  fixtures/seeded/README.md
```

## Commands

```bash
# Cold: SDS pins hold and every fixture matches expect → exit 0
node tests/regression-sds/w1002-absence/run.mjs --json

# Seeded absence-as-demand fed as accept → exit ≠0, error.code SEED_REJECT
node tests/regression-sds/w1002-absence/run.mjs --seeded-failure --json

# Direct verify of seed as accept
node tests/regression-sds/w1002-absence/verify.mjs \
  --fixture fixtures/cases/x402scan-unavailable-as-demand.json --expect accept --json

node --test tests/regression-sds/w1002-absence/*.test.mjs
```

## Cases

| id | class | verdict |
| --- | --- | --- |
| x402scan-unavailable-honest | honest-withheld | accept |
| moltjobs-composition-honest | honest-withheld | accept |
| missing-metrics-not-zero-honest | honest-withheld | accept |
| owner-qa-not-demand-honest | honest-withheld | accept |
| empty-tool-map-honest | honest-withheld | accept |
| discovery-not-demand-honest | honest-withheld | accept |
| scoped-no-change-honest | honest-withheld | accept |
| seller-conformance-honest | honest-withheld | accept |
| issue-evidence-not-demand-honest | honest-withheld | accept |
| x402scan-unavailable-as-demand | **seed** | reject |
| moltjobs-composition-as-conversion | absence-as-demand | reject |
| sources-additive-as-demand | absence-as-demand | reject |
| missing-as-zero-then-demand | absence-as-zero | reject |
| stale-partial-as-demand | absence-as-demand | reject |
| owner-qa-issue-as-demand | absence-as-demand | reject |
| pulse-empty-tool-map-as-demand | absence-as-demand | reject |
| mcp-surface-get-as-demand | absence-as-demand | reject |
| unpaid-402-trace-as-demand | absence-as-demand | reject |
| catalog-count-as-demand | absence-as-demand | reject |
| unique-humans-estimate-as-demand | absence-as-demand | reject |
| analytics-count-as-demand | absence-as-demand | reject |
| presence-snapshot-as-demand | absence-as-demand | reject |
| buyer-setup-nested-as-demand | absence-as-demand | reject |
| moltjobs-unlabeled-composition-as-demand | absence-as-demand | reject |
| x402stats-series-unlabeled-as-demand | absence-as-demand | reject |
| liquidity-funnel-as-demand | absence-as-demand | reject |
| liquidity-unlabeled-as-demand | absence-as-demand | reject |
| scoped-no-change-as-demand | absence-as-demand | reject |
| series-buyers-as-unique-humans | absence-as-demand | reject |
| seller-conformance-as-demand | absence-as-demand | reject |
| recruited-receipt-as-demand | absence-as-demand | reject |
| issue-evidence-as-demand | absence-as-demand | reject |
