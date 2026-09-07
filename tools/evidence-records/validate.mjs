#!/usr/bin/env node
import { parseArgs } from "node:util";
import { runSuite, validateFile } from "./lib.mjs";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    suite: { type: "boolean", default: false },
    "expect-reject": { type: "string" },
    pretty: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  process.stdout.write(`Typed evidence-record validator.

Usage:
  node tools/evidence-records/validate.mjs --suite
  node tools/evidence-records/validate.mjs <file.json> [file.json...]
  node tools/evidence-records/validate.mjs --expect-reject <code> <file.json>

--suite          accept every valid fixture and reject every invalid fixture
--expect-reject  require the named error code on a single file
--pretty         indent JSON
`);
  process.exit(0);
}

const indent = values.pretty ? 2 : 0;

function write(value, ok) {
  process.stdout.write(`${JSON.stringify(value, null, indent)}\n`);
  process.exit(ok ? 0 : 1);
}

if (values.suite) {
  if (positionals.length > 0 || values["expect-reject"]) {
    process.stderr.write("--suite does not take files or --expect-reject.\n");
    process.exit(2);
  }
  const report = runSuite();
  write(
    {
      ok: report.ok,
      passed: report.passed,
      failed: report.failed,
      total: report.total,
      results: report.results.map((item) => ({
        file: item.filePath,
        expect: item.expect,
        expectedCode: item.expectedCode ?? null,
        ok: item.ok,
        codes: item.errors.map((error) => error.code),
      })),
    },
    report.ok,
  );
}

if (positionals.length === 0) {
  process.stderr.write("Pass --suite, --help, or one or more JSON files.\n");
  process.exit(2);
}

const expectedCode = values["expect-reject"];
if (expectedCode && positionals.length !== 1) {
  process.stderr.write("--expect-reject requires exactly one file.\n");
  process.exit(2);
}

const results = positionals.map((filePath) => validateFile(filePath));
if (expectedCode) {
  const result = results[0];
  const codes = result.errors.map((error) => error.code);
  const ok = !result.ok && codes.includes(expectedCode);
  write(
    {
      ok,
      expectReject: expectedCode,
      file: result.filePath,
      codes,
      errors: result.errors,
    },
    ok,
  );
}

const failed = results.filter((item) => !item.ok);
write(
  {
    ok: failed.length === 0,
    passed: results.length - failed.length,
    failed: failed.length,
    total: results.length,
    results: results.map((item) => ({
      file: item.filePath,
      ok: item.ok,
      codes: item.errors.map((error) => error.code),
      errors: item.errors,
    })),
  },
  failed.length === 0,
);
