import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CORRECTION_STATUS,
  SCHEMA,
  buildCorrectionRequest,
  recheckAfterAmend,
  exchange01,
} from "../src/index.mjs";

const f01 = join(dirname(fileURLToPath(import.meta.url)), "../../01/fixtures");
const load = (name) => JSON.parse(readFileSync(join(f01, name), "utf8"));

test("positive path after amend: none_needed and no restart", () => {
  const brief = exchange01.buildAcceptanceBrief(load("requirements.positive.json"));
  const { request } = recheckAfterAmend(brief, load("artifact.positive.json"));
  assert.equal(request.schema, SCHEMA);
  assert.equal(request.status, CORRECTION_STATUS.NONE_NEEDED);
  assert.equal(request.restartTask, false);
  assert.equal(request.amendItems.length, 0);
  assert.ok(request.acceptedParts.length >= 5);
});

test("failed checks become minimal amend items; accepted parts retained", () => {
  const brief = exchange01.buildAcceptanceBrief(load("requirements.positive.json"));
  const req = buildCorrectionRequest({ brief, artifact: load("artifact.partial.json") });
  assert.equal(req.status, CORRECTION_STATUS.AMEND_REQUESTED);
  assert.equal(req.restartTask, false);
  assert.equal(req.retainAcceptedParts, true);
  assert.ok(req.amendItems.length >= 1);
  assert.ok(req.acceptedParts.length >= 1);
  assert.ok(req.amendItems.every((a) => a.retain === true));
  assert.ok(req.minimalRequest.doNot.some((d) => /restart/i.test(d)));
  // digest failure expected on partial fixture
  assert.ok(req.amendItems.some((a) => a.criterionId === "digest_hex" || a.targetPath === "evidenceDigest"));
});

test("negative artifact yields amends without dropping structure", () => {
  const brief = exchange01.buildAcceptanceBrief(load("requirements.positive.json"));
  const req = buildCorrectionRequest({ brief, artifact: load("artifact.negative.json") });
  assert.equal(req.status, CORRECTION_STATUS.AMEND_REQUESTED);
  assert.ok(req.objectiveSummary.failed >= 3);
  assert.equal(req.restartTask, false);
});

test("subjective remain unresolved on correction request", () => {
  const brief = exchange01.buildAcceptanceBrief(load("requirements.positive.json"));
  const req = buildCorrectionRequest({ brief, artifact: load("artifact.positive.json") });
  assert.ok(req.subjectiveUnresolved.length >= 1);
  assert.ok(req.subjectiveUnresolved.every((s) => s.status === "unresolved"));
});

test("F4: imported priorCheck cannot override failing artifact", async () => {
  const { buildCorrectionRequest, CORRECTION_STATUS } = await import("../src/index.mjs");
  const { buildAcceptanceBrief } = await import("../../01/src/index.mjs");
  const requirements = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../01/fixtures/requirements.positive.json"), "utf8"),
  );
  const brief = buildAcceptanceBrief(requirements);
  const failing = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../01/fixtures/artifact.partial.json"), "utf8"),
  );
  const fakePass = {
    objective: {
      results: brief.objectiveChecks.map((c) => ({ id: c.id, passed: true, detail: "fake" })),
      complete: true,
      passed: brief.objectiveChecks.length,
      failed: 0,
    },
    subjective: { results: [], unresolved: 1 },
  };
  const out = buildCorrectionRequest({ brief, artifact: failing, priorCheck: fakePass });
  assert.equal(out.checkProvenance, "runAcceptanceChecks");
  assert.equal(out.status, CORRECTION_STATUS.AMEND_REQUESTED);
  assert.ok(out.amendItems.length >= 1);
});

test("S171 R7: imported_unverified cannot yield none_needed", async () => {
  const { buildCorrectionRequest, CORRECTION_STATUS } = await import("../src/index.mjs");
  const { buildAcceptanceBrief } = await import("../../01/src/index.mjs");
  const requirements = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../01/fixtures/requirements.positive.json"), "utf8"),
  );
  const brief = buildAcceptanceBrief(requirements);
  const fakePass = {
    objective: {
      results: brief.objectiveChecks.map((c) => ({ id: c.id, passed: true, detail: "fake" })),
      complete: true,
      passed: brief.objectiveChecks.length,
      failed: 0,
    },
    subjective: { results: [], unresolved: 1 },
  };
  const out = buildCorrectionRequest({ brief, priorCheck: fakePass });
  assert.equal(out.checkProvenance, "imported_unverified");
  assert.equal(out.status, CORRECTION_STATUS.NEEDS_VERIFICATION);
  assert.equal(out.acceptedParts.length, 0);
});
