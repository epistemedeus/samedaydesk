# W5-D04 RECEIPT — Co20 managed-order client

**Task:** W5-D04  
**Repo:** `epistemedeus/samedaydesk`  
**Branch:** `cursor/w5-d04-co20-managed-order-client-removing-its-competing-runner-979c`  
**StartingRef:** `13d1fc023ce235b1611dc868caf5dd84fe5f11c7`  
**Pilot source:** `epistemedeus/pilot@95b3f3a47f5b1b69bd237e4c978fc3376221365d`  
**Tested D01:** `6bed72dd22a396134aa5c957933b42c3a5746698` (`codex/w5-d01-20260911`, PR74)  
**Packet PR52 pin:** `aeef964fa188443078958d9d6d393afae1d542ee`  
**Contract:** `samedaydesk.paid-useful-jobs.execution.v1`

## What

Removed the competing useful-jobs CLI runner (`lib/engine.mjs`, `lib/kit.mjs`).
The order client now calls D01 `createExecutor`/`runPaidOffer` (optional
`--execute-url` posts to D01 `/execute`). Reserve happens before execute.
Concurrent CLI processes and two Postgres clients produce one order. A dead
reserved holder is adopted once. `sold` stays false.

## Changed paths

- `tools/managed-useful-jobs-order/`
- `experiments/wave5/d04/RECEIPT.md`

## Tests

```bash
node --test tools/managed-useful-jobs-order/test/*.test.mjs
```

Counts filled after this worker's execution.

## Integration limits

- Tested implementation: D01 `6bed72dd` + this client. Not a future sibling.
- Remaining binding: D01 may still amend the wrapper; D19 owns multi-process
  order/ledger tests beyond this package.
- No homepage, root manifest, live settlement, deploy, or new spend.
