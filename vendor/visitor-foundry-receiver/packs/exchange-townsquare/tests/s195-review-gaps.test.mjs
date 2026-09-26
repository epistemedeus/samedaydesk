import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  ACCEPTANCE_KIND,
  JOURNEY_OUTCOME,
  receiptMatchesJourney,
} from "../src/composed-journey.mjs";
import {
  SUPPLIED_REASON,
  attachExplicitRequesterAccept,
  runSuppliedExchangeJourney,
  sha256Json,
  verifySuppliedReceipt,
} from "../src/real-journey.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const cli = join(root, "../src/cli.mjs");
const fixtureA = join(root, "../fixtures/supplied-task-a");
const fixtureB = join(root, "../fixtures/supplied-task-b");
const clockIso = "2026-09-10T21:15:00.000Z";
const clock = () => Date.parse(clockIso);
const load = (dir, name) => JSON.parse(readFileSync(join(dir, name), "utf8"));

function relaxingContract(taskId, max = 10000) {
  return {
    taskId,
    requiredFiles: [{ path: "artifact.json", format: "json" }],
    allowedFormats: ["json"],
    maxBytesPerFile: max,
    maxTotalBytes: max,
    allowExtraFiles: false,
  };
}

test("F1: failed digest_hex and correction path reach wrapper and CLI", () => {
  const inputA = load(fixtureA, "input.json");
  const bad = { ...inputA, artifact: { ...inputA.artifact, digest: "bad" } };
  const out = runSuppliedExchangeJourney(bad, { clock });
  assert.equal(out.outcome, JOURNEY_OUTCOME.NEEDS_AMENDMENT);
  assert.equal(out.outcomeReason, "objective_incomplete");
  assert.equal(out.actualCompletion, false);
  const failed = out.checks.objective.failed.find((item) => item.id === "digest_hex");
  assert.ok(failed, "consumer must see failed digest_hex");
  assert.equal(failed.targetPath, "digest");
  const item = out.correction.items.find((row) => row.criterionId === "digest_hex");
  assert.ok(item);
  assert.equal(item.targetPath, "digest");
  assert.match(item.instruction, /digest_hex/);
  assert.ok(out.exchange.correction.items.some((row) => row.criterionId === "digest_hex"));

  const dir = mkdtempSync(join(tmpdir(), "s195-f1a-"));
  const inputPath = join(dir, "in.json");
  writeFileSync(inputPath, `${JSON.stringify(bad)}\n`);
  const cliRun = spawnSync(
    process.execPath,
    [cli, "run", "--input", inputPath, "--clock", clockIso],
    { encoding: "utf8" },
  );
  assert.equal(cliRun.status, 1, cliRun.stderr || cliRun.stdout);
  const summary = JSON.parse(cliRun.stdout);
  assert.equal(summary.outcome, JOURNEY_OUTCOME.NEEDS_AMENDMENT);
  const cliFailed = (summary.checks?.objective?.failed || []).map((row) => row.id);
  assert.ok(cliFailed.includes("digest_hex"));
  assert.equal(summary.correction.items.find((row) => row.criterionId === "digest_hex").targetPath, "digest");
  rmSync(dir, { recursive: true, force: true });
});

test("F1: missing proposal surfaces engine no_proposal reason to CLI", () => {
  const inputB = load(fixtureB, "input.json");
  const absent = { ...inputB, chosenProposalId: "absent" };
  const out = runSuppliedExchangeJourney(absent, { clock });
  assert.equal(out.outcome, JOURNEY_OUTCOME.STOPPED);
  assert.equal(out.gated, true);
  assert.equal(out.outcomeReason, "no_proposal");
  assert.equal(out.selectedProposalId, "absent");
  assert.equal(out.exchange.proposalId, null);
  assert.equal(out.replay.matched, true);

  const dir = mkdtempSync(join(tmpdir(), "s195-f1b-"));
  const inputPath = join(dir, "in.json");
  writeFileSync(inputPath, `${JSON.stringify(absent)}\n`);
  const cliRun = spawnSync(
    process.execPath,
    [cli, "run", "--input", inputPath, "--clock", clockIso],
    { encoding: "utf8" },
  );
  assert.equal(cliRun.status, 2, cliRun.stderr || cliRun.stdout);
  const summary = JSON.parse(cliRun.stdout);
  assert.equal(summary.outcomeReason, "no_proposal");
  assert.equal(summary.selectedProposalId, "absent");
  rmSync(dir, { recursive: true, force: true });
});

