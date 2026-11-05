import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { diagnoseFor } from "../src/evaluate.mjs";
import { STRUCTURED_EXTRACT_CLASS } from "../src/artifact.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "../fixtures");
const root = join(here, "..");
const siteRoot = join(here, "../../..");
const cli = join(root, "cli.mjs");

function load(name) {
  return JSON.parse(readFileSync(join(fixtures, name), "utf8"));
}

function runDiagnose(relPath) {
  return spawnSync(
    process.execPath,
    [cli, "diagnose", "--input", `tools/task-bundle-economics/fixtures/${relPath}`],
    { encoding: "utf8", cwd: siteRoot },
  );
}

test("artifact-backed positive inspects structured extract fields", () => {
  const diagnosis = diagnoseFor(load("diagnosis-artifact-positive.json"), {
    baseDir: fixtures,
  });
  assert.equal(diagnosis.ok, true);
  assert.equal(diagnosis.supportedDeliveryArtifactClass, STRUCTURED_EXTRACT_CLASS);
  const task = diagnosis.tasks[0];
  assert.equal(task.evidenceBasis, "artifact_inspection");
  assert.equal(task.artifactInspection, true);
  assert.equal(task.evidenceOutcome, "meets_criteria");
  assert.equal(task.acceptanceOutcome, "objective_acceptance_met");
  assert.equal(task.artifactLoad.status, "loaded");
  assert.equal(task.artifactLoad.fields.headingDigest, "heading-accepted");
  assert.equal(task.citationBinding.allBound, true);
  assert.equal(task.citedEvidence[0].bindingStatus, "bound");
  assert.deepEqual(task.gateReasons, []);
});

test("same-metadata tampered artifact changes the evidence outcome", () => {
  const positive = diagnoseFor(load("diagnosis-artifact-positive.json"), { baseDir: fixtures });
  const tamper = diagnoseFor(load("diagnosis-artifact-tamper.json"), { baseDir: fixtures });
  assert.equal(positive.tasks[0].reservationId, tamper.tasks[0].reservationId);
  assert.equal(positive.tasks[0].termsDigest, tamper.tasks[0].termsDigest);
  assert.equal(positive.tasks[0].rightsDigest, tamper.tasks[0].rightsDigest);
  assert.equal(positive.tasks[0].expectedRevision, tamper.tasks[0].expectedRevision);
  assert.equal(positive.tasks[0].taskId, tamper.tasks[0].taskId);
  assert.equal(positive.tasks[0].artifactDigest, tamper.tasks[0].artifactDigest);
  assert.equal(positive.tasks[0].evidenceOutcome, "meets_criteria");
  assert.equal(tamper.tasks[0].evidenceOutcome, "refused");
  assert.equal(tamper.tasks[0].artifactLoad.fields.headingDigest, "heading-tampered");
  assert.notEqual(positive.tasks[0].evidenceOutcome, tamper.tasks[0].evidenceOutcome);
});

test("missing artifact file needs review", () => {
  const diagnosis = diagnoseFor(load("diagnosis-artifact-missing.json"), { baseDir: fixtures });
  const task = diagnosis.tasks[0];
  assert.equal(task.evidenceBasis, "artifact_inspection");
  assert.equal(task.evidenceOutcome, "needs_review");
  assert.equal(task.artifactLoad.status, "missing");
  assert.ok(task.gateReasons.includes("artifact_unreadable") || task.gateReasons.includes("artifact_missing"));
});

test("missing expected value cannot meet criteria", () => {
  const diagnosis = diagnoseFor(load("diagnosis-artifact-missing-expected.json"), { baseDir: fixtures });
  const task = diagnosis.tasks[0];
  assert.equal(task.evidenceBasis, "artifact_inspection");
  assert.notEqual(task.evidenceOutcome, "meets_criteria");
  assert.ok(
    task.gateReasons.includes("expected_absent")
      || task.acceptanceOutcome === "needs_reviewer_exception",
  );
});

test("unbound citation cannot meet criteria", () => {
  const diagnosis = diagnoseFor(load("diagnosis-artifact-citation-unbound.json"), {
    baseDir: fixtures,
  });
  const task = diagnosis.tasks[0];
  assert.equal(task.evidenceBasis, "artifact_inspection");
  assert.notEqual(task.evidenceOutcome, "meets_criteria");
  assert.equal(task.citationBinding.allBound, false);
  assert.equal(task.citedEvidence[0].bindingStatus, "unbound");
  assert.ok(task.gateReasons.includes("cited_evidence_unbound"));
});

test("unsupported artifact class needs review", () => {
  const diagnosis = diagnoseFor(load("diagnosis-artifact-unsupported.json"), { baseDir: fixtures });
  const task = diagnosis.tasks[0];
  assert.equal(task.evidenceOutcome, "needs_review");
  assert.equal(task.artifactLoad.status, "unsupported");
});

test("ambiguous artifact source needs review", () => {
  const diagnosis = diagnoseFor(load("diagnosis-artifact-ambiguous.json"), { baseDir: fixtures });
  const task = diagnosis.tasks[0];
  assert.equal(task.evidenceBasis, "ambiguous");
  assert.equal(task.evidenceOutcome, "needs_review");
  assert.ok(task.gateReasons.includes("artifact_source_ambiguous"));
});

test("corrected artifact resubmission keeps reservation and terms", () => {
  const tamper = diagnoseFor(load("diagnosis-artifact-tamper.json"), { baseDir: fixtures });
  const corrected = diagnoseFor(load("diagnosis-artifact-corrected.json"), { baseDir: fixtures });
  assert.equal(tamper.tasks[0].evidenceOutcome, "refused");
  assert.equal(corrected.tasks[0].evidenceOutcome, "meets_criteria");
  assert.equal(tamper.tasks[0].reservationId, corrected.tasks[0].reservationId);
  assert.equal(tamper.tasks[0].termsDigest, corrected.tasks[0].termsDigest);
  assert.equal(corrected.tasks[0].expectedRevision, tamper.tasks[0].expectedRevision + 1);
  assert.notEqual(tamper.tasks[0].artifactDigest, corrected.tasks[0].artifactDigest);
});

test("embedded artifact positive works without a path", () => {
  const diagnosis = diagnoseFor(load("diagnosis-artifact-embedded.json"), { baseDir: fixtures });
  assert.equal(diagnosis.tasks[0].evidenceOutcome, "meets_criteria");
  assert.equal(diagnosis.tasks[0].artifactLoad.source, "embedded");
});

test("diagnose CLI reads the artifact path relative to the input file", () => {
  const positive = runDiagnose("diagnosis-artifact-positive.json");
  assert.equal(positive.status, 0, positive.stderr);
  const body = JSON.parse(positive.stdout);
  assert.equal(body.tasks[0].evidenceOutcome, "meets_criteria");
  assert.equal(body.tasks[0].artifactLoad.fields.headingDigest, "heading-accepted");

  const tamper = runDiagnose("diagnosis-artifact-tamper.json");
  assert.equal(tamper.status, 0, tamper.stderr);
  const tamperBody = JSON.parse(tamper.stdout);
  assert.equal(tamperBody.tasks[0].evidenceOutcome, "refused");
  assert.equal(tamperBody.tasks[0].artifactLoad.fields.headingDigest, "heading-tampered");

  const missing = runDiagnose("diagnosis-artifact-missing.json");
  assert.equal(missing.status, 0, missing.stderr);
  const missingBody = JSON.parse(missing.stdout);
  assert.equal(missingBody.tasks[0].evidenceOutcome, "needs_review");
});
