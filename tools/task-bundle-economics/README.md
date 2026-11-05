# Task bundle economics (signer-free)

Offline helper that reads a bounded task-bundle JSON file and returns:

- grouping advice for the supplied tasks
- reviewer-exception decisions when objective acceptance is not enough
- a transparent 5 percent gross / equal-net fee readout, only when existing terms already say `feeBps: 500` and `feeBasis: "new_job_gross"`
- a direct versus bundled effort comparison, with `costs_unknown` when evidence is missing
- a portable requester receipt

It does not pay, sign, reserve funds, invent a take rate, price old work, commission a job, or execute verifier payloads. Auto-accept-to-lower-cost flags are refused.

Fee arithmetic is imported from the existing SameDayDesk rail:

- module: `vendor/hosted-wallet-market/src/fee.mjs`
- `FEE_BPS = 500`
- `feePerCapture` and `quoteEconomics` (single capture, `feeBasis: "new_job_gross"`)
- source pin: `epistemedeus/samedaydesk@9f6c0c4e396dd7677f334400eed93e3445fad600`
- consumer branch: `codex/h136010-machine-release-20261103`

`cumulativeFloorDelta` uses the same per-capture floor as `feePerCapture`: bundled fee minus the sum of separate capture fees. Bundling never lowers the 500 bps floor total; leftover remainders can raise the bundled fee by a small atomic amount. That difference is disclosed, not hidden.

Break-even notes use the existing `breakEvenGross` idea from `runtime/agent-economy-foundation/dist/money.js`: twenty times a measured variable cost. That file is not imported (it pulls `ajv`). The formula is applied only when cost evidence is measured.

Reservation identifiers, digest fields, and unknown keys are preserved and echoed. They are not rewritten.

## Commands

```bash
node tools/task-bundle-economics/cli.mjs evaluate --input tools/task-bundle-economics/fixtures/bundle-helpful.json
node tools/task-bundle-economics/cli.mjs receipt --input tools/task-bundle-economics/fixtures/bundle-helpful.json --out /tmp/bundle-receipt.json
node tools/task-bundle-economics/cli.mjs compare --input tools/task-bundle-economics/fixtures/unknown-effort.json
node tools/task-bundle-economics/cli.mjs diagnose --input tools/task-bundle-economics/fixtures/diagnosis-accepted.json
node --test tools/task-bundle-economics/test/*.test.mjs
```

`evaluate` prints the full decision. `receipt` writes a portable JSON receipt a requester can keep with the bundle. `compare` focuses on measured versus unknown effort and the fee totals. `diagnose` prints an evidence-only structured diagnosis and does not decide acceptance.

Input is limited to 1 MiB, 24 nested levels, 1,000 entries per array or object, 20,000 total nodes, 64 KiB per string, and 64 tasks. Criteria follow the cold-requester 0.3.1 market limit: 1 to 16 unique nonempty strings when present.



## Diagnose (evidence, not acceptance)

`diagnose` writes a bounded structured diagnosis (`pilot.task-bundle-economics.diagnosis.v1`, artifact class `bounded_structured_diagnosis`). It maps existing acceptance outcomes to evidence labels. It does not rename those acceptance strings on the evaluate path, and it does not decide acceptance.

| Acceptance outcome | `evidenceOutcome` |
| --- | --- |
| `objective_acceptance_met` | `meets_criteria` |
| `objective_not_met` | `refused` |
| `needs_reviewer_exception` | `needs_review` |

The diagnosis sets `evidenceOnly: true` and `acceptance: "not_decided_by_tool"`. `autoAccept` stays false. Unknown review, support, and contributor cost lines stay unknown. Fee arithmetic still uses the existing `FEE_BPS=500` rail when terms already authorize it.

Observation-only bundles stay usable as `evidenceBasis: "declared_evidence"` and are not labeled as artifact inspection. Citations on that path remain declarations (`bindingStatus: "declared"`).

### Artifact inspection (`bounded_structured_extract`)

When `delivery.artifact` or `delivery.artifactPath` is present, diagnose loads one supported delivery artifact class:

- schema: `pilot.task-bundle-economics.structured-extract.v1`
- class: `bounded_structured_extract`
- observable fields: `heading`, `headingDigest`, `sourceLabel`

Caller-owned `objectiveCriteria` declare the check, observe field, and expected value. Observations are taken from the parsed artifact, not from contributor-supplied `observed` values. Cited evidence is bound only when the locator names an artifact field and the digest matches that field. Missing artifact, missing expected, unbound citation, unsupported class, or ambiguous artifact source yields `needs_review` or `refused`, never `meets_criteria`. Provenance and cited-evidence coverage gate `meets_criteria` on both paths.

The diagnose CLI resolves `artifactPath` relative to the input JSON directory and reads that bounded file in the same separate process. An absolute `artifactPath` is a caller-owned local filesystem path. This helper does not fetch `http` or `https` URLs, does not accept a hosted upload, and does not retrieve `sourceUri`. Hosted upload is a different authority boundary and is unsupported. A URL in `artifactPath` is not downloaded. It is only a local path read, which fails closed when the path is not a readable caller-owned file.

