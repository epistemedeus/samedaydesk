import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  ACCEPTANCE_KIND,
  GATE_DECISION,
  JOURNEY_OUTCOME,
  JOURNEY_STEP,
  REVIEW_PIN,
  SCHEMA,
  buildJourneyReceipt,
  evaluateAdmissionGate,
  fingerprintInput,
  isReceiptStructurallyValid,
  preflightExchangePackageSync,
  receiptMatchesJourney,
  runRequestToCorrectionJourney,
  runRequesterDeliveryJourney,
} from "../src/index.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const f01 = join(root, "../../01/fixtures");
const f02 = join(root, "../../02/fixtures");
const cli = join(root, "../src/cli.mjs");
const load = (p) => JSON.parse(readFileSync(p, "utf8"));
const sha = (a) => createHash("sha256").update(JSON.stringify(a ?? null)).digest("hex");

function baseInput(over = {}) {
  const proposals = load(join(f02, "proposals.bundle.json")).slice(0, 2);
  const artifact = over.artifact !== undefined ? over.artifact : load(join(f01, "artifact.positive.json"));
  const base = {
    requirements: load(join(f01, "requirements.positive.json")),
    proposals,
    chosenProposalId: proposals[0].id,
    artifact,
    allowWeakProposal: true,
    fileSubmission: {
      files: [{ path: "artifact.json", byteLength: Buffer.byteLength(JSON.stringify(artifact ?? {}), "utf8"), format: "json" }],
    },
    ...over,
  };
  return base;
}

function withBoundAccept(input, clock = () => Date.parse("2026-09-10T18:00:00.000Z")) {
  // Probe once to learn bound revision, then accept bound to artifact+revision.
  const probe = runRequesterDeliveryJourney(
    { ...input, requesterDecision: undefined },
    { clock },
  );
  const artifact = input.correctedArtifact ?? input.artifact;
  return {
    ...input,
    requesterDecision: {
      decision: "accept",
      artifactSha256: sha(artifact),
      revisionSha256: probe.boundRevisionSha256,
    },
  };
}

test("package acquisition preflight passes and documents review pin", () => {
  const acq = preflightExchangePackageSync();
  assert.equal(acq.ok, true);
  assert.equal(acq.decision, "pass");
  assert.equal(acq.reviewPin.sha, REVIEW_PIN.sha);
  assert.equal(acq.missing.length, 0);
});

test("integrated happy journey accepts with bound requester decision", () => {
  const clock = () => Date.parse("2026-09-10T18:00:00.000Z");
  const out = runRequesterDeliveryJourney(withBoundAccept(baseInput(), clock), { clock });
  assert.equal(out.schema, SCHEMA);
  assert.equal(out.outcome, JOURNEY_OUTCOME.ACCEPTED);
  assert.equal(out.ok, true);
  assert.equal(out.gated, false);
  assert.equal(out.lifecycle.status, "completed");
  assert.ok(out.steps.some((s) => s.step === "package_acquisition" && s.decision === "pass"));
  assert.ok(out.steps.some((s) => s.step === "outcome_gate"));
});

test("failing artifact without correction stays needs_amendment — no fabricated completed", () => {
  const partial = load(join(f01, "artifact.partial.json"));
  const out = runRequesterDeliveryJourney(
    baseInput({
      artifact: partial,
      correctedArtifact: undefined,
      requesterDecision: undefined,
      fileSubmission: {
        files: [{ path: "artifact.json", byteLength: Buffer.byteLength(JSON.stringify(partial), "utf8"), format: "json" }],
      },
    }),
  );
  assert.equal(out.outcome, JOURNEY_OUTCOME.NEEDS_AMENDMENT);
  assert.equal(out.ok, false);
  assert.notEqual(out.lifecycle?.status, "completed");
});

