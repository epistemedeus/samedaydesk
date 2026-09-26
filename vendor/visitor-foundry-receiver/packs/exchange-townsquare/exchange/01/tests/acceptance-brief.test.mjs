import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  BRIEF_STATUS,
  ERROR_CODES,
  SCHEMA,
  SUBJECTIVE_STATUS,
  buildAcceptanceBrief,
  runAcceptanceChecks,
  validateTaskRequirements,
} from "../src/index.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) => JSON.parse(readFileSync(join(root, "fixtures", name), "utf8"));

test("positive: builds ready brief with runnable objective checks and unresolved subjective", () => {
  const requirements = load("requirements.positive.json");
  const brief = buildAcceptanceBrief(requirements, { clock: () => Date.parse("2026-09-10T12:30:00.000Z") });

  assert.equal(brief.schema, SCHEMA);
  assert.equal(brief.status, BRIEF_STATUS.READY);
  assert.equal(brief.generatedAt, "2026-09-10T12:30:00.000Z");
  assert.ok(brief.objectiveChecks.length >= 5);
  assert.equal(brief.subjectiveCriteria.length, 1);
  assert.deepEqual(brief.unresolvedSubjective, ["useful_to_operator"]);
  assert.equal(brief.subjectiveCriteria[0].status, SUBJECTIVE_STATUS.UNRESOLVED);
  assert.match(brief.deliverableContract.statement, /objective check/i);
  assert.match(brief.consumerInstructions, /subjectiveCriteria/i);

  // requiredFields auto-derive json_path_exists without duplicating existing paths
  const existsPaths = brief.objectiveChecks
    .filter((c) => c.check.kind === "json_path_exists")
    .map((c) => c.check.path);
  for (const field of requirements.artifact.requiredFields) {
    assert.ok(existsPaths.includes(field), `missing derived exists for ${field}`);
  }

  const result = runAcceptanceChecks(brief, load("artifact.positive.json"));
  assert.equal(result.objective.complete, true);
  assert.equal(result.objective.failed, 0);
  assert.equal(result.subjective.unresolved, 1);
  assert.equal(result.overall.accepted, false, "must not claim full acceptance while subjective unresolved");
});

test("negative: insecure/missing fields fail objective checks", () => {
  const brief = buildAcceptanceBrief(load("requirements.positive.json"));
  const result = runAcceptanceChecks(brief, load("artifact.negative.json"));
  assert.equal(result.objective.complete, false);
  assert.ok(result.objective.failed >= 3);
  assert.equal(result.subjective.unresolved, 1);
  assert.equal(result.overall.accepted, false);
});

test("partial: some objective pass, digest fails; subjective still unresolved", () => {
  const brief = buildAcceptanceBrief(load("requirements.positive.json"));
  const result = runAcceptanceChecks(brief, load("artifact.partial.json"));
  assert.equal(result.objective.complete, false);
  assert.ok(result.objective.passed >= 3);
  assert.ok(result.objective.failed >= 1);
  const digest = result.objective.results.find((r) => r.id === "digest_hex");
  assert.equal(digest.passed, false);
  assert.equal(result.subjective.results[0].status, SUBJECTIVE_STATUS.UNRESOLVED);
});

test("rejects forbidden revenue/buyer fields and missing criteria", () => {
  assert.throws(
    () => validateTaskRequirements(load("requirements.malformed.json")),
    (err) => err.code === ERROR_CODES.FORBIDDEN_CLAIM || err.code === ERROR_CODES.MISSING_REQUIREMENT,
  );

  assert.throws(
    () =>
      buildAcceptanceBrief({
        taskId: "x",
        title: "t",
        summary: "s",
        revenue: 1,
        objectiveCriteria: [
          {
            id: "a",
            description: "d",
            check: { kind: "json_path_exists", path: "a" },
          },
        ],
      }),
    (err) => err.code === ERROR_CODES.FORBIDDEN_CLAIM,
  );
});

