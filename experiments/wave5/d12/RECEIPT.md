# W5-D12 receipt

See `tools/paid-batch-reconciler/RECEIPT.md` for the same facts. This file is the
assignment receipt path.

- **Repo:** epistemedeus/samedaydesk
- **Starting ref:** `ec03dc3445ac73a4a1010712b23a709bd3a7fed3`
- **Runner pin tested:** SDS PR52 `aeef964fa188443078958d9d6d393afae1d542ee`
- **Proof:** Duplicate/traversing items rejected; valid mixed batch keeps each item and charge distinct
- **Tests:** `F08_PIN_ROOT=/tmp/sds-pr52-aeef964 node --test tools/paid-batch-reconciler/test/*.test.mjs`