```bash
node tools/task-bundle-economics/cli.mjs diagnose --input tools/task-bundle-economics/fixtures/diagnosis-accepted.json
node tools/task-bundle-economics/cli.mjs diagnose --input tools/task-bundle-economics/fixtures/diagnosis-rejected.json
node tools/task-bundle-economics/cli.mjs diagnose --input tools/task-bundle-economics/fixtures/diagnosis-corrected.json
node tools/task-bundle-economics/cli.mjs diagnose --input tools/task-bundle-economics/fixtures/diagnosis-artifact-positive.json
node tools/task-bundle-economics/cli.mjs diagnose --input tools/task-bundle-economics/fixtures/diagnosis-artifact-tamper.json
node tools/task-bundle-economics/cli.mjs diagnose --input tools/task-bundle-economics/fixtures/diagnosis-artifact-missing.json
```

## Measured versus unknown

| Signal | When |
| --- | --- |
| `measured` | Every compared cost was supplied as an integer atomic decimal string with `measured: true`. |
| `costs_unknown` | A cost is missing, marked `status: "costs_unknown"`, or not measured. The helper does not invent a price. |
| `bundle_lowers_measured_effort` | Known bundled cost is lower than the sum of known direct costs. |
| `direct_lower_measured_effort` | Known separate costs are lower than the bundled cost. |
| `needs_reviewer_exception` | Objective, deterministic checks cannot decide acceptance. A cheaper bundle does not change that outcome. |
| `objective_acceptance_met` | Every listed criterion has a deterministic check (`present`, `exact_equal`, `digest_match`, or `enum_in`) and each check passed. |
| `objective_not_met` | Deterministic checks ran and at least one failed. |

Atomic amounts are decimal integer strings, matching `fee.mjs` (`^(0|[1-9][0-9]{0,18})$`). No floating-point currency math is used.

## Fixtures

| File | What it shows |
| --- | --- |
| `fixtures/direct-cheaper.json` | Measured separate effort is lower, so the decision is `keep_separate`. |
| `fixtures/bundle-helpful.json` | Measured bundled effort is lower, so the decision is `suggest_bundle`. |
| `fixtures/exception-needed.json` | Reviewer judgment is required. `autoAcceptToLowerCost` is refused and the verifier payload is not executed. |
| `fixtures/unknown-effort.json` | Fee terms can still be read out, but effort comparison is `costs_unknown`. |
| `fixtures/reservation-preserved.json` | `reservationId` and extra unknown fields pass through unchanged. |
| `fixtures/floor-delta.json` | Synthetic 19 + 19 atomic units, where the bundled floor is one unit higher than the separate floors. |
| `fixtures/unauthorized-terms.json` | Terms that are not 500 bps / `new_job_gross` do not receive an invented take rate. |
| `fixtures/diagnosis-accepted.json` | Declared-evidence accepted diagnosis case with a measured rail line and unknown review, support, and contributor lines. |
| `fixtures/diagnosis-rejected.json` | Declared-evidence rejected diagnosis case used as the sibling of the corrected resubmission. |
| `fixtures/diagnosis-corrected.json` | Declared-evidence corrected resubmission: `expectedRevision` increases by one, `reservationId` and `termsDigest` stay the same. |
| `fixtures/diagnosis-artifact-positive.json` | Artifact-backed positive structured extract (path). |
| `fixtures/diagnosis-artifact-tamper.json` | Same metadata as positive; changed artifact content refuses. |
| `fixtures/diagnosis-artifact-missing.json` | Missing artifact path needs review. |
| `fixtures/diagnosis-artifact-missing-expected.json` | Artifact present; expected value absent. |
| `fixtures/diagnosis-artifact-citation-unbound.json` | Citation digest does not match artifact field. |
| `fixtures/diagnosis-artifact-unsupported.json` | Unsupported artifact class. |
| `fixtures/diagnosis-artifact-ambiguous.json` | Both embedded artifact and artifactPath. |
| `fixtures/diagnosis-artifact-corrected.json` | Corrected artifact resubmission after tamper. |
| `fixtures/diagnosis-artifact-embedded.json` | Artifact-backed positive with embedded extract. |
| `fixtures/artifacts/*.json` | Bounded structured-extract bodies for the cases above. |

## Example

`examples/rn5-consumers/` is a historical no-fit fixture. Its `example.com` title change is constructed input, not an observed website change or customer demand. The entry label is `examples/rn5-consumers/DECISION.md`. `ce-run.sh` reproduces `evaluate`, `compare`, and `receipt` at consumer pin `90939f157fcb33606c0f5ccfbffbc10b9e51e64a` from embedded fixture bytes. `requester-receipt.local.json` is the original generated receipt and is not regenerated from later source.

Cold-requester / accepted-work field names consumed for alignment (not rewritten here): `taskId`, `title`, `summary`, `criteria`, `payableKinds`, `termsDigest`, `artifactDigest`, `rightsDigest`, `expectedRevision`, `publicationConsent`, and `reservationId`.
