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
        message: `${refused} is refused. This pack binds unpaid SDS evidence to committed SHA-256 digests only. No pay, publish, or Stripe.`,
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
  process.stdout.write(`SameDayDesk w8 SHA-bind unpaid evidence.

Usage:
  node tools/evidence-records/sha-bind-unpaid-w8/cli.mjs --cold
  node tools/evidence-records/sha-bind-unpaid-w8/cli.mjs --suite
  node tools/evidence-records/sha-bind-unpaid-w8/cli.mjs --seeded-failure sha-mismatch
  node tools/evidence-records/sha-bind-unpaid-w8/cli.mjs --expect-reject sha_mismatch <file.json>
  node tools/evidence-records/sha-bind-unpaid-w8/cli.mjs <file.json> [file.json...]

--cold             recompute SHA-256 of committed unpaid artifacts and accept the bound set
--suite            same as --cold
--seeded-failure   require the designated sha-mismatch seed to be caught (exit 1)
--expect-reject    require the named error code on a single file
--pretty           indent JSON

Does not pay, publish, or call Stripe.
--live/--pay/--payment/--checkout/--publish/--stripe/--settle/--neo/--neo-kernel-vendor are refused.
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
      wave: "w8",
      paid: false,
      live: false,
      network: false,
      stripe: false,
      published: false,
      passed: report.passed,
      failed: report.failed,
      total: report.total,
      results: report.results.map((item) => ({
        file: item.filePath,
        expect: item.expect,
        expectedCode: item.expectedCode ?? null,
        ok: item.ok,
        codes: item.errors.map((err) => err.code),
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
          message: "--seeded-failure must be sha-mismatch",
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
        bindId: seed.result?.bindId ?? null,
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
  process.stderr.write(
    "Pass --cold, --suite, --seeded-failure sha-mismatch, --help, or one or more JSON files.\n",
  );
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
  const codes = result.errors.map((err) => err.code);
  const ok = !result.ok && codes.includes(expectedCode);
  write(
    {
      ok,
      expectReject: expectedCode,
      file: result.filePath,
      bindId: result.bindId,
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
      bindId: item.bindId,
      statusClass: item.statusClass,
      naiveVerdict: item.naiveVerdict,
      honestVerdict: item.honestVerdict,
      codes: item.errors.map((err) => err.code),
      errors: item.errors,
    })),
  },
  failed.length === 0,
);
