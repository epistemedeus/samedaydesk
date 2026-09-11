# W5-M20 first-use and repeat-job readout

Readout kit for first-use drop-off and repeat jobs. It classifies labelled
observations into no-reply, failed-use, useful-use, and paid-return, then
recommends one next offer change. It is not a customer, a settlement, or a
second paid wrapper.

From the repository root, Node >= 22:

```bash
node experiments/wave5/m20/bin/readout.mjs status
node experiments/wave5/m20/bin/readout.mjs classify --in experiments/wave5/m20/fixtures/observations
node experiments/wave5/m20/bin/readout.mjs dry-run --buyer-class owner-qa --out-dir /tmp/m20-dry
node --test --test-concurrency=1 experiments/wave5/m20/test/*.test.mjs
```

`dry-run` invokes SDS PR52 `runPaidOffer` on caller fixtures. `sold` stays
false. reserved-fixture repeats are not paid return. Absent D27/M15-M19
receipts are sibling-pending, not customer silence.

See [CONTRACT.md](CONTRACT.md) for the field table.
