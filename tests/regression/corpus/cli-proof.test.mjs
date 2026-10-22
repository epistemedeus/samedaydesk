import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { REPO_ROOT } from "./lib/root.mjs";

function run(args, { cwd = REPO_ROOT, timeout = 30_000 } = {}) {
  return spawnSync(process.execPath, args, { cwd, encoding: "utf8", timeout, env: process.env });
}

test("obtain-archive SHA mismatch is wrong-digest, dest not written, child may exit 0", () => {
  const tmp = mkdtempSync(join(tmpdir(), "sds-corpus-cli-"));
  const dest = join(tmp, "must-not-write.tgz");
  try {
    const result = run([
      join(REPO_ROOT, "experiments/s260-useful-jobs-public-integration/bin/obtain-archive.mjs"),
      "--from",
      join(REPO_ROOT, "tests/regression/corpus/fixtures/buyer/wrong-digest.bin"),
      "--expected-sha256",
      "0000000000000000000000000000000000000000000000000000000000000000",
      "--expected-bytes",
      "16",
      "--dest",
      dest,
    ]);
    const body = JSON.parse(result.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.code, "wrong-digest");
    assert.equal(body.extracted, false);
    assert.equal(result.status, 0, "product wrapper still exits 0 on refuse");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("offer-routing complete-issue-discussion exits 2 with selected null", () => {
  const result = run([
    join(REPO_ROOT, "tools/offer-routing/route-job.mjs"),
    join(REPO_ROOT, "tools/offer-routing/fixtures/complete-issue-discussion.job.json"),
  ]);
  assert.equal(result.status, 2, result.stderr || result.stdout);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.ok, false);
  assert.equal(summary.selected, null);
  assert.equal(summary.paid, false);
  assert.ok(summary.warnings.includes("complete_issue_acquisition_unavailable"));
});

test("result-reuse export without --out is a refuse", () => {
  const result = run([
    join(REPO_ROOT, "tools/result-reuse/cli.mjs"),
    "export",
    "--input",
    join(REPO_ROOT, "tools/result-reuse/fixtures/accepted-page-change.json"),
    "--task-id",
    "corpus-reuse",
    "--subject",
    "corpus-reuse-result",
    "--sequence",
    "1",
    "--clock",
    "2026-09-09T10:00:00.000Z",
    "--opt-in",
  ]);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const err = JSON.parse((result.stderr || result.stdout).trim().split("\n").at(-1));
  assert.equal(err.ok, false);
  assert.equal(err.message, "export requires --out");
});

test("evidence-records validate still accepts a shipped valid fixture", () => {
  const result = run([
    join(REPO_ROOT, "tools/evidence-records/validate.mjs"),
    join(REPO_ROOT, "tools/evidence-records/fixtures/valid/indexnow-receipt.json"),
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, true);
});