test("F2: same-task fileSetContract cannot relax brief size; tightening changes revision", () => {
  const inputB = load(fixtureB, "input.json");
  const tight = {
    ...inputB,
    requirements: {
      ...inputB.requirements,
      artifact: { ...inputB.requirements.artifact, maxBytes: 64 },
    },
  };
  const ordinary = runSuppliedExchangeJourney(tight, { clock });
  assert.equal(ordinary.outcome, JOURNEY_OUTCOME.STOPPED);
  assert.equal(ordinary.gated, true);
  assert.ok(
    (ordinary.admission?.issues || []).some(
      (issue) => issue.kind === "oversize_file" || issue.kind === "oversize_total",
    ),
  );

  const override = runSuppliedExchangeJourney(
    { ...tight, fileSetContract: relaxingContract(inputB.requirements.taskId, 10000) },
    { clock },
  );
  assert.equal(override.outcome, JOURNEY_OUTCOME.STOPPED);
  assert.equal(override.gated, true);
  assert.notEqual(override.outcome, JOURNEY_OUTCOME.ACCEPTED);
  assert.ok(
    (override.admission?.issues || []).some(
      (issue) => issue.kind === "oversize_file" || issue.kind === "oversize_total",
    ),
  );

  const tinyFailing = { name: "a" };
  const correctedStillLarge = runSuppliedExchangeJourney(
    {
      ...tight,
      artifact: tinyFailing,
      correctedArtifact: inputB.artifact,
      fileSetContract: relaxingContract(inputB.requirements.taskId, 10000),
    },
    { clock },
  );
  assert.equal(correctedStillLarge.outcome, JOURNEY_OUTCOME.STOPPED);
  assert.equal(correctedStillLarge.gated, true);
  assert.ok(
    (correctedStillLarge.admission?.issues || []).some(
      (issue) => issue.kind === "oversize_file" || issue.kind === "oversize_total",
    ),
    "corrected artifact must still hit the brief size bound",
  );

  const baseline = runSuppliedExchangeJourney(inputB, { clock });
  const tightened = runSuppliedExchangeJourney(
    {
      ...inputB,
      fileSetContract: relaxingContract(inputB.requirements.taskId, 200),
    },
    { clock },
  );
  assert.equal(baseline.outcome, JOURNEY_OUTCOME.ACCEPTED);
  assert.equal(tightened.outcome, JOURNEY_OUTCOME.ACCEPTED);
  assert.notEqual(baseline.exchange.boundRevisionSha256, tightened.exchange.boundRevisionSha256);
});

test("F3: tampered acceptance labels fail replay; rejected admission self-replays", () => {
  const inputB = load(fixtureB, "input.json");
  const out = runSuppliedExchangeJourney(inputB, { clock });
  assert.equal(out.acceptanceKind, ACCEPTANCE_KIND.AUTOMATIC_OBJECTIVE_EVIDENCE);
  const tampered = {
    ...out.receipt,
    acceptanceKind: ACCEPTANCE_KIND.COUNTERPARTY_ACCEPTANCE,
    outcomeReason: "explicit_requester_accept_bound",
  };
  assert.equal(receiptMatchesJourney(tampered, out.exchange, out.exchangeInput), false);
  const verified = verifySuppliedReceipt(tampered, out.exchangeInput, { clock });
  assert.equal(verified.replayMatched, false);
  assert.equal(verified.structurallyValid, true);

  const absent = runSuppliedExchangeJourney({ ...inputB, chosenProposalId: "absent" }, { clock });
  assert.equal(absent.replay.matched, true);
  assert.equal(absent.receipt.proposalId, null);
  assert.equal(absent.receipt.selectedProposalId, "absent");
  assert.equal(absent.receipt.outcomeReason, "no_proposal");
  assert.equal(absent.receipt.gated, true);

  const sizeStop = runSuppliedExchangeJourney(
    {
      ...inputB,
      requirements: {
        ...inputB.requirements,
        artifact: { ...inputB.requirements.artifact, maxBytes: 64 },
      },
    },
    { clock },
  );
  assert.equal(sizeStop.outcome, JOURNEY_OUTCOME.STOPPED);
  assert.equal(sizeStop.replay.matched, true);
  assert.equal(
    receiptMatchesJourney(sizeStop.receipt, sizeStop.exchange, sizeStop.exchangeInput),
    true,
  );
});

