# Grexal unpaid buyer replay (S109 G3)

A buyer can validate this agent’s I/O schema from `../package/grexal.json` **without paying**. Pricing is not in the manifest. Grexal login / credits / `runs invoke` are not used.

```bash
node experiments/s109-marketplace-entry-trials/surfaces/grexal/buyer-replay/replay.mjs
node experiments/s109-marketplace-entry-trials/surfaces/grexal/buyer-replay/replay.mjs \
  --out experiments/s109-marketplace-entry-trials/surfaces/grexal/buyer-replay/receipt.json
```

Economics worksheet (floor/cap, $0.18 and $0.05 rows, attribution):
`../../../native-cells/out/G3-grexal-buyer.md`

What this proves: typed `input_schema` / `output_schema`, local `pack_evidence.js` output keys/types, `paidModelCalls=0`.

What this does not prove: hosted sandbox, listed price, settlement.
