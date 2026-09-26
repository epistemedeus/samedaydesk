import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  ACCEPTANCE_KIND,
  COMPLETION_LABEL,
  FORBIDDEN_COMPLETION_LABEL,
  JOURNEY_OUTCOME,
  PROVENANCE,
  isReceiptStructurallyValid,
  receiptMatchesJourney,
  runComposedLabJourney,
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
const FIXTURE_CRITERION_IDS = ["source_https", "observed_iso", "changed_bool", "summary_bound", "useful_to_operator"];

function idsOf(requirements) {
  return [
    ...(requirements.objectiveCriteria || []).map((c) => c.id),
    ...(requirements.subjectiveCriteria || []).map((c) => c.id),
  ];
}

test("real adapter/journey never load exchange fixtures or synthesize demo accept", () => {
  const supplied = readFileSync(join(root, "../adapter/supplied-input.mjs"), "utf8");
  const real = readFileSync(join(root, "../src/real-journey.mjs"), "utf8");
  const cliSrc = readFileSync(cli, "utf8");
  for (const src of [supplied, real]) {
    assert.equal(src.includes("exchange/01/fixtures"), false);
    assert.equal(src.includes("exchange/02/fixtures"), false);
    assert.equal(src.includes("loadPositiveArtifact"), false);
    assert.equal(src.includes("clearSubjective"), false);
    assert.equal(src.includes("withBoundAccept"), false);
    assert.equal(src.includes("requirements.positive.json"), false);
  }
  assert.match(cliSrc, /run\/import never load those fixtures/);
});

test("supplied-input schema names the contract and required fields", () => {
  const schema = JSON.parse(readFileSync(join(root, "../schema/supplied-input.v1.json"), "utf8"));
  assert.equal(schema.title, "neomorphic.r2.exchange_townsquare.supplied_input.v1");
  assert.deepEqual(schema.required, ["requirements", "proposals", "artifact"]);
  assert.equal(schema.properties.provenance.const, "supplied_local");
});

test("two distinct supplied tasks: inputs control output (import path)", () => {
  const inputA = load(fixtureA, "input.json");
  const inputB = load(fixtureB, "input.json");
  const outA = runSuppliedExchangeJourney(inputA, { clock });
  const outB = runSuppliedExchangeJourney(inputB, { clock });

  assert.equal(outA.provenance, PROVENANCE.SUPPLIED_LOCAL);
  assert.equal(outB.provenance, PROVENANCE.SUPPLIED_LOCAL);
  assert.equal(outA.actualCompletion, false);
  assert.equal(outB.actualCompletion, false);
  assert.notEqual(outA.completionLabel, FORBIDDEN_COMPLETION_LABEL);
  assert.notEqual(outB.completionLabel, FORBIDDEN_COMPLETION_LABEL);

  assert.equal(outA.outcome, JOURNEY_OUTCOME.NEEDS_REVIEW);
  assert.equal(outA.outcomeReason, "subjective_unresolved");
  assert.equal(outA.ok, false);
  assert.equal(outA.localRunOk, false);
  assert.equal(outA.exchange.taskId, "supplied-a-changelog-watch-01");
  assert.equal(outA.exchange.proposalId, "prop-a-alpha-complete");
  assert.equal(outA.townsquare.adapter, "townsquare_synthetic_conversation");
  assert.equal(outA.townsquare.demo, true);
  assert.ok(idsOf(outA.exchangeInput.requirements).includes("page_https"));
  assert.ok(idsOf(outA.exchangeInput.requirements).includes("readable_to_operator"));
  for (const id of FIXTURE_CRITERION_IDS) {
    assert.equal(idsOf(outA.exchangeInput.requirements).includes(id), false);
  }

  assert.equal(outB.outcome, JOURNEY_OUTCOME.ACCEPTED);
  assert.equal(outB.outcomeReason, "objective_complete_no_subjective");
  assert.equal(outB.acceptanceKind, ACCEPTANCE_KIND.AUTOMATIC_OBJECTIVE_EVIDENCE);
  assert.notEqual(outB.acceptanceKind, ACCEPTANCE_KIND.COUNTERPARTY_ACCEPTANCE);
  assert.equal(outB.ok, true);
  assert.equal(outB.localRunOk, true);
  assert.equal(outB.completionLabel, COMPLETION_LABEL.LOCAL_RUN_OK);
  assert.equal(outB.exchange.taskId, "supplied-b-capability-card-02");
  assert.equal(outB.exchange.proposalId, "prop-b-beta-complete");
  assert.equal(outB.townsquare.adapter, "structured_task");
  assert.ok(idsOf(outB.exchangeInput.requirements).includes("card_status"));
  assert.equal(outB.exchangeInput.requirements.subjectiveCriteria.length, 0);
  for (const id of FIXTURE_CRITERION_IDS) {
    assert.equal(idsOf(outB.exchangeInput.requirements).includes(id), false);
  }

  assert.notEqual(outA.exchange.taskId, outB.exchange.taskId);
  assert.notEqual(outA.exchangeInputFingerprintSha256, outB.exchangeInputFingerprintSha256);
  assert.equal(outA.receipt.createdAt, clockIso);
  assert.equal(outB.receipt.createdAt, clockIso);
});

