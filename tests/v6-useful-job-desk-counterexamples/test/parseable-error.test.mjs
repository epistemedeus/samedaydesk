import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { checkDeskReport } from "../lib/check-report.mjs";
import { findParseableError, parseableErrorFields } from "../lib/parse-error.mjs";
import { FIXTURES } from "../lib/paths.mjs";
import { parseStdout, runCheck } from "./helpers.mjs";

test("honest failure report is parseable and is not delivered", () => {
  const reportPath = join(FIXTURES, "honest-failure.json");
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const result = checkDeskReport(report, { reportPath });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.delivered, false);
  assert.equal(result.parseableError, true);
  assert.equal(result.code, "missing-required-inputs");
});

test("CLI accepts the honest failure report with exit 0", () => {
  const proc = runCheck([
    "--report",
    "tests/v6-useful-job-desk-counterexamples/fixtures/honest-failure.json",
  ]);
  const { json } = parseStdout(proc);
  assert.equal(proc.status, 0, proc.stderr || proc.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.delivered, false);
  assert.equal(json.parseableError, true);
});

test("ok:false without error or code is unparseable and exits 2", () => {
  const reportPath = join(FIXTURES, "unparseable-failure.json");
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const result = checkDeskReport(report, { reportPath });
  assert.equal(result.ok, false);
  assert.equal(result.parseable, true);
  assert.equal(result.code, "unparseable_error");
  const proc = runCheck([
    "--report",
    "tests/v6-useful-job-desk-counterexamples/fixtures/unparseable-failure.json",
  ]);
  assert.equal(proc.status, 2);
  const json = JSON.parse(proc.stdout);
  assert.equal(json.ok, false);
  assert.equal(json.parseable, true);
  assert.equal(json.code, "unparseable_error");
});

test("parseableErrorFields requires ok:false plus error or code", () => {
  assert.equal(parseableErrorFields({ ok: true, error: "nope" }), null);
  assert.equal(parseableErrorFields({ ok: false }), null);
  const parsed = parseableErrorFields({
    ok: false,
    refused: true,
    code: "missing-required-inputs",
    error: "Caller mode requires --before and --after",
  });
  assert.equal(parsed.parseable, true);
  assert.equal(parsed.code, "missing-required-inputs");
  assert.equal(parsed.refused, true);
  const notRefused = parseableErrorFields({ ok: false, error: "plain" });
  assert.equal(notRefused.refused, false);
});

test("findParseableError reads JSON from mixed stderr", () => {
  const text = `noise\n{"ok":false,"error":"unknown job x","code":"unknown-job"}\n`;
  const found = findParseableError(text);
  assert.equal(found.parsed.parseable, true);
  assert.equal(found.parsed.error, "unknown job x");
});
