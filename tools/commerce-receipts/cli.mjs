#!/usr/bin/env node
import { parseArgs } from "node:util";
import {
  evaluateSeededFailure,
  refusedFlag,
  runSuite,
  SEEDED_FAILURE,
  validateFile,
} from "./lib.mjs";

const refused = refusedFlag(process.argv.slice(2));
if (refused) {
  process.stdout.write(
    `${JSON.stringify({
      ok: false,
      error: {
        code: "REFUSED",
        message: `${refused} is refused. This pack is unpaid fixture validation only. No pay, publish, or neo-kernel-vendor.`,
      },
    })}\n`,
  );
  process.exit(2);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    cold: { type: "boolean", default: false },
    suite: { type: "boolean", default: false },
    "seeded-failure": { type: "string" },
    "expect-reject": { type: "string" },
    pretty: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  process.stdout.write(`SameDayDesk unpaid commerce receipt fixtures.

Usage:
  node tools/commerce-receipts/cli.mjs --cold
  node tools/commerce-receipts/cli.mjs --suite
  node tools/commerce-receipts/cli.mjs --seeded-failure paid-as-unpaid
  node tools/commerce-receipts/cli.mjs --expect-reject paid_as_unpaid <file.json>
  node tools/commerce-receipts/cli.mjs <file.json> [file.json...]

--cold             offline fixture suite (no network, no payment)
--suite            same as --cold
--seeded-failure   require the designated paid-as-unpaid seed to be caught (exit 1)
--expect-reject    require the named error code on a single file
--pretty           indent JSON

Does not pay, checkout, publish, attach neo-kernel-vendor, or mutate a registry.
--live/--pay/--payment/--checkout/--publish/--registry/--refresh/--settle/--neo/--neo-kernel-vendor are refused.
`);
  process.exit(0);
}

const indent = values.pretty ? 2 : 0;

function write(value, ok, code = ok ? 0 : 1) {
  process.stdout.write(`${JSON.stringify(value, null, indent)}\n`);
  process.exit(code);
}

if (values.cold || values.suite) {
  if (positionals.length > 0 || values["expect-reject"] || values["seeded-failure"]) {
    process.stderr.write("--cold/--suite does not take files, --expect-reject, or --seeded-failure.\n");
    process.exit(2);
  }
  const report = runSuite();
  write(
    {
      ok: report.ok,
      command: values.cold ? "cold" : "suite",
      paid: false,
      live: false,
      network: false,
      neo: false,
      published: false,
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

if (values["seeded-failure"]) {
  if (values["seeded-failure"] !== SEEDED_FAILURE) {
    write(
      {
        ok: false,
        command: "seeded-failure",
        error: {
          code: "USAGE",
          message: "--seeded-failure must be paid-as-unpaid",
        },
      },
      false,
      2,
    );
  }
  if (positionals.length > 0 || values["expect-reject"]) {
    process.stderr.write("--seeded-failure does not take files or --expect-reject.\n");
    process.exit(2);
  }
  const seed = evaluateSeededFailure();
  write(
    {
      ok: false,
      command: "seeded-failure",
      seed: SEEDED_FAILURE,
      error: seed.error,
      result: {
        file: seed.filePath ?? null,
        receiptId: seed.result?.receiptId ?? null,
        statusClass: seed.result?.statusClass ?? null,
        naiveVerdict: seed.result?.naiveVerdict ?? null,
        honestVerdict: seed.result?.honestVerdict ?? null,
        codes: seed.result?.codes ?? [],
        caught: seed.caught,
      },
    },
    false,
    1,
  );
}

if (positionals.length === 0) {
  process.stderr.write("Pass --cold, --suite, --seeded-failure paid-as-unpaid, --help, or one or more JSON files.\n");
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
      receiptId: result.receiptId,
      statusClass: result.statusClass,
      naiveVerdict: result.naiveVerdict,
      honestVerdict: result.honestVerdict,
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
      receiptId: item.receiptId,
      statusClass: item.statusClass,
      naiveVerdict: item.naiveVerdict,
      honestVerdict: item.honestVerdict,
      codes: item.errors.map((error) => error.code),
      errors: item.errors,
    })),
  },
  failed.length === 0,
);
