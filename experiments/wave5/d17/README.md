# W5-D17 domain-outcome contract tests

Classifies current SDS52 wrapper CLI results. Does not copy useful-jobs
engines. Does not rewrite the homepage or root manifest.

## Tests

From the SameDayDesk repository root:

```bash
node --test --test-concurrency=1 experiments/wave5/d17/test/*.test.mjs
```

or `npm test` inside `experiments/wave5/d17`.

## Classifier CLI

```bash
node experiments/wave5/d17/bin/classify-domain-outcome.mjs run vendor-budget-impact \
  --before server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/before.json \
  --after server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/after.json \
  --out-dir /tmp/d17-out
```

Tested pin: SDS PR52 `aeef964fa188443078958d9d6d393afae1d542ee`. Remaining
binding is recorded in `PIN.json` and `RECEIPT.md`.