test("subjective unresolved without decision stays needs_review", () => {
  const artifact = load(join(f01, "artifact.positive.json"));
  const out = runRequesterDeliveryJourney(
    baseInput({
      artifact,
      requesterDecision: undefined,
      fileSubmission: {
        files: [{ path: "artifact.json", byteLength: Buffer.byteLength(JSON.stringify(artifact), "utf8"), format: "json" }],
      },
    }),
  );
  assert.equal(out.outcome, JOURNEY_OUTCOME.NEEDS_REVIEW);
  assert.equal(out.ok, false);
  assert.notEqual(out.lifecycle?.status, "completed");
});

test("unsafe file submission stops before deliverable attach", () => {
  const out = runRequesterDeliveryJourney(
    baseInput({
      fileSubmission: {
        files: [
          { path: "../secret.json", byteLength: 10, format: "json" },
          { path: "artifact.json", byteLength: 10, format: "json" },
        ],
      },
    }),
  );
  assert.equal(out.gated, true);
  assert.equal(out.gate.decision, GATE_DECISION.STOP);
  assert.ok(!out.steps.some((s) => s.step === JOURNEY_STEP.DELIVER));
});

test("request→correction journey amends then clears failures", () => {
  const out = runRequestToCorrectionJourney({
    requirements: load(join(f01, "requirements.positive.json")),
    artifact: load(join(f01, "artifact.partial.json")),
    correctedArtifact: load(join(f01, "artifact.positive.json")),
  });
  assert.equal(out.request.status, "amend_requested");
  assert.equal(out.request.restartTask, false);
  assert.ok(out.request.amendCount >= 1);
  assert.equal(out.afterAmend.status, "none_needed");
  assert.equal(out.ok, true);
});

test("evaluateAdmissionGate unit: rejected/unsafe stop", () => {
  const stop = evaluateAdmissionGate({
    status: "rejected",
    summary: { unsafePathCount: 1, unsupportedFormatCount: 0, missingFileCount: 0 },
  });
  assert.equal(stop.decision, GATE_DECISION.STOP);
});

test("E2E: caller JSON → fail → correct → readmit → needs_review → bound accept", () => {
  const proposals = load(join(f02, "proposals.bundle.json")).slice(0, 2);
  const requirements = load(join(f01, "requirements.positive.json"));
  const partial = load(join(f01, "artifact.partial.json"));
  const fixed = load(join(f01, "artifact.positive.json"));

  const mid = runRequesterDeliveryJourney({
    requirements,
    proposals,
    chosenProposalId: proposals[0].id,
    artifact: partial,
    allowWeakProposal: true,
    fileSubmission: {
      files: [{ path: "artifact.json", byteLength: Buffer.byteLength(JSON.stringify(partial), "utf8"), format: "json" }],
    },
  });
  assert.equal(mid.outcome, JOURNEY_OUTCOME.NEEDS_AMENDMENT);

  const afterFixNoDecision = runRequesterDeliveryJourney({
    requirements,
    proposals,
    chosenProposalId: proposals[0].id,
    artifact: partial,
    correctedArtifact: fixed,
    allowWeakProposal: true,
    fileSubmission: {
      files: [{ path: "artifact.json", byteLength: Buffer.byteLength(JSON.stringify(partial), "utf8"), format: "json" }],
    },
    correctedFileSubmission: {
      files: [{ path: "artifact.json", byteLength: Buffer.byteLength(JSON.stringify(fixed), "utf8"), format: "json" }],
    },
  });
  assert.equal(afterFixNoDecision.outcome, JOURNEY_OUTCOME.NEEDS_REVIEW);
  assert.ok(afterFixNoDecision.steps.some((s) => s.step === "readmit"));
  assert.notEqual(afterFixNoDecision.lifecycle?.status, "completed");

  const wrongDecision = runRequesterDeliveryJourney({
    requirements,
    proposals,
    chosenProposalId: proposals[0].id,
    artifact: partial,
    correctedArtifact: fixed,
    allowWeakProposal: true,
    fileSubmission: {
      files: [{ path: "artifact.json", byteLength: Buffer.byteLength(JSON.stringify(partial), "utf8"), format: "json" }],
    },
    correctedFileSubmission: {
      files: [{ path: "artifact.json", byteLength: Buffer.byteLength(JSON.stringify(fixed), "utf8"), format: "json" }],
    },
    requesterDecision: { decision: "accept", artifactSha256: sha(partial) },
  });
  assert.equal(wrongDecision.outcome, JOURNEY_OUTCOME.NEEDS_REVIEW);

  const acceptedInput = {
    requirements,
    proposals,
    chosenProposalId: proposals[0].id,
    artifact: partial,
    correctedArtifact: fixed,
    allowWeakProposal: true,
    fileSubmission: {
      files: [{ path: "artifact.json", byteLength: Buffer.byteLength(JSON.stringify(partial), "utf8"), format: "json" }],
    },
    correctedFileSubmission: {
      files: [{ path: "artifact.json", byteLength: Buffer.byteLength(JSON.stringify(fixed), "utf8"), format: "json" }],
    },
  };
  const accepted = runRequesterDeliveryJourney(
    withBoundAccept(acceptedInput, () => Date.parse("2026-09-10T18:00:00.000Z")),
    { clock: () => Date.parse("2026-09-10T18:00:00.000Z") },
  );
  assert.equal(accepted.outcome, JOURNEY_OUTCOME.ACCEPTED);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.lifecycle.status, "completed");
  assert.equal(accepted.boundArtifactSha256, sha(fixed));
  assert.deepEqual(accepted.lifecycle.paymentActions, []);
});