test("changed-input repeat: same task, different artifact changes fingerprint and outcome", () => {
  const inputA = load(fixtureA, "input.json");
  const first = runSuppliedExchangeJourney(inputA, { clock });
  assert.equal(first.outcome, JOURNEY_OUTCOME.NEEDS_REVIEW);

  const changed = {
    ...inputA,
    artifact: { ...inputA.artifact, digest: "not-a-digest" },
  };
  const second = runSuppliedExchangeJourney(changed, { clock });
  assert.equal(second.outcome, JOURNEY_OUTCOME.NEEDS_AMENDMENT);
  assert.equal(second.outcomeReason, "objective_incomplete");
  assert.notEqual(first.exchangeInputFingerprintSha256, second.exchangeInputFingerprintSha256);
  assert.equal(second.exchange.taskId, "supplied-a-changelog-watch-01");
});

test("partial/missing requirements stay unresolved — never filled from fixtures", () => {
  const inputA = load(fixtureA, "input.json");
  const missing = runSuppliedExchangeJourney(
    { ...inputA, requirements: undefined },
    { clock },
  );
  assert.equal(missing.outcome, JOURNEY_OUTCOME.STOPPED);
  assert.equal(missing.outcomeReason, SUPPLIED_REASON.REQUIREMENTS_MISSING);
  assert.equal(missing.ok, false);

  const emptyCriteria = runSuppliedExchangeJourney(
    {
      ...inputA,
      source: { kind: "structured_task", identity: { operatorLabel: "operator-a-local" } },
      requirements: {
        taskId: "supplied-a-changelog-watch-01",
        title: "Empty criteria",
        summary: "Identity only",
        objectiveCriteria: [],
        subjectiveCriteria: [],
      },
    },
    { clock },
  );
  assert.equal(emptyCriteria.outcome, JOURNEY_OUTCOME.STOPPED);
  assert.equal(emptyCriteria.outcomeReason, SUPPLIED_REASON.CRITERIA_UNRESOLVED);
});

test("no acceptance on subjective task is needs_review", () => {
  const out = runSuppliedExchangeJourney(load(fixtureA, "input.json"), { clock });
  assert.equal(out.outcome, JOURNEY_OUTCOME.NEEDS_REVIEW);
  assert.equal(out.outcomeReason, "subjective_unresolved");
  assert.equal(out.acceptanceKind, ACCEPTANCE_KIND.NONE);
  assert.notEqual(out.exchange.lifecycle?.status, "completed");
});

