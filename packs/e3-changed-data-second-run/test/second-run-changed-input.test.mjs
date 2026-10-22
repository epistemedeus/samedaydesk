import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { classifyPair } from "../src/classify.mjs";
import { loadPairDocument, resolvePairRuns } from "../src/pair.mjs";
import { PAIR_FILES } from "../src/paths.mjs";
import { runChangedDataPair } from "../src/run.mjs";
import { parseStdout, REPO_ROOT, runCli } from "./helpers.mjs";

test("owner-QA sequenced pair is changed input, not the same fixture", () => {
  const loaded = loadPairDocument(PAIR_FILES.ownerQa);
  const resolved = resolvePairRuns(loaded);
  assert.equal(resolved.ok, true, JSON.stringify(resolved.failure || resolved));
  assert.notEqual(resolved.runs[0].fingerprint, resolved.runs[1].fingerprint);
  assert.equal(resolved.runs[0].afterSha256, resolved.runs[1].beforeSha256);
  const classified = classifyPair(resolved);
  assert.equal(classified.ok, true);
  assert.equal(classified.changedInput, true);
  assert.equal(classified.secondRun, true);
  assert.equal(classified.repeatDemand, false);
  assert.equal(classified.labels.run1, "owner_qa");
  assert.equal(classified.labels.run2, "owner_qa");
});

test("actual second owner-QA run writes a new after hash", () => {
  const outDir = mkdtempSync(join(tmpdir(), "e3-owner-qa-"));
  const result = runChangedDataPair({
    pairPath: PAIR_FILES.ownerQa,
    outDir,
    repoRoot: REPO_ROOT,
  });
  assert.equal(result.ok, true, JSON.stringify(result.failure || result, null, 2));
  assert.equal(result.changedInput, true);
  assert.equal(result.secondRun, true);
  assert.ok(result.runs[0].caller.changePaths.includes("/title"));
  assert.ok(result.runs[1].caller.changePaths.includes("/title"));
  assert.notEqual(result.runs[0].jobPath, result.runs[1].jobPath);
});

test("CLI --owner-qa exits 0", () => {
  const proc = runCli(["--owner-qa", "--compact"]);
  const { json } = parseStdout(proc);
  assert.equal(proc.status, 0, proc.stderr || proc.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.labels.run1, "owner_qa");
  assert.equal(json.labels.run2, "owner_qa");
  assert.equal(json.repeatDemand, false);
  assert.equal(json.changedInput, true);
});
