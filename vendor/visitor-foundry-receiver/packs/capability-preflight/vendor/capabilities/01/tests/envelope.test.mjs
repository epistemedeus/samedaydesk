import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CHECK_KIND,
  ENVELOPE_SCHEMA,
  ENVELOPE_STATUS,
  ERROR_CODES,
  REQUIREMENTS_REF,
  REQUIREMENTS_SCHEMA,
  buildTaskRequirementsEnvelope,
  validateTaskRequirements,
} from "../src/index.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) => JSON.parse(readFileSync(join(root, "fixtures", name), "utf8"));

test("positive: plain Exchange requirements → ready envelope with constraints + evidence", () => {
  const envelope = buildTaskRequirementsEnvelope(load("requirements.positive.json"), {
    clock: () => Date.parse("2026-09-10T12:30:00.000Z"),
  });

  assert.equal(envelope.schema, ENVELOPE_SCHEMA);
  assert.equal(envelope.status, ENVELOPE_STATUS.READY);
  assert.equal(envelope.generatedAt, "2026-09-10T12:30:00.000Z");
  assert.equal(envelope.taskId, "demo-page-diff-note");
  assert.deepEqual(envelope.requirementsRef, REQUIREMENTS_REF);
  assert.equal(envelope.requirementsRef.reuseFrom, "R2-EXCHANGE-01");

  assert.ok(envelope.requiredInputs.some((i) => i.id === "task_requirements"));
  assert.equal(envelope.outputConstraints.format, "json");
  assert.equal(envelope.outputConstraints.maxBytes, 8192);
  assert.ok(envelope.outputConstraints.requiredFields.includes("sourceUrl"));
  assert.ok(envelope.outputConstraints.objectiveChecks.length >= 5);

  // requiredFields derive json_path_exists without inventing facts
  const existsPaths = envelope.outputConstraints.objectiveChecks
    .filter((c) => c.check.kind === CHECK_KIND.JSON_PATH_EXISTS)
    .map((c) => c.check.path);
  for (const field of load("requirements.positive.json").artifact.requiredFields) {
    assert.ok(existsPaths.includes(field), `missing derived exists for ${field}`);
  }

  assert.equal(envelope.acceptableEvidence.subjectiveUnresolved.length, 1);
  assert.equal(envelope.acceptableEvidence.subjectiveUnresolved[0].status, "unresolved");
  assert.ok(envelope.acceptableEvidence.objective.some((o) => o.checkKind === "https_url_shape"));
  assert.deepEqual(envelope.missingInputs, []);
  assert.equal(envelope.capabilityContract, null);
});

test("positive: capabilities schema alias + capabilityContract binding", () => {
  const envelope = buildTaskRequirementsEnvelope(load("input.with-capability.json"), {
    clock: () => Date.parse("2026-09-10T12:30:00.000Z"),
  });

  assert.equal(envelope.status, ENVELOPE_STATUS.READY);
  assert.equal(envelope.capabilityContract.id, "public-docs-observe.v1");
  assert.ok(envelope.requiredInputs.some((i) => i.id === "source_uri" && i.source === "capabilityContract"));
  assert.deepEqual(envelope.missingInputs, []);
  assert.ok(
    envelope.acceptableEvidence.objective.some((o) => o.id === "capability:url_shape"),
    "evidenceHints with checkKind bind into acceptableEvidence.objective",
  );
  // Alias normalized to Exchange schema in requirementsRef
  assert.equal(envelope.requirementsRef.schema, REQUIREMENTS_SCHEMA);
});

test("partial: missing criteria listed in missingInputs; no invented facts", () => {
  const envelope = buildTaskRequirementsEnvelope(load("input.partial.json"));
  assert.ok(
    envelope.status === ENVELOPE_STATUS.PARTIAL_INPUT || envelope.status === ENVELOPE_STATUS.REJECTED,
  );
  assert.ok(envelope.missingInputs.length >= 1);
  assert.ok(envelope.missingInputs.some((m) => m.id === "criteria" || m.id === "requirements"));
  assert.equal(envelope.outputConstraints, null);
  assert.equal(envelope.acceptableEvidence, null);
  assert.equal(envelope.title, "Partial criteria only (synthetic)");
});

test("partial: capability required input absent from providedInputs", () => {
  const envelope = buildTaskRequirementsEnvelope(load("input.capability-missing.json"));
  assert.equal(envelope.status, ENVELOPE_STATUS.PARTIAL_INPUT);
  assert.ok(envelope.outputConstraints);
  assert.ok(envelope.missingInputs.some((m) => m.id === "source_uri"));
  assert.ok(envelope.requiredInputs.some((i) => i.id === "source_uri" && i.required === true));
});

test("negative: forbidden revenue/buyer fields rejected (Exchange FORBIDDEN_BRIEF_FIELDS)", () => {
  assert.throws(
    () => buildTaskRequirementsEnvelope(load("requirements.negative.json")),
    (err) => err.code === ERROR_CODES.FORBIDDEN_CLAIM,
  );
  assert.throws(
    () => buildTaskRequirementsEnvelope(load("requirements.malformed.json")),
    (err) => err.code === ERROR_CODES.FORBIDDEN_CLAIM,
  );
});

test("negative: unsupported check kind rejected at validate", () => {
  assert.throws(
    () =>
      buildTaskRequirementsEnvelope({
        taskId: "x",
        title: "t",
        summary: "s",
        objectiveCriteria: [
          {
            id: "bad",
            description: "d",
            check: { kind: "llm_judge", path: "x" },
          },
        ],
      }),
    (err) => err.code === ERROR_CODES.UNSUPPORTED_CHECK,
  );
});

test("validateTaskRequirements mirrors Exchange shape (CHECK_KIND + schema)", () => {
  const normalized = validateTaskRequirements(load("requirements.positive.json"));
  assert.equal(normalized.schema, REQUIREMENTS_SCHEMA);
  assert.equal(normalized.objectiveCriteria.length, 5);
  assert.equal(normalized.subjectiveCriteria.length, 1);
  assert.ok(Object.values(CHECK_KIND).includes(normalized.objectiveCriteria[0].check.kind));
});

test("preflight: envelope is not an acceptance brief (no overall.accepted claim)", () => {
  const envelope = buildTaskRequirementsEnvelope(load("requirements.positive.json"));
  assert.equal(Object.prototype.hasOwnProperty.call(envelope, "overall"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(envelope, "objectiveChecks"), false);
  assert.ok(envelope.outputConstraints);
  assert.ok(envelope.acceptableEvidence);
  assert.match(envelope.mutationBoundary, /Root owns merge/i);
});
