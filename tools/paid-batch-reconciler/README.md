# Fixture paid-batch reconciler (W4-commerce-08)

Local **non-settling** batch ledger around the six PR51 useful-jobs engines.
F08 `runPaidOffers` is a sequential loop; this package is the ledger: item-level
price, outcome, and fundingState, with partial-failure reconciliation.

`sold` is always false. Fixture price is labelled **0.02 USDC** and is not
published to the live catalog. Live extract remains **0.005**; seller-integrity-audit
remains **0.01**. Live settlement is out of scope.

## Journey (copy-paste, offline)

Node >= 22, from the repository root:

```bash
node tools/paid-batch-reconciler/bin/batch.mjs run \
  tools/paid-batch-reconciler/fixtures/batches/partial-vendor-budget.json \
  --out-dir /tmp/paid-batch-partial
```

Expected ledger: one `vendor-budget-impact` completed, one rejected
(`missing-required-inputs` for the missing `--after`), batch `status: partial`,
`sold: false`, both item prices `kind: fixture` / `0.02`.

## Tests

```bash
node --test tools/paid-batch-reconciler/test/*.test.mjs
```

Optional F08 pin (not on main):

```bash
F08_PIN_ROOT=/path/to/samedaydesk@bae3e7cd5034b21019fb272a99d88db964b831ee \
  node --test tools/paid-batch-reconciler/test/*.test.mjs
```

Postgres 16 local binaries (`/usr/lib/postgresql/16/bin`) are used for the
real-cluster test. If they are missing, that test skips and is recorded as
untested local-runtime, not as a fixture fake.

## Bindings Root still owns

- F08 paid wrappers (`server/paid-useful-jobs`, pin `bae3e7cd`) via `F08_PIN_ROOT`
- I01 hasher is vendored from Neo PR54 (`819fa637`); integer `termsVersion` is rejected
