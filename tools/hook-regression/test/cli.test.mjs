import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { UNSIGNED_HINT_NOT_AUTHORITY } from "../lib/failures.mjs";

const packRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(packRoot, "bin/hook-regression.mjs");

function run(args, cwd = packRoot) {
  return spawnSync(process.execPath, [bin, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env },
  });
}

test("CLI journey from pack directory matches the literal user journey", () => {
  const result = run(["journey", "--fixture", "fixtures/ok-payload.json"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.steps[1].diagnostic.drift, "missing_hint");
  assert.equal(report.steps[1].diagnostic.signed, false);
  assert.equal(report.steps[2].unchanged, true);
  assert.deepEqual(report.steps[3].failure, UNSIGNED_HINT_NOT_AUTHORITY);
});

test("CLI reject exits 2 for unsigned-hint-as-authority fixture", () => {
  const result = run(["reject", "--fixture", "fixtures/unsigned-hint-as-authority.json"]);
  assert.equal(result.status, 2, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.rejected, true);
  assert.equal(report.failure.code, "unsigned-hint-is-not-authority");
});