test("explicit accept bound to exact artifact/revision is counterparty_acceptance + local_run_ok", () => {
  const inputA = load(fixtureA, "input.json");
  const probe = runSuppliedExchangeJourney(inputA, { clock });
  assert.equal(probe.outcome, JOURNEY_OUTCOME.NEEDS_REVIEW);
  const bound = attachExplicitRequesterAccept(inputA, probe.exchange);
  assert.equal(bound.requesterDecision.artifactSha256, sha256Json(inputA.artifact));
  assert.equal(bound.requesterDecision.revisionSha256, probe.exchange.boundRevisionSha256);

  const accepted = runSuppliedExchangeJourney(bound, { clock });
  assert.equal(accepted.outcome, JOURNEY_OUTCOME.ACCEPTED);
  assert.equal(accepted.outcomeReason, "explicit_requester_accept_bound");
  assert.equal(accepted.acceptanceKind, ACCEPTANCE_KIND.COUNTERPARTY_ACCEPTANCE);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.localRunOk, true);
  assert.equal(accepted.completionLabel, COMPLETION_LABEL.LOCAL_RUN_OK);
  assert.equal(accepted.actualCompletion, false);
  assert.equal(accepted.exchange.lifecycle.status, "completed");
  assert.equal(accepted.replay.matched, true);
});

test("stale accept revision stays needs_review", () => {
  const inputA = load(fixtureA, "input.json");
  const probe = runSuppliedExchangeJourney(inputA, { clock });
  const stale = {
    ...inputA,
    requesterDecision: {
      decision: "accept",
      artifactSha256: sha256Json(inputA.artifact),
      revisionSha256: "0".repeat(64),
    },
  };
  const out = runSuppliedExchangeJourney(stale, { clock });
  assert.equal(out.outcome, JOURNEY_OUTCOME.NEEDS_REVIEW);
  assert.equal(out.outcomeReason, "accept_requires_matching_revisionSha256");
  assert.equal(probe.outcome, JOURNEY_OUTCOME.NEEDS_REVIEW);
});

test("explicit reject remains rejected even if objective evidence would pass", () => {
  const inputB = load(fixtureB, "input.json");
  const passing = runSuppliedExchangeJourney(inputB, { clock });
  assert.equal(passing.outcome, JOURNEY_OUTCOME.ACCEPTED);
  assert.equal(passing.acceptanceKind, ACCEPTANCE_KIND.AUTOMATIC_OBJECTIVE_EVIDENCE);

  const rejected = runSuppliedExchangeJourney(
    {
      ...inputB,
      requesterDecision: { decision: "reject", artifactSha256: sha256Json(inputB.artifact) },
    },
    { clock },
  );
  assert.equal(rejected.outcome, JOURNEY_OUTCOME.REJECTED);
  assert.equal(rejected.outcomeReason, "explicit_requester_reject");
  assert.equal(rejected.ok, false);
  assert.equal(rejected.localRunOk, false);
  assert.equal(rejected.acceptanceKind, ACCEPTANCE_KIND.NONE);
  assert.notEqual(rejected.exchange.lifecycle?.status, "completed");
});

test("malformed/foreign replay fails; structural validity is separate", () => {
  const inputA = load(fixtureA, "input.json");
  const inputB = load(fixtureB, "input.json");
  const outA = runSuppliedExchangeJourney(inputA, { clock });
  const outB = runSuppliedExchangeJourney(inputB, { clock });

  assert.equal(isReceiptStructurallyValid(outA.receipt), true);
  assert.equal(receiptMatchesJourney(outA.receipt, outA.exchange, null), false);
  assert.equal(receiptMatchesJourney(outA.receipt, outB.exchange, outB.exchangeInput), false);
  assert.equal(receiptMatchesJourney(outA.receipt, outA.exchange, outA.exchangeInput), true);

  const foreign = { schema: "not-a-receipt", version: 1, inputFingerprintSha256: "abcd" };
  assert.equal(isReceiptStructurallyValid(foreign), false);
  const verifiedForeign = verifySuppliedReceipt(foreign, outA.exchangeInput, { clock });
  assert.equal(verifiedForeign.replayMatched, false);
  assert.equal(verifiedForeign.structurallyValid, false);

  const missing = verifySuppliedReceipt(outA.receipt, null, { clock });
  assert.equal(missing.structurallyValid, true);
  assert.equal(missing.replayMatched, false);
  assert.equal(missing.reason, "replay_input_required");
});

