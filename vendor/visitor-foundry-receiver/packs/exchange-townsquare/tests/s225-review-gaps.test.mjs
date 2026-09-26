import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import {
  ACCEPTANCE_KIND,
  JOURNEY_OUTCOME,
  runSuppliedExchangeJourney,
} from "../src/real-journey.mjs";
import { validateSubmission } from "../exchange/04/src/index.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const cli = join(root, "../src/cli.mjs");
const clock = () => Date.parse("2026-09-10T21:15:00.000Z");

function baseline(over = {}) {
  return {
    requirements: {
      taskId: "T",
      title: "One-field task",
      summary: "Return x equal to 1.",
      artifact: { format: "json", maxBytes: 128, requiredFields: ["x"] },
      objectiveCriteria: [
        { id: "x_eq", description: "x equals 1", check: { kind: "json_path_equals", path: "x", equals: 1 } },
      ],
      subjectiveCriteria: [],
    },
    proposals: [{ id: "P", proposerLabel: "caller", artifact: { x: 1 } }],
    chosenProposalId: "P",
    artifact: { x: 1 },
    ...over,
  };
}

test("F2: present non-array subjectiveCriteria stops instead of auto-accept", () => {
  const out = runSuppliedExchangeJourney(
    baseline({
      requirements: {
        ...baseline().requirements,
        subjectiveCriteria: { id: "s", description: "oops" },
      },
    }),
    { clock },
  );
  assert.equal(out.ok, false);
  assert.notEqual(out.outcome, JOURNEY_OUTCOME.ACCEPTED);
  assert.notEqual(out.acceptanceKind, ACCEPTANCE_KIND.AUTOMATIC_OBJECTIVE_EVIDENCE);
  assert.match(String(out.error || out.detail || out.outcomeReason), /array|invalid_input|subjectiveCriteria/);
});

test("F3: duplicate normalized paths rejected; whitespace path still binds encoded bytes", () => {
  assert.throws(
    () =>
      validateSubmission({
        files: [
          { path: " artifact.json ", byteLength: 0, format: "json" },
          { path: " artifact.json ", byteLength: 0, format: "json" },
        ],
      }),
    (err) => err.code === "invalid_input" && /duplicate normalized path/.test(err.message),
  );

  const dup = runSuppliedExchangeJourney(
    baseline({
      requirements: {
        ...baseline().requirements,
        artifact: { ...baseline().requirements.artifact, maxBytes: 1 },
      },
      fileSubmission: {
        files: [
          { path: " artifact.json ", byteLength: 0, format: "json" },
          { path: " artifact.json ", byteLength: 0, format: "json" },
        ],
      },
    }),
    { clock },
  );
  assert.equal(dup.ok, false);
  assert.notEqual(dup.localRunOk, true);
  assert.notEqual(dup.admission?.status, "admitted");

  const encoded = Buffer.byteLength(JSON.stringify({ x: 1 }), "utf8");
  assert.ok(encoded > 1);
  const withSecond = runSuppliedExchangeJourney(
    baseline({
      requirements: {
        ...baseline().requirements,
        artifact: { ...baseline().requirements.artifact, maxBytes: 1 },
      },
      fileSetContract: {
        taskId: "T",
        requiredFiles: [
          { path: "artifact.json", format: "json" },
          { path: "notes.md", format: "md" },
        ],
        allowedFormats: ["json", "md"],
        maxBytesPerFile: 1,
        maxTotalBytes: 1,
        allowExtraFiles: false,
      },
      fileSubmission: {
        files: [
          { path: " artifact.json ", byteLength: 0, format: "json" },
          { path: "notes.md", byteLength: 1, format: "md" },
        ],
      },
    }),
    { clock },
  );
  assert.equal(withSecond.ok, false);
  assert.equal(withSecond.gated, true);
  const issues = withSecond.admission?.issues || [];
  assert.ok(
    issues.some((issue) => issue.kind === "oversize_file" || issue.kind === "oversize_total"),
    JSON.stringify(issues),
  );
  assert.ok(issues.some((issue) => issue.byteLength === encoded || issue.totalBytes >= encoded));
});

