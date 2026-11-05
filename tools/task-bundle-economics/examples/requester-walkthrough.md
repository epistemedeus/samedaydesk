# Requester walkthrough

These commands stay offline. They read a JSON file you already have and print a decision or a receipt. They do not contact a market, move money, or accept work.

## 1. See whether bundling helps

```bash
node tools/task-bundle-economics/cli.mjs evaluate --input tools/task-bundle-economics/fixtures/bundle-helpful.json
```

Read `bundleDecision.action`. For this fixture it is `suggest_bundle` because the measured bundled cost is `250000` and the measured separate costs sum to `380000`. `acceptanceSummary.acceptedCount` is 2. Nothing is paid.

The same file's fee readout uses the existing 500 bps terms on each task:

- each `4000000` gross has platform fee `200000` and contributor net `3800000`
- the combined `8000000` gross has platform fee `400000` and contributor net `7600000`
- `cumulativeFloorDelta` is `"0"`, so bundled and separate floors match

## 2. Keep a portable receipt

```bash
node tools/task-bundle-economics/cli.mjs receipt --input tools/task-bundle-economics/fixtures/bundle-helpful.json --out /tmp/bundle-helpful-receipt.json
```

The receipt names the fee module, the 500 bps policy, measured effort, and the grouping decision. `signer`, `paymentCommand`, and `fundedCommission` are false.

## 3. Disclose unknown effort

```bash
node tools/task-bundle-economics/cli.mjs compare --input tools/task-bundle-economics/fixtures/unknown-effort.json
```

Fee totals are still visible from the supplied terms. `effort.comparison` is `costs_unknown` because no measured cost evidence was provided. The helper does not fill in a number.

## 4. Do not auto-accept a judgment call

```bash
node tools/task-bundle-economics/cli.mjs evaluate --input tools/task-bundle-economics/fixtures/exception-needed.json
```

`acceptance.outcome` is `needs_reviewer_exception`. The fixture sets `autoAcceptToLowerCost` and includes a verifier payload; both are recorded and refused. The payload is not executed.