test("mismatched task/proposal stops", () => {
  const inputA = load(fixtureA, "input.json");
  const inputB = load(fixtureB, "input.json");
  const out = runSuppliedExchangeJourney(
    {
      ...inputA,
      source: { kind: "structured_task", identity: { operatorLabel: "operator-a-local" } },
      proposals: inputB.proposals,
      chosenProposalId: "prop-b-beta-complete",
    },
    { clock },
  );
  assert.equal(out.outcome, JOURNEY_OUTCOME.STOPPED);
  assert.equal(out.gated, true);
  assert.equal(out.ok, false);
});

test("byte limits stop oversize admission", () => {
  const inputA = load(fixtureA, "input.json");
  const fat = { ...inputA.artifact, padding: "x".repeat(4000) };
  const out = runSuppliedExchangeJourney(
    {
      ...inputA,
      artifact: fat,
      requirements: {
        ...inputA.requirements,
        artifact: { ...inputA.requirements.artifact, maxBytes: 256 },
      },
    },
    { clock },
  );
  assert.equal(out.outcome, JOURNEY_OUTCOME.STOPPED);
  assert.equal(out.gated, true);
  assert.equal(out.ok, false);
});

test("corrected artifact then bound accept", () => {
  const inputA = load(fixtureA, "input.json");
  const partial = load(fixtureA, "artifact.partial.json");
  const mid = runSuppliedExchangeJourney({ ...inputA, artifact: partial }, { clock });
  assert.equal(mid.outcome, JOURNEY_OUTCOME.NEEDS_AMENDMENT);
  assert.equal(mid.outcomeReason, "objective_incomplete");

  const correctedRaw = {
    ...inputA,
    artifact: partial,
    correctedArtifact: inputA.artifact,
  };
  const afterFix = runSuppliedExchangeJourney(correctedRaw, { clock });
  assert.equal(afterFix.outcome, JOURNEY_OUTCOME.NEEDS_REVIEW);
  assert.equal(afterFix.outcomeReason, "subjective_unresolved");

  const accepted = runSuppliedExchangeJourney(
    attachExplicitRequesterAccept(correctedRaw, afterFix.exchange),
    { clock },
  );
  assert.equal(accepted.outcome, JOURNEY_OUTCOME.ACCEPTED);
  assert.equal(accepted.acceptanceKind, ACCEPTANCE_KIND.COUNTERPARTY_ACCEPTANCE);
  assert.equal(accepted.localRunOk, true);
  assert.equal(accepted.actualCompletion, false);
  assert.equal(accepted.exchange.boundArtifactSha256, sha256Json(inputA.artifact));
});

test("foreign file contract and reserved/demo provenance are refused honestly", () => {
  const inputA = load(fixtureA, "input.json");
  const foreign = runSuppliedExchangeJourney(
    {
      ...inputA,
      fileSetContract: {
        taskId: "foreign-task",
        requiredFiles: [{ path: "artifact.json", format: "json" }],
        allowedFormats: ["json"],
        maxBytesPerFile: 100000,
        maxTotalBytes: 100000,
        allowExtraFiles: true,
      },
    },
    { clock },
  );
  assert.equal(foreign.outcome, JOURNEY_OUTCOME.STOPPED);
  assert.equal(foreign.gated, true);

  const reserved = runSuppliedExchangeJourney(
    { ...inputA, provenance: PROVENANCE.EXTERNAL_DISCOVERY },
    { clock },
  );
  assert.equal(reserved.outcomeReason, SUPPLIED_REASON.EXTERNAL_DISCOVERY_RESERVED);

  const demoOnRun = runSuppliedExchangeJourney(
    { ...inputA, provenance: PROVENANCE.FIXTURE_DEMO },
    { clock },
  );
  assert.equal(demoOnRun.outcomeReason, SUPPLIED_REASON.FIXTURE_DEMO_NOT_ALLOWED_ON_RUN);

  const notSynthetic = runSuppliedExchangeJourney(
    {
      ...inputA,
      source: {
        kind: "townsquare_synthetic_conversation",
        conversation: { demo: false, taskId: "supplied-a-changelog-watch-01" },
      },
    },
    { clock },
  );
  assert.equal(notSynthetic.outcomeReason, SUPPLIED_REASON.TOWNSQUARE_KIT_SYNTHETIC_ONLY);
});

