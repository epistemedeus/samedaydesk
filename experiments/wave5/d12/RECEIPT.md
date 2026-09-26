# W5-D12 receipt

- **Repo:** epistemedeus/samedaydesk
- **Branch:** `cursor/w5-d12-co08-batch-reconciliation-consuming-one-runner-and-funding-contract-02ad`
- **Starting ref:** `ec03dc3445ac73a4a1010712b23a709bd3a7fed3`
- **PR:** https://github.com/epistemedeus/samedaydesk/pull/93 (draft)
- **Runner pin tested:** SDS PR52 `aeef964fa188443078958d9d6d393afae1d542ee`
- **Proof:** Duplicate/traversing items rejected; valid mixed batch keeps each item and charge distinct
- **Tests:** `F08_PIN_ROOT=/tmp/sds-pr52-aeef964 node --test --test-concurrency=1 tools/paid-batch-reconciler/test/*.test.mjs` — **22 pass, 0 fail, 0 skip**
- **Remaining binding:** W5-D01 may amend `server/paid-useful-jobs`; this ledger does not claim later D01 behavior
