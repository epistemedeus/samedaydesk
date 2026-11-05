# R-N5-CONSUMERS requester decision

Entry label: the `https://example.com/` title change in this example is constructed, retained fixture input. "Example Domain" and "Example Domain Updated" were not observed as a website change and are not real customer demand. The preserved requester note says "real input change" for that constructed fixture change. `requester-changed-bundle.json` and `requester-receipt.local.json` stay the original input and the original generated receipt. This note does not rewrite them.

Recommendation: no-fit

Library action: `undecided_costs_unknown`

This is not `needs_reviewer_exception`. Both tasks passed objective checks (`acceptedCount` 2, `exceptionCount` 0, `rejectedCount` 0). The package will not suggest bundling or keeping the work separate because priced effort is unknown. `inventedPricing` is false. `autoAccept` is false.

A requester who already holds the sequence-1 prior should treat the title change as recorded evidence, write a new sequenced artifact if they want a follow-up record, and leave the immutable prior untouched. Do not pay, replay a payment, reserve funds, or invent a 5 percent take rate on these captures.

## What changed in the input

Constructed fixture, not an observed site change. Retained prior versus a new permitted capture record for the same subject `example-page`, using the fixture URI `https://example.com/`. The helper does not fetch that URI.

| Side | Title | Status | Digest or content hash |
| --- | --- | --- | --- |
| Retained RecD prior `cap-prior-1` (captured 2026-11-05T10:00:00.000Z) | Example Domain | ok | payload digest `sha256:793cfc3def7fc6ae28299cff9c4eccc4751c123eb295cf4251eebe0f3542de9d` |
| Changed RecD capture `cap-changed-1` (captured 2026-11-05T11:45:00.000Z) | Example Domain Updated | ok | payload digest `sha256:88490643762427a7837d2cf3443b2c3a3800d51613f7f7264e441c8877df5c61` |
| RecD no-change control `cap-same-1` | Example Domain | ok | same digest as the prior |
| Recipe prior `source-change.prior.json` sequence 1 (created 2026-09-08T12:00:00.000Z) | Example Domain | 200 | `sha256:fixture-example-domain-v1` |
| Recipe current `example-changed.json` | Example Domain Updated | 200 | `sha256:fixture-example-domain-v2` |

Measured consumer runs (clocks already valid for each fixture family):

- RecD evaluate, clock 2026-11-05T12:00:00.000Z, horizon 24h, reference `expect-change.json`: outcome `useful_change`, reason `fields_differ`, changedFields `title`, unchangedFields `status`, `referenceMatched` true. Exit 0.
- RecD evaluate no-change control against `same.json` and `expect-no-change.json`: outcome `useful_no_change`, reason `fields_match`, digests equal. Exit 0.
- `source-change-alert` with `--fields title`, clock 2026-09-09T08:00:00.000Z, horizon 168: outcome `changed`, recovery `review_and_sequence`, payment `attempted` false and `replayBlocked` true. Exit 0.
- `verification-reconcile` on the same recipe files (related evidence, not a third bundle task): outcome `changed`, mismatches on `contentHash` and `title`, `automaticPaymentReplay` false. Exit 0.

The two bundle tasks are the RecD watch-title review and the source-change-alert follow-up. They look at the same title change through two existing rails. They are not a second synthetic twin of `fixtures/bundle-helpful.json`.

## What was measured versus unknown

Measured (derived from files or from commands that were actually run):

- RecD payload digests reported above.
- File sha256 values recorded in the bundle `railsSources.files` list.
- RecD and recipe outcomes, field diffs, freshness, payment flags, and recovery action.
- Local process wall times, stored as preserved unknown integer strings, not as priced `*CostAtomic` values:
  - RecD prior versus changed: `53896` microseconds
  - RecD no-change control: `34613` microseconds
  - source-change-alert changed: `45412` microseconds
  - verification-reconcile changed: `42426` microseconds
  - sequential RecD then source-change-alert: `71668` microseconds