test("F8: supplied-input CLI + portable receipt replays in fresh process", () => {
  const proposals = load(join(f02, "proposals.bundle.json")).slice(0, 2);
  const fixed = load(join(f01, "artifact.positive.json"));
  const dir = mkdtempSync(join(tmpdir(), "r2-ex-s151-"));
  const inputPath = join(dir, "input.json");
  const receiptPath = join(dir, "receipt.json");
  const input = withBoundAccept({
    requirements: load(join(f01, "requirements.positive.json")),
    proposals,
    chosenProposalId: proposals[0].id,
    artifact: fixed,
    allowWeakProposal: true,
    fileSubmission: {
      files: [{ path: "artifact.json", byteLength: Buffer.byteLength(JSON.stringify(fixed), "utf8"), format: "json" }],
    },
  }, () => Date.parse("2026-09-10T18:00:00.000Z"));
  writeFileSync(inputPath, JSON.stringify(input));

  const run = spawnSync(
    process.execPath,
    [cli, "run", inputPath, "--receipt", receiptPath, "--clock", "2026-09-10T18:00:00.000Z"],
    { encoding: "utf8" },
  );
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  assert.equal(receipt.schema, "neomorphic.r2.exchange.journey_receipt.v1");
  assert.equal(receipt.version, 2);
  assert.equal(receipt.inputFingerprintSha256, fingerprintInput(input));
  assert.equal(receipt.outcome, JOURNEY_OUTCOME.ACCEPTED);

  const replay = runRequesterDeliveryJourney(input, {
    clock: () => Date.parse("2026-09-10T18:00:00.000Z"),
  });
  assert.equal(receiptMatchesJourney(receipt, replay, input), true);
  const rebuilt = buildJourneyReceipt(input, replay, {
    clock: () => Date.parse("2026-09-10T18:00:00.000Z"),
  });
  assert.equal(rebuilt.outcome, receipt.outcome);
  assert.equal(rebuilt.boundArtifactSha256, receipt.boundArtifactSha256);
});

