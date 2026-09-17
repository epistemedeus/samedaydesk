import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { FAIL_DIR, PASS_DIR, listJsonFiles } from "../src/case.mjs";
import { runSeededFailure, runSuite } from "../src/suite.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACK = join(HERE, "..");
const CLI = join(PACK, "bin/verify.mjs");
const SEEDED = join(FAIL_DIR, "sds-http-200-unpaid-fixpack-claimed-settle.json");

function run(args, extra = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    cwd: PACK,
    maxBuffer: 2 * 1024 * 1024,
    ...extra,
  });
}

function parseStdout(result) {
  assert.equal(result.error, undefined, result.stderr);
  const text = String(result.stdout).trim();
  assert.ok(text.length > 0, `empty stdout, stderr=${result.stderr}`);
  return JSON.parse(text);
}

test("cold suite: pass fixtures pass and fail fixtures are rejected", () => {
  const report = runSuite();
  assert.equal(report.ok, true, JSON.stringify(report, null, 2));
  assert.ok(report.passed >= 1);
  assert.ok(report.rejectedAsExpected >= 1);
  assert.equal(report.unexpected, 0);
  assert.equal(listJsonFiles(PASS_DIR).length, report.passed);
  assert.equal(listJsonFiles(FAIL_DIR).length, report.rejectedAsExpected);
});

test("CLI --suite exits 0", () => {
  const result = run(["--suite"]);
  const report = parseStdout(result);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(report.ok, true);
  assert.equal(report.mode, "suite");
});

test("CLI with no args is a cold suite", () => {
  const result = run([]);
  const report = parseStdout(result);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(report.mode, "suite");
  assert.equal(report.ok, true);
});

test("seeded failure file is rejected with non-zero exit", () => {
  const result = run(["--case", SEEDED]);
  const report = parseStdout(result);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(report.ok, false);
  assert.equal(report.verdict, "reject");
  assert.equal(report.id, "sds-http-200-unpaid-fixpack-claimed-settle");
  assert.match(String(report.code), /iserror|claimed_settle|http_200/i);
});

test("CLI positional fail fixture is the same seeded reject", () => {
  const result = run([SEEDED]);
  const report = parseStdout(result);
  assert.equal(result.status, 1);
  assert.equal(report.verdict, "reject");
});

test("--expect-reject on the seeded failure exits 0", () => {
  const result = run(["--expect-reject", SEEDED]);
  const report = parseStdout(result);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(report.ok, true);
  assert.equal(report.expectReject, true);
  assert.equal(report.verdict, "reject");
});

test("--seeded-failure confirms every fail fixture is rejected", () => {
  const report = runSeededFailure();
  assert.equal(report.ok, true, JSON.stringify(report, null, 2));
  const result = run(["--seeded-failure"]);
  const cli = parseStdout(result);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(cli.ok, true);
  assert.equal(cli.mode, "seeded-failure");
  assert.equal(cli.rejectedAsExpected, listJsonFiles(FAIL_DIR).length);
});

test("pass fixture exits 0", () => {
  const file = join(PASS_DIR, "sds-unpaid-fixpack-iserror.json");
  const result = run(["--case", file]);
  const report = parseStdout(result);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(report.ok, true);
  assert.equal(report.verdict, "pass");
  assert.equal(report.classification.settleAllowed, false);
});

test("forbidden --live is refused", () => {
  const result = run(["--live"]);
  const report = parseStdout(result);
  assert.equal(result.status, 2);
  assert.equal(report.ok, false);
  assert.equal(report.code, "forbidden_flag");
  assert.match(report.error, /--live/);
});

test("forbidden --pay is refused", () => {
  const result = run(["--pay"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /forbidden_flag/);
});