- Objective acceptance: title and status on the new capture match the observed strings; source-change-alert title matches `Example Domain Updated`.

Unknown (not converted into a price):

- `bundleEffort.status` and each task `effort.status` are `costs_unknown`, with `measured` false.
- Direct and bundled `*CostAtomic` compare as `costs_unknown`.
- Break-even gross is `costs_unknown` on both sides.
- Operator CPU, disk, and wall time remain unpriced, matching `tools/recurring-job-recipes/lib/cost.mjs` (`offlineCompare`, as of 2026-09-09) and the result-reuse note that `recomputeCostAvoidedNetOfUpkeep` is `costs_unknown`.
- Wall microseconds were not written into `directCostAtomic` or `bundleEffort.costAtomic`. Doing so would have presented process time as currency and would have made `breakEvenGrossAtomic` look like money (20 times those microseconds). That would invent a price.

No reservation identifiers were present on these captures, so none were invented. `reservationIds` in the decision is `[]`.

## Fee 5 percent / equal-net readout

These captures do not already carry `feeBps: 500` and `feeBasis: "new_job_gross"`. RecD states that voluntary paid choice stays an outside experiment. The source-change-alert prior records `payment.attempted` false. The extract-batch list price of 0.01 USDC was not invoked and is not this capture's terms.

The helper therefore did not invent a take rate:

- per-task `feeReadout`: `terms_absent`
- bundled `feeReadout`: `no_authorized_task_quotes`
- no `grossAtomic` was supplied
- `cumulativeFloorDelta` is absent (no authorized quotes)
- package rails meta still names the existing policy for when terms do authorize it: `FEE_BPS=500`, `feeBasis: "new_job_gross"`, module `vendor/hosted-wallet-market/src/fee.mjs`, rounding `commerce-payments-v1.1.0-single-capture`, source pin `9f6c0c4e396dd7677f334400eed93e3445fad600`, consumer branch `codex/h136010-machine-release-20261103`

Equal-net arithmetic is preserved in that module and is unused here because there is no authorized gross to quote. That is the correct refusal, not a gap to fill with synthetic 4000000-atomic terms.

## Rails sources used

Consumed as-is. None of these rails were rewritten.

| Artifact | Commit | File sha256 |
| --- | --- | --- |
| `tools/recurring-decision-consumer/fixtures/captures/prior.json` | `c53a0d59a4749c2f583196b770a111c90510f31f` (2026-11-05 04:11:21 PT) | `e2431b00b2b0340ca49642ee38e9a0116b177653ae6fa7e10b90513e50608e32` |
| `tools/recurring-decision-consumer/fixtures/captures/changed.json` | same | `14890590f71a76f49415198b48d038d2cd8a76531ee42a0705187a3f78e2c875` |
| `tools/recurring-decision-consumer/fixtures/captures/same.json` | same (no-change control) | `66004a27df8d620fe9eed23f724a568bb44f1fff33a92cafaaff3b009b72d880` |
| `tools/recurring-decision-consumer/fixtures/intents/watch-title.json` | same | `0c4f64ae7f3d928ebe1f7551ac92888745552167d3b8e8dc2ad77ea014850e37` |
| `tools/recurring-decision-consumer/fixtures/reference/expect-change.json` | same | `4c5b0deee3bb05b1e70276797525c9d1fc19dcf72e367c40e9f174ddf2265446` |
| `tools/recurring-job-recipes/fixtures/priors/source-change.prior.json` | `66df4d478c4d359229d7df820ab9cf416d2c9e1c` (2026-09-09 08:50:47 PT) | `6c35116e799baefdf1c82a5379076251401dbb518f398f95865c92f959634761` |
| `tools/recurring-job-recipes/fixtures/current/example-changed.json` | same | `65246562f86f89b250e6fe6e0b0870f713b66b36b6e2207be2f317541b50cc08` |
| `tools/recurring-job-recipes/lib/cost.mjs` | existing rail | `eca3b06a6ed22d3760c90bfdc59faf0dab8b8e7a8553971f3c9c6e10cacfc69d` |
| `vendor/hosted-wallet-market/src/fee.mjs` | existing rail | `557cddcdb7c40fa20e1d609c670b742f2052c2bd0ab4320f8d83ab21df985b40` |
| `tools/task-bundle-economics/` helper | writer `3eb9ce994accd78206bfa87b7a1f46992c7abc43` (2026-11-05 04:23:18 PT), merged to consumer as `1c7cde5d07761286c3ccc7a8403154161d2f0895` (2026-11-05 07:41:08 PT) | package used locally from `/workspace/n5-task-economics` |

