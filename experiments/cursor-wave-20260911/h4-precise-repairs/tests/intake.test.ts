import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import {
  acceptRepairIntake,
  completeRepair,
  intakeFromFixture,
} from "../src/intake.ts";
import { SUBJECT_JOB_IDS } from "../src/constants.ts";

const packRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const mismatch = join(packRoot, "fixtures/mismatch-missing-resource.json");

function digestOf(path: string): { digestSha256: string; bytes: number } {
  const raw = readFileSync(path);
  return {
    digestSha256: createHash("sha256").update(raw).digest("hex"),
    bytes: raw.length,
  };
}

test("fixture intake records defect, scope, test, rollback, provenance=fixture", () => {
  const result = intakeFromFixture(mismatch, { subjectJobId: "api-upgrade-brief" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const file = digestOf(mismatch);
  assert.equal(result.intake.provenance, "fixture");
  assert.equal(result.intake.saleState, "not_a_sale");
  assert.equal(result.paidWrapper, false);
  assert.equal(result.subjectJobId, "api-upgrade-brief");
  assert.equal(result.intake.defectId, "g06-missing-resource-hint");
  assert.equal(result.intake.suppliedInput.digestSha256, file.digestSha256);
  assert.equal(result.intake.suppliedInput.mediaType, "application/json");
  assert.equal(result.intake.suppliedInput.bytes, file.bytes);
  assert.match(result.intake.scope, /api-upgrade-brief/);
  assert.match(result.intake.acceptanceTest, /payload\.signed === true/);
  assert.match(result.intake.rollback, /Do not retry payment/);
  assert.equal(result.completed, false);
});

test("each catalog job id is a valid repair subject", () => {
  for (const id of SUBJECT_JOB_IDS) {
    const result = intakeFromFixture(mismatch, { subjectJobId: id });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.subjectJobId, id);
  }
});

test("test provenance is allowed when the draft is not fixture/SAMPLE/--example", () => {
  const result = acceptRepairIntake({
    defectId: "g01-proposal",
    suppliedInput: {
      digestSha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      mediaType: "application/json",
      bytes: 4,
    },
    scope: "unit test",
    acceptanceTest: "saleState stays not_a_sale",
    rollback: "discard",
    provenance: "test",
    saleState: "not_a_sale",
    subjectJobId: "evidence-ci-annotation",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.intake.provenance, "test");
  assert.equal(result.intake.saleState, "not_a_sale");
});

test("completeRepair succeeds only with full suppliedInput and not_a_sale", () => {
  const accepted = intakeFromFixture(mismatch);
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  const completed = completeRepair(accepted.intake);
  assert.deepEqual(completed, {
    ok: true,
    completed: true,
    intake: accepted.intake,
    saleState: "not_a_sale",
  });
});
