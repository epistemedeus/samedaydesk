# W5-D12 RECEIPT — Co08 batch reconciliation

**Date:** 11 September 2026
**Assignment:** W5-D12
**Repo:** `epistemedeus/samedaydesk`
**Branch:** `cursor/w5-d12-co08-batch-reconciliation-consuming-one-runner-and-funding-contract-02ad`
**Base / startingRef:** `ec03dc3445ac73a4a1010712b23a709bd3a7fed3`
**Owned paths:** `tools/paid-batch-reconciler/`, `experiments/wave5/d12/RECEIPT.md`
**Integration owner:** W5-D01

## Runner / funding pin actually tested

SDS PR52 `aeef964fa188443078958d9d6d393afae1d542ee` (`fable/f08-paid-wrappers`) via
read-only worktree `/tmp/sds-pr52-aeef964`. Consumed exports: `runPaidOffer`,
`classifyFunding`, `wouldSettleIfGuardOmitted`. Not copied. Not a second kernel.

I01 hasher remains Neo PR54 `819fa637ecf5e5177c84efc16fcaa18d57017631`.
Ledger `termsVersion` is not forced equal to wrapper receipt hashes.

## Current-source findings (reproduced, then fixed)

| Prediction | At `ec03dc3` | After this change |
| --- | --- | --- |
| Duplicate item ids | both completed, same id | `duplicate-item`, no items sold |
| Traversing item id / `/etc/passwd` | accepted | `traversing-item` |
| Synthesized fixture funding | reserved-fixture without payment completed | `reserved-fixture-requires-payment` (PR52 contract) |
| Fallback `runner: useful-jobs` | local engines kernel | `fallback-runner-refused` |
| Fixture-funding OR (intent alone) | reserved-fixture | PR52 `reserved-fixture-requires-payment` |
| Inline JSON SAMPLE as sale | bypassed file inspect | `sample-not-a-sale` |
| Mixed batch charges | two items could share id on persist | distinct `chargeId` / `price.itemId`; Postgres unique `(batch_id, item_id)` |

Valid refusal/no-change remains a ledger outcome, not a crash.

## Remaining integration binding

W5-D01 may still amend `server/paid-useful-jobs`. This package reports pin
`aeef964` only. Wrapper kit-acquisition-before-try and other D01 defects are
not claimed fixed here.