Consumer tip that includes TE plus RecD plus WE: `90939f157fcb33606c0f5ccfbffbc10b9e51e64a` (2026-11-05 07:41:27 PT), also the tip of `origin/codex/h136010-machine-release-20261103`.

`cost.mjs` sha256 `eca3b06a6ed22d3760c90bfdc59faf0dab8b8e7a8553971f3c9c6e10cacfc69d` matches that consumer tip and writer `3eb9ce99`. It does not match the blob at recipe commit `66df4d47` (`b3a0238b9be85d949c91f764849a26f53ad1ca80d2b11489cd843a2d379ba3bf`). The table's "existing rail" cell is the later file, not the September 9 recipe commit.

Local package runs from `/workspace/n5-task-economics` (writer tip `3eb9ce99`):

- evaluate exit 0, stdout `/workspace/scale-1158/te-rn5-consumers/out/evaluate.stdout`
- compare exit 0, stdout `/workspace/scale-1158/te-rn5-consumers/out/compare.stdout`
- receipt exit 0, file `/workspace/scale-1158/te-rn5-consumers/out/requester-receipt.json`

Key numbers from those runs:

- `bundleDecision.action`: `undecided_costs_unknown`
- `effort.comparison`: `costs_unknown`
- `bundledEconomics.feeReadout`: `no_authorized_task_quotes`
- acceptance: 2 met, 0 rejected, 0 exceptions
- signer / paymentCommand / fundedCommission / verifierExecuted: all false

## CE run script

Historical reproduction of `evaluate`, `compare`, and `receipt`. It is not a run of the later `diagnose` artifact inspection.

Checked-in command:

```bash
bash tools/task-bundle-economics/examples/rn5-consumers/ce-run.sh
```

`ce-run.sh` uses `set -euo pipefail`. Its default `TIP` is `90939f157fcb33606c0f5ccfbffbc10b9e51e64a`, checked out into `/tmp/n4-team/taskecon`. That pin has the three commands above and does not have `diagnose`. The script decodes an embedded copy of `requester-changed-bundle.json` (same bytes as the file in this directory). It does not read `INPUT_SRC`, and it does not copy a separate `input/` file. Optional overrides the script actually implements: `TIP`, `REPO_URL`, `FETCH_REF`, `ROOT`, `RUN_OUT`, `WORKDIR`.

The original handoff path `/workspace/scale-1158/te-rn5-consumers/ce-run.sh`, and the local outputs under `/workspace/scale-1158/te-rn5-consumers/out/` and `/workspace/n5-task-economics`, remain evidence of the run that produced this decision. They are not this checkout. That handoff did not push. A later branch commit is separate from this preserved receipt.

`requester-receipt.local.json` is that original generated receipt, sha256 `3d7488639413e718943cbd774f4fdcc5bbdf579edd0bbae118792d3bb2ffe4a5`. A fresh `receipt` on later source still returns `bundleDecision.action` `undecided_costs_unknown` and adds empty unknown containers (`costLines`, `directRoute`, `citedEvidence`, `acquisition`, `objectiveCriteria`). Those extra containers are not written back over the preserved file.