test("present non-array criteria fields are rejected before normalization", () => {
  const validObjective = [
    { id: "x_eq", description: "x equals 1", check: { kind: "json_path_equals", path: "x", equals: 1 } },
  ];
  const validSubjective = [{ id: "useful", description: "Requester judges usefulness" }];
  assert.throws(
    () =>
      validateTaskRequirements({
        taskId: "T",
        title: "t",
        summary: "s",
        objectiveCriteria: validObjective,
        subjectiveCriteria: { id: "s", description: "oops" },
      }),
    (err) => err.code === ERROR_CODES.INVALID_INPUT && /subjectiveCriteria must be an array/.test(err.message),
  );
  assert.throws(
    () =>
      validateTaskRequirements({
        taskId: "T",
        title: "t",
        summary: "s",
        objectiveCriteria: "not-array",
        subjectiveCriteria: validSubjective,
      }),
    (err) => err.code === ERROR_CODES.INVALID_INPUT && /objectiveCriteria must be an array/.test(err.message),
  );
  assert.throws(
    () =>
      validateTaskRequirements({
        taskId: "T",
        title: "t",
        summary: "s",
        objectiveCriteria: validObjective,
        criteria: { id: "mixed" },
      }),
    (err) => err.code === ERROR_CODES.INVALID_INPUT && /criteria must be an array/.test(err.message),
  );
});

test("unsupported check kind is rejected at brief build", () => {
  assert.throws(
    () =>
      buildAcceptanceBrief({
        taskId: "x",
        title: "t",
        summary: "s",
        objectiveCriteria: [
          {
            id: "a",
            description: "d",
            check: { kind: "fetch_live_url", path: "u" },
          },
        ],
      }),
    (err) => err.code === ERROR_CODES.UNSUPPORTED_CHECK,
  );
});

test("mixed criteria[] classification and equals/enum checks", () => {
  const brief = buildAcceptanceBrief({
    taskId: "mixed-1",
    title: "Mixed",
    summary: "Mixed objective and subjective via criteria[]",
    demo: true,
    criteria: [
      {
        id: "status_open",
        description: "status must be open",
        class: "objective",
        check: { kind: "enum_in", path: "status", values: ["open", "in_progress"] },
      },
      {
        id: "count_eq",
        description: "count equals 2",
        machineCheckable: true,
        check: { kind: "json_path_equals", path: "count", equals: 2 },
      },
      {
        id: "tone",
        description: "Tone is professional",
        class: "subjective",
        reviewHint: "Human only",
      },
    ],
  });
  assert.equal(brief.objectiveChecks.length, 2);
  assert.equal(brief.subjectiveCriteria.length, 1);

  const ok = runAcceptanceChecks(brief, { status: "open", count: 2 });
  assert.equal(ok.objective.complete, true);
  const bad = runAcceptanceChecks(brief, { status: "closed", count: 1 });
  assert.equal(bad.objective.complete, false);
});

test("subjective-only brief is partial_input; checks mark objective layer not_applicable", () => {
  const brief = buildAcceptanceBrief({
    taskId: "subj-only-1",
    title: "Subjective only",
    summary: "Requester judges usefulness; no machine checks.",
    artifact: { format: "json" },
    objectiveCriteria: [],
    subjectiveCriteria: [{ id: "useful", description: "Requester judges usefulness" }],
  });
  assert.equal(brief.status, BRIEF_STATUS.PARTIAL_INPUT);
  assert.equal(brief.objectiveChecks.length, 0);
  assert.deepEqual(brief.unresolvedSubjective, ["useful"]);

  const result = runAcceptanceChecks(brief, { note: "anything" });
  assert.equal(result.objective.layer, "not_applicable");
  assert.equal(result.objective.complete, false);
  assert.equal(result.objective.failed, 0);
  assert.equal(result.objective.total, 0);
  assert.equal(result.subjective.unresolved, 1);
  assert.equal(result.overall.accepted, false);
});

test("does not rebuild work-board contract — brief is structured checks not freeform string only", () => {
  const brief = buildAcceptanceBrief(load("requirements.positive.json"));
  assert.equal(typeof brief.deliverableContract.statement, "string");
  assert.ok(Array.isArray(brief.objectiveChecks));
  assert.ok(brief.objectiveChecks.every((c) => c.machineCheckable === true && c.check?.kind));
  assert.ok(brief.subjectiveCriteria.every((c) => c.status === SUBJECTIVE_STATUS.UNRESOLVED));
});
