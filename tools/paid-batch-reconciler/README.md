# Fixture paid-batch reconciler (W5-D12 / Co08)

Local **non-settling** batch ledger around SDS PR52 `runPaidOffer`.
This package is the ledger: item-level price, outcome, fundingState, and
partial-failure reconciliation. It does not spawn a second useful-jobs kernel.

`sold` is always false. Fixture price is labelled **0.02 USDC** per item and is
not published to the live catalog. Live extract remains **0.005**; seller-integrity-audit
remains **0.01**. Live settlement is out of scope.

Runner pin tested: SDS PR52 `aeef964fa188443078958d9d6d393afae1d542ee`.
Set `F08_PIN_ROOT` to a checkout of that commit (or a later D01 tree that still
exports `runPaidOffer`). Missing runner is `runner-unavailable`, not a pass.

## Journey (copy-paste, offline)

Node >= 22, from the repository root, with `F08_PIN_ROOT` set:

```bash
export F08_PIN_ROOT=/tmp/sds-pr52-aeef964
node tools/paid-batch-reconciler/bin/batch.mjs run \
  tools/paid-batch-reconciler/fixtures/batches/partial-vendor-budget.json \
  --out-dir /tmp/paid-batch-partial
```

Expected ledger: one `vendor-budget-impact` completed, one rejected
(`missing-required-inputs` for the missing `--after`), batch `status: partial`,
`sold: false`, distinct `chargeId` / `price.itemId` per item, both prices
`kind: fixture` / `0.02`.

## Tests

```bash
F08_PIN_ROOT=/tmp/sds-pr52-aeef964 \
  node --test tools/paid-batch-reconciler/test/*.test.mjs
```

Tests create the PR52 worktree when `F08_PIN_ROOT` is unset. Postgres 16
binaries (`/usr/lib/postgresql/16/bin`) are required for the persist test.
Missing runner or Postgres is incomplete, not a skipped green.

## Bindings W5-D01 still owns

- SDS PR52 / D01 `server/paid-useful-jobs` (`runPaidOffer`, `classifyFunding`)
- This ledger reports the pin SHA it imported. It does not claim later D01 amendments.
