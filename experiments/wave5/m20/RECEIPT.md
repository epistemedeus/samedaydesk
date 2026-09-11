# W5-M20 RECEIPT — first-use / drop-off / repeat-job readout

**Task:** W5-M20  
**Repo:** `epistemedeus/samedaydesk`  
**Branch:** `cursor/w5-m20-first-use-drop-off-and-repeat-job-readout-that-changes-the-next-offer-bb85`  
**StartingRef:** `aeef964fa188443078958d9d6d393afae1d542ee` (SDS PR52)  
**Pilot packet:** `epistemedeus/pilot@95b3f3a47f5b1b69bd237e4c978fc3376221365d`  
**Contract:** `samedaydesk.wave5.m20.readout.v1`

## What

Thin readout over PR52 `runPaidOffer`. Distinguishes no-reply, failed-use,
useful-use and paid-return. Recommends exactly one next offer change.
Owner-qa dry-run is labelled and is not independent demand. Fixture-funded
repeats are not paid return. Absent D27/M15-M19 receipts are sibling-pending.

## Tests

See the updated counts after the suite run in this branch.

```bash
node --test --test-concurrency=1 experiments/wave5/m20/test/*.test.mjs
```

## Integration limits

Tested implementation: PR52 `runPaidOffer` at `aeef964`. This checkout has no
`createExecutor` / `samedaydesk.paid-useful-jobs.execution.v1`. Remaining
binding: M01 re-runs against D01 kernel `6bed72dd` and against real D27/M15-M19
receipts. No live settlement, deploy, spend, or unsolicited messages.