test("F4: contradictory source identity is rejected and matching identity is preserved", () => {
  const inputB = load(fixtureB, "input.json");
  const baseline = runSuppliedExchangeJourney(inputB, { clock });
  assert.equal(baseline.declaredSourceIdentity.taskId, "supplied-b-capability-card-02");
  assert.equal(baseline.declaredSourceIdentity.operatorLabel, "operator-b-local");
  assert.equal(baseline.declaredSourceIdentity.authenticated, false);
  assert.equal(baseline.exchange.taskId, "supplied-b-capability-card-02");

  const contradiction = runSuppliedExchangeJourney(
    {
      ...inputB,
      source: {
        ...inputB.source,
        identity: { ...inputB.source.identity, taskId: "different-task" },
      },
    },
    { clock },
  );
  assert.equal(contradiction.outcome, JOURNEY_OUTCOME.STOPPED);
  assert.equal(contradiction.outcomeReason, SUPPLIED_REASON.SOURCE_TASK_MISMATCH);
  assert.equal(contradiction.provided, "different-task");
  assert.equal(contradiction.expected, "supplied-b-capability-card-02");

  const relabeled = runSuppliedExchangeJourney(
    {
      ...inputB,
      source: {
        ...inputB.source,
        identity: { ...inputB.source.identity, operatorLabel: "operator-b-other" },
      },
    },
    { clock },
  );
  assert.equal(relabeled.outcome, JOURNEY_OUTCOME.ACCEPTED);
  assert.equal(relabeled.declaredSourceIdentity.operatorLabel, "operator-b-other");
  assert.notEqual(relabeled.exchangeInputFingerprintSha256, baseline.exchangeInputFingerprintSha256);
  assert.equal(relabeled.exchangeInput.requirements.sourceLabel, inputB.requirements.sourceLabel);
  assert.equal(relabeled.replay.matched, true);
  assert.equal(relabeled.receipt.declaredSourceIdentity.operatorLabel, "operator-b-other");
});

test("F5: malformed supplied decisions stop; omit still auto-accepts; reject stays reject", () => {
  const inputB = load(fixtureB, "input.json");
  const misspelled = runSuppliedExchangeJourney(
    { ...inputB, requesterDecision: { decision: "rejet" } },
    { clock },
  );
  assert.equal(misspelled.outcome, JOURNEY_OUTCOME.STOPPED);
  assert.equal(misspelled.outcomeReason, SUPPLIED_REASON.MALFORMED_REQUESTER_DECISION);
  assert.notEqual(misspelled.acceptanceKind, ACCEPTANCE_KIND.AUTOMATIC_OBJECTIVE_EVIDENCE);

  const empty = runSuppliedExchangeJourney({ ...inputB, requesterDecision: {} }, { clock });
  assert.equal(empty.outcomeReason, SUPPLIED_REASON.MALFORMED_REQUESTER_DECISION);

  const wrongType = runSuppliedExchangeJourney({ ...inputB, requesterDecision: "accept" }, { clock });
  assert.equal(wrongType.outcomeReason, SUPPLIED_REASON.MALFORMED_REQUESTER_DECISION);

  const rejected = runSuppliedExchangeJourney(
    { ...inputB, requesterDecision: { decision: "reject", artifactSha256: sha256Json(inputB.artifact) } },
    { clock },
  );
  assert.equal(rejected.outcome, JOURNEY_OUTCOME.REJECTED);
  assert.equal(rejected.outcomeReason, "explicit_requester_reject");

  const omitted = runSuppliedExchangeJourney(inputB, { clock });
  assert.equal(omitted.outcome, JOURNEY_OUTCOME.ACCEPTED);
  assert.equal(omitted.acceptanceKind, ACCEPTANCE_KIND.AUTOMATIC_OBJECTIVE_EVIDENCE);
});

