import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { diagnoseFor, evaluateBundle } from "../src/evaluate.mjs";
import { FEE_BPS, FEE_MODULE } from "../src/economics.mjs";
import { validateBundle } from "../src/schema.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "../fixtures");
const root = join(here, "..");
const siteRoot = join(here, "../../..");
const cli = join(root, "cli.mjs");

function load(name) {
  return JSON.parse(readFileSync(join(fixtures, name), "utf8"));
}

function runDiagnose(name) {
  return spawnSync(
    process.execPath,
    [cli, "diagnose", "--input", `tools/task-bundle-economics/fixtures/${name}`],
    { encoding: "utf8", cwd: siteRoot },
  );
}

test("evidence outcomes map without renaming evaluate-path acceptance strings", () => {
  const acceptedEval = evaluateBundle(load("diagnosis-accepted.json"));
  const accepted = diagnoseFor(load("diagnosis-accepted.json"));
  assert.equal(acceptedEval.tasks[0].acceptance.outcome, "objective_acceptance_met");
  assert.equal(accepted.tasks[0].evidenceOutcome, "meets_criteria");
  assert.equal(accepted.tasks[0].acceptanceOutcome, "objective_acceptance_met");

  const rejectedEval = evaluateBundle(load("diagnosis-rejected.json"));
  const rejected = diagnoseFor(load("diagnosis-rejected.json"));
  assert.equal(rejectedEval.tasks[0].acceptance.outcome, "objective_not_met");
  assert.equal(rejected.tasks[0].evidenceOutcome, "refused");
  assert.equal(rejected.tasks[0].acceptanceOutcome, "objective_not_met");

  const exceptionEval = evaluateBundle(load("exception-needed.json"));
  const exception = diagnoseFor(load("exception-needed.json"));
  assert.equal(exceptionEval.tasks[0].acceptance.outcome, "needs_reviewer_exception");
  assert.equal(exception.tasks[0].evidenceOutcome, "needs_review");
  assert.equal(exception.requesterException.needed, true);
  assert.deepEqual(exception.requesterException.taskIds, ["tone-review"]);
});

test("accepted diagnosis is evidence-only and reuses the existing 500 bps floor", () => {
  const diagnosis = diagnoseFor(load("diagnosis-accepted.json"));
  assert.equal(diagnosis.ok, true);
  assert.equal(diagnosis.schema, "pilot.task-bundle-economics.diagnosis.v1");
  assert.equal(diagnosis.artifactClass, "bounded_structured_diagnosis");
  assert.equal(diagnosis.evidenceOnly, true);
  assert.equal(diagnosis.acceptance, "not_decided_by_tool");
  assert.equal(diagnosis.autoAccept, false);
  assert.equal(diagnosis.signer, false);
  assert.equal(diagnosis.paymentCommand, false);
  assert.equal(diagnosis.fundedCommission, false);
  assert.equal(diagnosis.verifierExecuted, false);
  assert.equal(diagnosis.provenance, "synthetic");
  assert.equal(diagnosis.tasks[0].provenance, "synthetic");
  assert.equal(diagnosis.tasks[0].evidenceBasis, "declared_evidence");
  assert.equal(diagnosis.tasks[0].artifactInspection, false);
  assert.equal(diagnosis.tasks[0].citedEvidence[0].digest, "heading-accepted");
  assert.equal(diagnosis.tasks[0].citedEvidence[0].bindingStatus, "declared");
  assert.equal(diagnosis.rails.feeBps, FEE_BPS);
  assert.equal(diagnosis.rails.feeModule, FEE_MODULE);
  assert.equal(diagnosis.tasks[0].economics.feeReadout, "authorized_existing_terms");
  assert.equal(diagnosis.tasks[0].economics.feeBps, 500);
  assert.equal(diagnosis.tasks[0].economics.platformFeeAtomic, "100000");
  assert.equal(diagnosis.tasks[0].economics.contributorNetAtomic, "1900000");
  assert.equal(diagnosis.tasks[0].economics.thisQuoteFeeIsExactFivePercent, true);
});

test("unknown review, support, and contributor lines stay unknown", () => {
  const diagnosis = diagnoseFor(load("diagnosis-accepted.json"));
  const known = diagnosis.tasks[0].inputClosure.knownCosts;
  const unknown = diagnosis.tasks[0].inputClosure.unknownCosts;
  assert.deepEqual(known, [{ kind: "rail", status: "measured", atomic: "0" }]);
  assert.deepEqual(
    unknown.map((line) => line.kind).sort(),
    ["contributor", "review", "support"],
  );
  for (const line of unknown) {
    assert.equal(line.status, "unknown");
    assert.equal(line.atomic, undefined);
  }
});

test("corrected resubmission keeps reservation and terms obligations", () => {
  const rejectedInput = load("diagnosis-rejected.json");
  const correctedInput = load("diagnosis-corrected.json");
  const rejectedEval = evaluateBundle(rejectedInput);
  const correctedEval = evaluateBundle(correctedInput);
  const rejected = diagnoseFor(rejectedInput);
  const corrected = diagnoseFor(correctedInput);

  assert.equal(rejected.tasks[0].evidenceOutcome, "refused");
  assert.equal(corrected.tasks[0].evidenceOutcome, "meets_criteria");
  assert.equal(correctedEval.tasks[0].acceptance.outcome, "objective_acceptance_met");
  assert.equal(rejected.tasks[0].taskId, corrected.tasks[0].taskId);
  assert.equal(rejected.tasks[0].reservationId, "rsv_diagnosis_revision");
  assert.equal(rejected.tasks[0].reservationId, corrected.tasks[0].reservationId);
  assert.equal(rejected.tasks[0].termsDigest, corrected.tasks[0].termsDigest);
  assert.equal(rejectedEval.tasks[0].reservationId, rejectedInput.tasks[0].reservationId);
  assert.equal(correctedEval.tasks[0].reservationId, correctedInput.tasks[0].reservationId);
  assert.equal(rejectedEval.tasks[0].termsDigest, rejectedInput.tasks[0].termsDigest);
  assert.equal(correctedEval.tasks[0].termsDigest, correctedInput.tasks[0].termsDigest);
  assert.equal(corrected.tasks[0].expectedRevision, rejected.tasks[0].expectedRevision + 1);
  assert.notEqual(rejected.tasks[0].artifactDigest, corrected.tasks[0].artifactDigest);
});

test("diagnose CLI runs as a separate process and echoes acquisition", () => {
  const result = runDiagnose("diagnosis-accepted.json");
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.schema, "pilot.task-bundle-economics.diagnosis.v1");
  assert.equal(body.evidenceOnly, true);
  assert.equal(body.autoAccept, false);
  assert.equal(body.tasks[0].acquisition.processId, "task-bundle-economics-cli-diagnose");
  assert.equal(body.tasks[0].acquisition.processKind, "separate_cli_process");
  assert.equal(body.pid === undefined || body.pid !== process.pid, true);
});

test("invalid provenance is refused and unknown cost-line keys are preserved", () => {
  const bad = load("diagnosis-accepted.json");
  bad.tasks[0].provenance = "invented";
  const refused = validateBundle(bad);
  assert.equal(refused.ok, false);
  assert.match(refused.message, /provenance/);

  const extra = load("diagnosis-accepted.json");
  extra.tasks[0].costLines[0].note = "keep-this-cost-line-field";
  const validated = validateBundle(extra);
  assert.equal(validated.ok, true);
  assert.equal(validated.unknown.tasks[0].unknown.costLines[0].note, "keep-this-cost-line-field");
});
