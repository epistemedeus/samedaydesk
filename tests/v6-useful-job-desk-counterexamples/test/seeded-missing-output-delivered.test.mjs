import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { checkDeskReport } from "../lib/check-report.mjs";
import { FIXTURES, SEEDED_REPORT } from "../lib/paths.mjs";
import { naiveAccept, parseStdout, readFixtureReport, runCheck } from "./helpers.mjs";

test("seeded missing-output-reported-delivered fixture is rejected", () => {
  const report = JSON.parse(readFileSync(SEEDED_REPORT, "utf8"));
  const result = checkDeskReport(report, { reportPath: SEEDED_REPORT, seeded: true });
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(result.parseable, true);
  assert.equal(result.code, "missing_output_reported_delivered");
  assert.equal(result.failure.class, "missing_output_reported_delivered");
  assert.equal(result.failure.seeded, "missing_output_reported_delivered");
  assert.deepEqual(result.failure.missing.sort(), ["pin-delta.json", "pin-delta.md"]);
  assert.equal(result.failure.jobId, "lockfile-pin-delta");
});

test("CLI --seeded-fixture exits 2 with parseable error JSON", () => {
  const proc = runCheck(["--seeded-fixture"]);
  const { json } = parseStdout(proc);
  assert.equal(proc.status, 2, proc.stderr || proc.stdout);
  assert.notEqual(proc.status, 0);
  assert.equal(json.ok, false);
  assert.equal(json.parseable, true);
  assert.equal(typeof json.error, "string");
  assert.ok(json.error.length > 0);
  assert.equal(json.code, "missing_output_reported_delivered");
  assert.equal(json.failure.class, "missing_output_reported_delivered");
  assert.match(json.error, /missing output cannot report delivered/);
});

test("CLI --report on the seeded path is the same rejection", () => {
  const proc = runCheck([
    "--report",
    "tests/v6-useful-job-desk-counterexamples/fixtures/missing-output-reported-delivered/report.json",
  ]);
  const { json } = parseStdout(proc);
  assert.equal(proc.status, 2);
  assert.equal(json.ok, false);
  assert.equal(json.parseable, true);
  assert.equal(json.code, "missing_output_reported_delivered");
});

test("naive ok/delivered accept would take the seeded fixture; this oracle does not", () => {
  const report = readFixtureReport("missing-output-reported-delivered/report.json");
  assert.equal(naiveAccept(report), true);
  assert.equal(report.ok, true);
  assert.equal(report.delivered, true);
  assert.equal(report.status, "delivered");
  assert.equal(report.delivery.complete, true);
  assert.deepEqual(report.delivery.missing, []);
  const checked = checkDeskReport(report, { reportPath: SEEDED_REPORT });
  assert.equal(checked.ok, false);
  assert.equal(checked.code, "missing_output_reported_delivered");
});

test("one promised file present is still missing_output_reported_delivered", () => {
  const reportPath = join(FIXTURES, "missing-one-output-reported-delivered/report.json");
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const result = checkDeskReport(report, { reportPath });
  assert.equal(result.ok, false);
  assert.equal(result.code, "missing_output_reported_delivered");
  assert.deepEqual(result.failure.missing, ["pin-delta.md"]);
  assert.deepEqual(result.failure.present, ["pin-delta.json"]);
});

test("empty outputs array cannot dodge catalog-promised files", () => {
  const reportPath = join(FIXTURES, "empty-outputs-delivered.json");
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const result = checkDeskReport(report, { reportPath });
  assert.equal(result.ok, false);
  assert.equal(result.code, "missing_output_reported_delivered");
  assert.ok(result.failure.missing.includes("pin-delta.json"));
  assert.ok(result.failure.missing.includes("pin-delta.md"));
});

test("seeded stdout is parseable JSON even with --compact", () => {
  const proc = runCheck(["--compact", "--seeded-fixture"]);
  assert.equal(proc.status, 2);
  const json = JSON.parse(proc.stdout);
  assert.equal(json.ok, false);
  assert.equal(json.parseable, true);
  assert.equal(json.code, "missing_output_reported_delivered");
});
