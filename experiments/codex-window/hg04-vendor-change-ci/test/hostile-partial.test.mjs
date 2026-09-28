import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { lastJson, ROOT, runNode, sha256File, tmpOut } from "./helpers.mjs";

const FIXTURE = "hostile-partial-capture";
const expectedPath = join(ROOT, "fixtures", FIXTURE, "expected.json");

test("hostile partial capture stays partial and does not update baseline", () => {
  const beforeHash = sha256File(expectedPath);
  const outDir = tmpOut("hg04-hostile-");
  const proc = runNode(["run", "--fixture", FIXTURE, "--out-dir", outDir]);
  const receipt = lastJson(proc.stdout);
  assert.equal(proc.status, 2, proc.stderr + proc.stdout);
  assert.equal(receipt.wrapperStatus, "partial");
  assert.equal(receipt.kitStatus, "actionable");
  assert.equal(receipt.machineAction, "resolve-partial-capture");
  assert.equal(receipt.ci, "fail");
  assert.equal(receipt.updateBaseline, false);
  assert.equal(receipt.invoiceClaim, false);

  const result = JSON.parse(readFileSync(join(outDir, "vendor-change-ci.json"), "utf8"));
  assert.equal(result.truth.coverage.complete, false);
  assert.deepEqual(result.truth.membership.removed, ["gpt-3.5-turbo-output"]);
  assert.equal(result.kitCounts.removed, 1);
  assert.equal(result.kitCounts.fieldChanges, 1);
  assert.equal(result.baseline.matched, true);
  assert.equal(result.baseline.updated, false);
  assert.match(result.truth.coverage.note, /coverage holes, not retirements/);
  assert.equal(sha256File(expectedPath), beforeHash);

  const action = JSON.parse(readFileSync(join(outDir, "machine-action.json"), "utf8"));
  assert.equal(action.kind, "resolve-partial-capture");
  assert.equal(action.baselineUpdated, false);
  assert.equal(action.ci, "fail");
});
