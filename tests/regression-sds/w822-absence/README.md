# SDS absence≠demand regression (W0-X201 / w822)

Fixtures and verifier that **reject** claims treating SDS absence as market or paid demand, and that **accept** honest withheld-demand records. Cold run also imports real SDS observatory/market-stats/pricing artifacts and fails closed if those pins drift.

Write boundary: `tests/regression-sds/w822-absence/**` only. Disjoint from `tests/regression-sds/absence-not-demand-w7/**` (PR#185). No Stripe/x402. No `--live`. No edits outside this tree.

Cite (read-only): x402scan is documented-unavailable and never called as success; moltjobs totals-vs-marketplace is composition not conversion; sources are not additive; missing is not zero; scoped no-change is not demand.

## Layout

```
tests/regression-sds/w822-absence/
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
node tests/regression-sds/w822-absence/run.mjs --json

# Seeded absence-as-demand fed as accept → exit ≠0, error.code SEED_REJECT
node tests/regression-sds/w822-absence/run.mjs --seeded-absence-as-demand --json

# Direct verify of seed as accept
node tests/regression-sds/w822-absence/verify.mjs \
  --fixture fixtures/cases/x402scan-unavailable-as-demand.json --expect accept --json

node --test tests/regression-sds/w822-absence/*.test.mjs
```

## Cases

| id | class | verdict |
| --- | --- | --- |
| x402scan-unavailable-honest | honest-withheld | accept |
| moltjobs-composition-honest | honest-withheld | accept |
| missing-metrics-not-zero-honest | honest-withheld | accept |
| scoped-no-change-honest | honest-withheld | accept |
| x402scan-unavailable-as-demand | **seed** | reject |
| moltjobs-composition-as-conversion | absence-as-demand | reject |
| sources-additive-as-demand | absence-as-demand | reject |
| missing-as-zero-then-demand | absence-as-zero | reject |
| stale-partial-as-demand | absence-as-demand | reject |
| scoped-no-change-as-demand | absence-as-demand | reject |
| presence-snapshot-as-demand | absence-as-demand | reject |
| liquidity-funnel-as-demand | absence-as-demand | reject |
| series-buyers-as-unique-humans | absence-as-demand | reject |
| unpaid-402-trace-as-demand | absence-as-demand | reject |
| moltjobs-unlabeled-composition-as-demand | absence-as-demand | reject |
| liquidity-unlabeled-as-demand | absence-as-demand | reject |
| x402stats-series-unlabeled-as-demand | absence-as-demand | reject |
| buyer-setup-nested-as-demand | absence-as-demand | reject |
