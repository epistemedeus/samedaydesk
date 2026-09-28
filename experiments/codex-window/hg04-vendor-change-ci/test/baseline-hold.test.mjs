import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { lastJson, ROOT, runNode, sha256File, tmpOut } from "./helpers.mjs";

test("--update-baseline is refused and writes nothing", () => {
  const proc = runNode(["run", "--fixture", "openai-gpt35-turbo-20230613-20240125", "--update-baseline"]);
  assert.equal(proc.status, 2);
  const body = lastJson(proc.stdout);
  assert.equal(body.code, "baseline-update-refused");
  assert.equal(body.updateBaseline, false);
});

test("mismatched baseline holds the file bytes and emits hold-baseline", () => {
  const expectedPath = join(ROOT, "fixtures/openai-gpt35-turbo-20230613-20240125/expected.json");
  const original = readFileSync(expectedPath);
  const originalHash = sha256File(expectedPath);
  const scratch = mkdtempSync(join(tmpdir(), "hg04-base-"));
  const fake = join(scratch, "expected.json");
  const mutated = JSON.parse(original.toString("utf8"));
  mutated.kitCounts = { ...mutated.kitCounts, fieldChanges: 99 };
  writeFileSync(fake, `${JSON.stringify(mutated, null, 2)}\n`);
  const fakeHash = sha256File(fake);
  const outDir = tmpOut("hg04-hold-");
  const proc = runNode([
    "run",
    "--fixture",
    "openai-gpt35-turbo-20230613-20240125",
    "--baseline",
    fake,
    "--out-dir",
    outDir,
  ]);
  const receipt = lastJson(proc.stdout);
  assert.equal(proc.status, 2, proc.stderr + proc.stdout);
  assert.equal(receipt.machineAction, "hold-baseline");
  assert.equal(receipt.updateBaseline, false);
  assert.equal(sha256File(fake), fakeHash);
  assert.equal(sha256File(expectedPath), originalHash);
  const action = JSON.parse(readFileSync(join(outDir, "machine-action.json"), "utf8"));
  assert.equal(action.kind, "hold-baseline");
  assert.equal(action.baselineUpdated, false);
  assert.equal(action.baselineMatched, false);
});