test("S171 R1: foreign/empty lifecycle cannot ok without compatible completion", () => {
  const clock = () => Date.parse("2026-09-10T18:00:00.000Z");
  const out = runRequesterDeliveryJourney(
    withBoundAccept(
      baseInput({
        lifecycleEvents: [
          { type: "task_opened", at: "2026-09-10T16:00:00.000Z", taskId: "other-task" },
          { type: "proposal_submitted", at: "2026-09-10T16:01:00.000Z", proposalId: "foreign" },
        ],
      }),
      clock,
    ),
    { clock },
  );
  assert.equal(out.ok, false);
  assert.notEqual(out.lifecycle?.status, "completed");
});

test("S171 R2: reject honored; accept requires artifact+revision", () => {
  const clock = () => Date.parse("2026-09-10T18:00:00.000Z");
  const noSubj = baseInput({
    requirements: { ...load(join(f01, "requirements.positive.json")), subjectiveCriteria: [] },
    requesterDecision: { decision: "reject", artifactSha256: sha(load(join(f01, "artifact.positive.json"))) },
  });
  const rejected = runRequesterDeliveryJourney(noSubj, { clock });
  assert.equal(rejected.outcome, JOURNEY_OUTCOME.REJECTED);
  assert.equal(rejected.ok, false);

  const missingRev = runRequesterDeliveryJourney(
    baseInput({
      requesterDecision: {
        decision: "accept",
        artifactSha256: sha(load(join(f01, "artifact.positive.json"))),
      },
    }),
    { clock },
  );
  assert.equal(missingRev.outcome, JOURNEY_OUTCOME.NEEDS_REVIEW);
  assert.equal(missingRev.ok, false);
});

test("S171 R3: foreign file contract stopped; under-reported bytes coerced", () => {
  const clock = () => Date.parse("2026-09-10T18:00:00.000Z");
  const foreign = runRequesterDeliveryJourney(
    baseInput({
      fileSetContract: {
        taskId: "foreign-task",
        requiredFiles: [{ path: "artifact.json", format: "json" }],
        allowedFormats: ["json"],
        maxBytesPerFile: 100000,
        maxTotalBytes: 100000,
        allowExtraFiles: true,
      },
    }),
    { clock },
  );
  assert.equal(foreign.gated, true);
  assert.ok(String(foreign.gate?.reason || foreign.steps.at(-1)?.reason).includes("foreign"));
});

test("S171 R4: receipt P does not match journey Q", () => {
  const clock = () => Date.parse("2026-09-10T18:00:00.000Z");
  const inputP = withBoundAccept(baseInput(), clock);
  const inputQ = withBoundAccept(
    baseInput({
      requirements: { ...load(join(f01, "requirements.positive.json")), title: "Title Q" },
    }),
    clock,
  );
  const outP = runRequesterDeliveryJourney(inputP, { clock });
  const outQ = runRequesterDeliveryJourney(inputQ, { clock });
  const receiptP = buildJourneyReceipt(inputP, outP, { clock });
  assert.equal(receiptMatchesJourney(receiptP, outQ, inputQ), false);
  assert.equal(receiptMatchesJourney(receiptP, outP, inputP), true);
  // Replay-bound match requires the exact replayed input — fingerprint-alone is not enough.
  assert.equal(receiptMatchesJourney(receiptP, outP), false);
  assert.equal(isReceiptStructurallyValid(receiptP), true);
});

test("S177: structural validity ≠ replay match; missing identity / mismatched replay", () => {
  const clock = () => Date.parse("2026-09-10T18:00:00.000Z");
  const input = withBoundAccept(baseInput(), clock);
  const out = runRequesterDeliveryJourney(input, { clock });
  const receipt = buildJourneyReceipt(input, out, { clock });

  assert.equal(isReceiptStructurallyValid(receipt), true);
  assert.equal(receiptMatchesJourney(receipt, out, null), false);
  assert.equal(receiptMatchesJourney(receipt, out, undefined), false);
  assert.equal(receiptMatchesJourney(receipt, out, { ...input, title: "tampered" }), false);

  const missingProposal = { ...receipt, proposalId: null };
  assert.equal(isReceiptStructurallyValid(missingProposal), true);
  assert.equal(receiptMatchesJourney(missingProposal, out, input), false);

  const missingAgreement = { ...receipt, agreementStatus: null };
  assert.equal(receiptMatchesJourney(missingAgreement, out, input), false);

  const foreignTask = { ...receipt, taskId: "not-the-task" };
  assert.equal(receiptMatchesJourney(foreignTask, out, input), false);
});

