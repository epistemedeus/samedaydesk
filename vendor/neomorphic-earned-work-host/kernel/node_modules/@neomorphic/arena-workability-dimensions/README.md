# Arena A3 — workability dimensions

Prototype for empirical cross-judging against the S277 / F03 **single mixed workability score**. Not a merge. Does not write `packs/bounty-intelligence/`.

Own directory: `experiments/arena/workability-dimensions/`.

`claimAuthority` defaults to **none**. HTTP 200 on a list endpoint is not authority to claim.

## Literal journey

```bash
cd experiments/arena/workability-dimensions
node --experimental-strip-types examples/score-s282-fixtures.ts
node bin/workability-dimensions.mjs packet --card fixtures/s282/claimable-funded-open.card.json
node bin/workability-dimensions.mjs packet --card fixtures/s282/refuse-expired-open.card.json
npm test
```

See [FEATURE-MAP.md](FEATURE-MAP.md) and [RECEIPT.md](RECEIPT.md).