test("demo remains fixture_demo even when local gates pass", () => {
  const demoClock = () => Date.parse("2026-09-10T18:00:00.000Z");
  for (const mode of ["happy", "objective_auto", "correction"]) {
    const out = runComposedLabJourney({ mode, clock: demoClock });
    assert.equal(out.ok, true, mode);
    assert.equal(out.localRunOk, true, mode);
    assert.equal(out.provenance, PROVENANCE.FIXTURE_DEMO, mode);
    assert.equal(out.completionLabel, COMPLETION_LABEL.FIXTURE_DEMO, mode);
    assert.equal(out.actualCompletion, false, mode);
    assert.notEqual(out.completionLabel, FORBIDDEN_COMPLETION_LABEL);
    assert.equal(out.receipt.createdAt, "2026-09-10T18:00:00.000Z");
  }
});

test("CLI run + import + demo isolation + replay", () => {
  const dir = mkdtempSync(join(tmpdir(), "s181-supplied-"));
  const receiptPath = join(dir, "receipt.json");
  const inputOut = join(dir, "exchange-input.json");
  const inputA = join(fixtureA, "input.json");
  const inputB = join(fixtureB, "input.json");

  const runA = spawnSync(
    process.execPath,
    [cli, "run", "--input", inputA, "--clock", clockIso, "--receipt", receiptPath, "--input-out", inputOut],
    { encoding: "utf8" },
  );
  assert.equal(runA.status, 1, runA.stderr || runA.stdout);
  const summaryA = JSON.parse(runA.stdout);
  assert.equal(summaryA.outcome, JOURNEY_OUTCOME.NEEDS_REVIEW);
  assert.equal(summaryA.completionLabel, COMPLETION_LABEL.SUPPLIED_LOCAL);
  assert.equal(summaryA.actualCompletion, false);

  const imported = spawnSync(
    process.execPath,
    [cli, "import", "--input", inputB, "--clock", clockIso],
    { encoding: "utf8" },
  );
  assert.equal(imported.status, 0, imported.stderr || imported.stdout);
  const summaryB = JSON.parse(imported.stdout);
  assert.equal(summaryB.outcome, JOURNEY_OUTCOME.ACCEPTED);
  assert.equal(summaryB.acceptanceKind, ACCEPTANCE_KIND.AUTOMATIC_OBJECTIVE_EVIDENCE);
  assert.equal(summaryB.completionLabel, COMPLETION_LABEL.LOCAL_RUN_OK);
  assert.equal(summaryB.actualCompletion, false);

  const replay = spawnSync(
    process.execPath,
    [cli, "replay", "--receipt", receiptPath, "--input", inputOut, "--clock", clockIso],
    { encoding: "utf8" },
  );
  assert.equal(replay.status, 0, replay.stderr || replay.stdout);
  assert.equal(JSON.parse(replay.stdout).replayMatched, true);

  const convoOnly = spawnSync(process.execPath, [cli, "run", "--conversation", inputA], {
    encoding: "utf8",
  });
  assert.equal(convoOnly.status, 2);

  const rejectCli = spawnSync(
    process.execPath,
    [cli, "run", "--input", join(fixtureB, "input-reject.json"), "--clock", clockIso],
    { encoding: "utf8" },
  );
  assert.equal(rejectCli.status, 1, rejectCli.stderr || rejectCli.stdout);
  const rejectSummary = JSON.parse(rejectCli.stdout);
  assert.equal(rejectSummary.outcome, JOURNEY_OUTCOME.REJECTED);
  assert.equal(rejectSummary.outcomeReason, "explicit_requester_reject");
  assert.equal(rejectSummary.actualCompletion, false);
  assert.equal(rejectSummary.provenance, PROVENANCE.SUPPLIED_LOCAL);

  const demo = spawnSync(
    process.execPath,
    [cli, "demo", "--mode", "objective_auto"],
    { encoding: "utf8" },
  );
  assert.equal(demo.status, 0, demo.stderr || demo.stdout);
  const demoSummary = JSON.parse(demo.stdout);
  assert.equal(demoSummary.provenance, PROVENANCE.FIXTURE_DEMO);
  assert.equal(demoSummary.completionLabel, COMPLETION_LABEL.FIXTURE_DEMO);
  assert.equal(demoSummary.actualCompletion, false);
  assert.equal(demoSummary.ok, true);

  const demoWithInput = spawnSync(process.execPath, [cli, "demo", "--input", inputA], {
    encoding: "utf8",
  });
  assert.equal(demoWithInput.status, 2);
  rmSync(dir, { recursive: true, force: true });
});