test("F6: subjective-only work is needs_review / bound accept, not endless amendment", () => {
  const inputB = load(fixtureB, "input.json");
  const subjectiveOnly = {
    ...inputB,
    allowWeakProposal: true,
    requirements: {
      ...inputB.requirements,
      objectiveCriteria: [],
      artifact: { ...inputB.requirements.artifact, requiredFields: [] },
      subjectiveCriteria: [{ id: "useful", description: "Requester judges usefulness" }],
    },
    fileSetContract: relaxingContract(inputB.requirements.taskId, 10000),
  };
  const first = runSuppliedExchangeJourney(subjectiveOnly, { clock });
  assert.equal(first.outcome, JOURNEY_OUTCOME.NEEDS_REVIEW);
  assert.equal(first.outcomeReason, "subjective_unresolved");
  assert.equal(first.checks.objective.layer, "not_applicable");
  assert.equal(first.checks.objective.complete, false);
  assert.deepEqual(first.checks.subjective.unresolvedIds, ["useful"]);
  assert.notEqual(first.acceptanceKind, ACCEPTANCE_KIND.AUTOMATIC_OBJECTIVE_EVIDENCE);

  const accepted = runSuppliedExchangeJourney(
    attachExplicitRequesterAccept(subjectiveOnly, first.exchange),
    { clock },
  );
  assert.equal(accepted.outcome, JOURNEY_OUTCOME.ACCEPTED);
  assert.equal(accepted.outcomeReason, "explicit_requester_accept_bound");
  assert.equal(accepted.acceptanceKind, ACCEPTANCE_KIND.COUNTERPARTY_ACCEPTANCE);
  assert.equal(accepted.localRunOk, true);
  assert.equal(accepted.actualCompletion, false);
  assert.equal(accepted.replay.matched, true);
});