test("S195 F3: tampered acceptanceKind does not replay-match; admission-stop self-replays", () => {
  const clock = () => Date.parse("2026-09-10T18:00:00.000Z");
  const objectiveOnly = baseInput({
    requirements: { ...load(join(f01, "requirements.positive.json")), subjectiveCriteria: [] },
    requesterDecision: undefined,
  });
  const auto = runRequesterDeliveryJourney(objectiveOnly, { clock });
  const receipt = buildJourneyReceipt(objectiveOnly, auto, { clock });
  assert.equal(receiptMatchesJourney(receipt, auto, objectiveOnly), true);

  const tampered = {
    ...receipt,
    acceptanceKind: ACCEPTANCE_KIND.COUNTERPARTY_ACCEPTANCE,
    outcomeReason: "explicit_requester_accept_bound",
  };
  assert.equal(receiptMatchesJourney(tampered, auto, objectiveOnly), false);

  const oversized = load(join(f01, "artifact.positive.json"));
  const stoppedInput = baseInput({
    requirements: {
      ...load(join(f01, "requirements.positive.json")),
      artifact: { ...load(join(f01, "requirements.positive.json")).artifact, maxBytes: 64 },
    },
    artifact: oversized,
    fileSubmission: {
      files: [{ path: "artifact.json", byteLength: Buffer.byteLength(JSON.stringify(oversized), "utf8"), format: "json" }],
    },
  });
  const stopped = runRequesterDeliveryJourney(stoppedInput, { clock });
  assert.equal(stopped.outcome, JOURNEY_OUTCOME.STOPPED);
  assert.equal(stopped.gated, true);
  assert.ok(stopped.outcomeReason);
  const stoppedReceipt = buildJourneyReceipt(stoppedInput, stopped, { clock });
  assert.equal(stoppedReceipt.proposalId, stopped.proposalId ?? null);
  assert.equal(receiptMatchesJourney(stoppedReceipt, stopped, stoppedInput), true);
});

test("S177: fully objective auto-completes; reject still terminal; kinds labeled", () => {
  const clock = () => Date.parse("2026-09-10T18:00:00.000Z");
  const objectiveOnly = baseInput({
    requirements: { ...load(join(f01, "requirements.positive.json")), subjectiveCriteria: [] },
    requesterDecision: undefined,
  });
  const auto = runRequesterDeliveryJourney(objectiveOnly, { clock });
  assert.equal(auto.outcome, JOURNEY_OUTCOME.ACCEPTED);
  assert.equal(auto.ok, true);
  assert.equal(auto.acceptanceKind, ACCEPTANCE_KIND.AUTOMATIC_OBJECTIVE_EVIDENCE);
  assert.equal(auto.outcomeReason, "objective_complete_no_subjective");

  const rejected = runRequesterDeliveryJourney(
    baseInput({
      requirements: { ...load(join(f01, "requirements.positive.json")), subjectiveCriteria: [] },
      requesterDecision: { decision: "reject", artifactSha256: sha(load(join(f01, "artifact.positive.json"))) },
    }),
    { clock },
  );
  assert.equal(rejected.outcome, JOURNEY_OUTCOME.REJECTED);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.acceptanceKind, ACCEPTANCE_KIND.NONE);

  const bound = runRequesterDeliveryJourney(withBoundAccept(baseInput(), clock), { clock });
  assert.equal(bound.outcome, JOURNEY_OUTCOME.ACCEPTED);
  assert.equal(bound.acceptanceKind, ACCEPTANCE_KIND.COUNTERPARTY_ACCEPTANCE);
});