test("fresh unpack archive: two distinct supplied tasks via CLI", () => {
  const tarPath = join(root, "../../../public/downloads/exchange-townsquare/exchange-townsquare.tar.gz");
  const work = mkdtempSync(join(tmpdir(), "s195-unpack-"));
  let extractRoot = join(root, "..");
  if (existsSync(tarPath)) {
    const tar = spawnSync("tar", ["-xzf", tarPath, "-C", work], { encoding: "utf8" });
    assert.equal(tar.status, 0, tar.stderr);
    extractRoot = join(work, "exchange-townsquare");
  }

  const unpackedCli = join(extractRoot, "src/cli.mjs");
  const a = spawnSync(
    process.execPath,
    [unpackedCli, "run", "--input", join(extractRoot, "fixtures/supplied-task-a/input.json"), "--clock", clockIso],
    { encoding: "utf8" },
  );
  const b = spawnSync(
    process.execPath,
    [unpackedCli, "import", "--input", join(extractRoot, "fixtures/supplied-task-b/input.json"), "--clock", clockIso],
    { encoding: "utf8" },
  );
  assert.equal(a.status, 1, a.stderr || a.stdout);
  const summaryA = JSON.parse(a.stdout);
  assert.equal(summaryA.outcome, JOURNEY_OUTCOME.NEEDS_REVIEW);
  assert.equal(summaryA.exchange.taskId, "supplied-a-changelog-watch-01");
  assert.equal(summaryA.exchange.proposalId, "prop-a-alpha-complete");
  assert.equal(summaryA.actualCompletion, false);

  assert.equal(b.status, 0, b.stderr || b.stdout);
  const summaryB = JSON.parse(b.stdout);
  assert.equal(summaryB.outcome, JOURNEY_OUTCOME.ACCEPTED);
  assert.equal(summaryB.exchange.taskId, "supplied-b-capability-card-02");
  assert.equal(summaryB.acceptanceKind, ACCEPTANCE_KIND.AUTOMATIC_OBJECTIVE_EVIDENCE);
  assert.equal(summaryB.completionLabel, COMPLETION_LABEL.LOCAL_RUN_OK);
  assert.notEqual(summaryA.exchange.taskId, summaryB.exchange.taskId);
  rmSync(work, { recursive: true, force: true });
});

test("changed artifact surfaces failed digest_hex path to the consumer", () => {
  const inputA = load(fixtureA, "input.json");
  const second = runSuppliedExchangeJourney(
    { ...inputA, artifact: { ...inputA.artifact, digest: "not-a-digest" } },
    { clock },
  );
  assert.equal(second.outcome, JOURNEY_OUTCOME.NEEDS_AMENDMENT);
  const failedIds = (second.checks?.objective?.failed || []).map((item) => item.id);
  assert.ok(failedIds.includes("digest_hex"));
  const digestItem = second.correction?.items?.find((item) => item.criterionId === "digest_hex");
  assert.ok(digestItem);
  assert.equal(digestItem.targetPath, "digest");
});