test("F4: nested foreign fileSetContract stops, with or without same-task top-level contract", () => {
  const nested = {
    taskId: "OTHER",
    requiredFiles: ["artifact.json"],
    allowedFormats: ["json"],
  };
  const onlyNested = runSuppliedExchangeJourney(
    baseline({
      requirements: { ...baseline().requirements, bounds: { fileSetContract: nested } },
    }),
    { clock },
  );
  assert.equal(onlyNested.outcome, JOURNEY_OUTCOME.STOPPED);
  assert.equal(onlyNested.outcomeReason, "foreign_file_set_contract");

  const withTop = runSuppliedExchangeJourney(
    baseline({
      requirements: { ...baseline().requirements, bounds: { fileSetContract: nested } },
      fileSetContract: {
        taskId: "T",
        requiredFiles: [{ path: "artifact.json", format: "json" }],
        allowedFormats: ["json"],
        maxBytesPerFile: 128,
        maxTotalBytes: 128,
      },
    }),
    { clock },
  );
  assert.equal(withTop.outcome, JOURNEY_OUTCOME.STOPPED);
  assert.equal(withTop.outcomeReason, "foreign_file_set_contract");
});

test("F5: TownSquare question.taskId OTHER is not attributed to supplied task T", () => {
  const conversation = JSON.parse(
    readFileSync(join(root, "../townsquare/kit/fixtures/conversation.positive.json"), "utf8"),
  );
  delete conversation.task;
  conversation.taskId = "T";
  conversation.question = { ...conversation.question, taskId: "OTHER" };
  const out = runSuppliedExchangeJourney(
    baseline({
      source: {
        kind: "townsquare_synthetic_conversation",
        identity: { taskId: "T", operatorLabel: "caller" },
        conversation,
      },
    }),
    { clock },
  );
  assert.equal(out.ok, false);
  assert.notEqual(out.outcome, JOURNEY_OUTCOME.ACCEPTED);
  assert.equal(out.outcomeReason === "source_task_mismatch" || out.errorCode === "source_task_mismatch", true);
});

test("F6: correctedArtifact 0 is applied and bound", () => {
  const zeroHash = createHash("sha256").update(JSON.stringify(0)).digest("hex");
  const out = runSuppliedExchangeJourney(
    {
      requirements: {
        taskId: "T",
        title: "Root zero",
        summary: "Return JSON 0.",
        artifact: { format: "json", maxBytes: 128, requiredFields: ["$"] },
        objectiveCriteria: [
          {
            id: "root_zero",
            description: "root equals 0",
            check: { kind: "json_path_equals", path: "$", equals: 0 },
          },
        ],
        subjectiveCriteria: [],
      },
      proposals: [{ id: "P", proposerLabel: "caller", artifact: { note: "weak" } }],
      chosenProposalId: "P",
      artifact: 1,
      correctedArtifact: 0,
      allowWeakProposal: true,
    },
    { clock },
  );
  assert.equal(out.outcome, JOURNEY_OUTCOME.ACCEPTED);
  assert.equal(out.acceptanceKind, ACCEPTANCE_KIND.AUTOMATIC_OBJECTIVE_EVIDENCE);
  assert.equal(out.exchange.boundArtifactSha256, zeroHash);
  assert.equal(out.actualCompletion, false);
});

test("F7: CLI refuses aliased --input/--receipt/--input-out before write", () => {
  const dir = mkdtempSync(join(tmpdir(), "s225-f7-"));
  const inputPath = join(dir, "caller.json");
  const original = `${JSON.stringify(baseline())}\n`;
  writeFileSync(inputPath, original);

  const sameReceipt = spawnSync(
    process.execPath,
    [cli, "run", "--input", inputPath, "--receipt", inputPath, "--clock", "2026-09-10T21:15:00.000Z"],
    { encoding: "utf8" },
  );
  assert.equal(sameReceipt.status, 2);
  assert.match(sameReceipt.stderr, /must be distinct paths/);
  assert.equal(readFileSync(inputPath, "utf8"), original);

  const outPath = join(dir, "caller.json");
  const sameOut = spawnSync(
    process.execPath,
    [cli, "run", "--input", inputPath, "--input-out", outPath, "--clock", "2026-09-10T21:15:00.000Z"],
    { encoding: "utf8" },
  );
  assert.equal(sameOut.status, 2);
  assert.equal(readFileSync(inputPath, "utf8"), original);

  const receiptPath = join(dir, "out.json");
  const aliasedPair = spawnSync(
    process.execPath,
    [
      cli,
      "run",
      "--input",
      inputPath,
      "--receipt",
      receiptPath,
      "--input-out",
      receiptPath,
      "--clock",
      "2026-09-10T21:15:00.000Z",
    ],
    { encoding: "utf8" },
  );
  assert.equal(aliasedPair.status, 2);
  assert.equal(readFileSync(inputPath, "utf8"), original);

  rmSync(dir, { recursive: true, force: true });
});