test("caller-authored task: fail → correction → subjective review → bound decision → fresh replay", () => {
  const digest = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const taskId = "caller-s195-lab-note-01";
  const proposalId = "prop-s195-alpha";
  const goodArtifact = {
    title: "Caller lab note",
    digest,
  };
  const badArtifact = {
    title: "Caller lab note",
    digest: "not-hex",
  };
  const base = {
    schema: "neomorphic.r2.exchange_townsquare.supplied_input.v1",
    provenance: "supplied_local",
    source: {
      kind: "structured_task",
      identity: { operatorLabel: "operator-s195", taskId },
    },
    requirements: {
      schema: "neomorphic.r2.exchange.task_requirements.v1",
      taskId,
      title: "Caller-authored lab note",
      summary: "One objective digest plus one unresolved subjective review.",
      artifact: { format: "json", maxBytes: 2048, requiredFields: ["title", "digest"] },
      objectiveCriteria: [
        {
          id: "title_present",
          description: "artifact includes title",
          check: { kind: "json_path_exists", path: "title" },
        },
        {
          id: "digest_hex",
          description: "digest must be sha256 hex",
          check: { kind: "sha256_hex", path: "digest" },
        },
      ],
      subjectiveCriteria: [
        {
          id: "useful",
          description: "Requester judges usefulness",
          reviewHint: "Unresolved until explicit local accept or reject.",
        },
      ],
    },
    proposals: [
      {
        schema: "neomorphic.r2.exchange.proposal.v1",
        id: proposalId,
        proposerLabel: "agent-s195-local",
        summary: "Supplies the caller lab note.",
        claimedRequirements: [
          { criterionId: "title_present", claim: "title present", evidenceRef: "artifact.title" },
          { criterionId: "digest_hex", claim: "sha256 digest", evidenceRef: "artifact.digest" },
        ],
        artifact: goodArtifact,
      },
    ],
    chosenProposalId: proposalId,
    artifact: badArtifact,
  };

  const failed = runSuppliedExchangeJourney(base, { clock });
  assert.equal(failed.outcome, JOURNEY_OUTCOME.NEEDS_AMENDMENT);
  assert.equal(failed.exchange.taskId, taskId);
  assert.equal(failed.exchange.proposalId, proposalId);
  assert.ok(failed.checks.objective.failed.some((item) => item.id === "digest_hex" && item.targetPath === "digest"));
  assert.equal(failed.declaredSourceIdentity.taskId, taskId);

  const afterFix = runSuppliedExchangeJourney(
    { ...base, artifact: badArtifact, correctedArtifact: goodArtifact },
    { clock },
  );
  assert.equal(afterFix.outcome, JOURNEY_OUTCOME.NEEDS_REVIEW);
  assert.equal(afterFix.outcomeReason, "subjective_unresolved");
  assert.deepEqual(afterFix.checks.subjective.unresolvedIds, ["useful"]);
  assert.equal(afterFix.exchange.boundArtifactSha256, sha256Json(goodArtifact));
  assert.equal(afterFix.exchange.taskId, taskId);
  assert.equal(afterFix.exchange.proposalId, proposalId);

  const bound = attachExplicitRequesterAccept(
    { ...base, artifact: badArtifact, correctedArtifact: goodArtifact },
    afterFix.exchange,
  );
  const accepted = runSuppliedExchangeJourney(bound, { clock });
  assert.equal(accepted.outcome, JOURNEY_OUTCOME.ACCEPTED);
  assert.equal(accepted.acceptanceKind, ACCEPTANCE_KIND.COUNTERPARTY_ACCEPTANCE);
  assert.equal(accepted.outcomeReason, "explicit_requester_accept_bound");
  assert.equal(accepted.localRunOk, true);
  assert.equal(accepted.actualCompletion, false);
  assert.equal(accepted.exchange.taskId, taskId);
  assert.equal(accepted.exchange.proposalId, proposalId);
  assert.equal(accepted.exchange.boundArtifactSha256, sha256Json(goodArtifact));
  assert.equal(accepted.replay.matched, true);

  const dir = mkdtempSync(join(tmpdir(), "s195-caller-"));
  const inputPath = join(dir, "in.json");
  const receiptPath = join(dir, "receipt.json");
  const exchangePath = join(dir, "exchange.json");
  writeFileSync(inputPath, `${JSON.stringify(bound)}\n`);
  const run = spawnSync(
    process.execPath,
    [
      cli,
      "run",
      "--input",
      inputPath,
      "--clock",
      clockIso,
      "--receipt",
      receiptPath,
      "--input-out",
      exchangePath,
    ],
    { encoding: "utf8" },
  );
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const summary = JSON.parse(run.stdout);
  assert.equal(summary.exchange.taskId, taskId);
  assert.equal(summary.exchange.proposalId, proposalId);
  assert.equal(summary.acceptanceKind, ACCEPTANCE_KIND.COUNTERPARTY_ACCEPTANCE);
  assert.equal(summary.actualCompletion, false);

  const replay = spawnSync(
    process.execPath,
    [cli, "replay", "--receipt", receiptPath, "--input", exchangePath, "--clock", clockIso],
    { encoding: "utf8" },
  );
  assert.equal(replay.status, 0, replay.stderr || replay.stdout);
  const replayJson = JSON.parse(replay.stdout);
  assert.equal(replayJson.replayMatched, true);
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  assert.equal(receipt.taskId, taskId);
  assert.equal(receipt.proposalId, proposalId);
  assert.equal(receipt.acceptanceKind, ACCEPTANCE_KIND.COUNTERPARTY_ACCEPTANCE);
  assert.equal(receipt.boundArtifactSha256, sha256Json(goodArtifact));
  rmSync(dir, { recursive: true, force: true });
});
