import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { extractCommittedKit } from "../src/kit.mjs";
import { JOB_ID, PROMISED_OUTPUTS } from "../src/paths.mjs";
import { runChangedDataPair } from "../src/run.mjs";
import { parseStdout, REPO_ROOT, runCli } from "./helpers.mjs";

test("committed archive extracts the public useful-jobs CLI", () => {
  const kit = extractCommittedKit(REPO_ROOT);
  assert.equal(kit.ok, true, JSON.stringify(kit.failure || kit));
  assert.equal(kit.meta.name, "useful-jobs-1.4.7");
  assert.equal(kit.meta.bytes, 5255824);
  assert.equal(kit.meta.sha256, "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec");
  assert.equal(existsSync(kit.cli), true);
  assert.match(kit.kit, /useful-jobs-1\.4\.7$/);
});

test("actual caller spawns page-change-offline-job twice with changed input", () => {
  const outDir = mkdtempSync(join(tmpdir(), "e3-actual-"));
  const result = runChangedDataPair({
    pairPath: join(REPO_ROOT, "packs/e3-changed-data-second-run/fixtures/pairs/owner-qa-vs-independent.json"),
    outDir,
    repoRoot: REPO_ROOT,
  });
  assert.equal(result.ok, true, JSON.stringify(result.failure || result, null, 2));
  assert.equal(result.jobId, JOB_ID);
  assert.equal(result.spawned, true);
  assert.equal(result.changedInput, true);
  assert.equal(result.secondRun, true);
  assert.equal(result.repeatDemand, false);
  assert.equal(result.organicDemand, false);
  assert.equal(result.paid, false);
  assert.equal(result.kit.name, "useful-jobs-1.4.7");
  assert.equal(result.runs.length, 2);
  for (const run of result.runs) {
    assert.equal(run.status, 0);
    assert.equal(run.caller.ok, true);
    assert.equal(run.caller.verdict, "changed");
    assert.equal(run.caller.engine, "samedaydesk.page-change-offline-job");
    assert.equal(run.caller.networkUsed, false);
    assert.equal(run.caller.paymentAttempted, false);
    assert.deepEqual(run.present.sort(), [...PROMISED_OUTPUTS].sort());
    assert.equal(existsSync(run.written.jsonPath), true);
    assert.equal(existsSync(run.written.mdPath), true);
    assert.ok(run.argv.includes("page-change-offline-job"));
    assert.ok(run.argv.includes("--job"));
    assert.ok(run.argv.includes("--out-dir"));
    const report = JSON.parse(readFileSync(run.written.jsonPath, "utf8"));
    assert.equal(report.report.verdict, "changed");
    assert.equal(report.report.provenance.engine, "samedaydesk.page-change-offline-job");
  }
  assert.notEqual(result.runs[0].fingerprint, result.runs[1].fingerprint);
  assert.notEqual(result.runs[0].caller.afterSha256, result.runs[1].caller.afterSha256);
});

test("CLI --owner-qa-vs-independent exits 0 against the real CLI", () => {
  const proc = runCli(["--owner-qa-vs-independent", "--compact"]);
  const { json } = parseStdout(proc);
  assert.equal(proc.status, 0, proc.stderr || proc.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.jobId, "page-change-offline-job");
  assert.equal(json.changedInput, true);
  assert.equal(json.secondRun, true);
  assert.equal(json.labels.run1, "owner_qa");
  assert.equal(json.labels.run2, "independent");
  assert.equal(json.runs[0].caller.verdict, "changed");
  assert.equal(json.runs[1].caller.verdict, "changed");
});
