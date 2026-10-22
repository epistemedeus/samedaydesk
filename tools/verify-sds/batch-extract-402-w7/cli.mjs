#!/usr/bin/env node
import { parseArgs } from "node:util";
import {
  SEEDED_FAILURES,
  coverageReport,
  crossCheckInTreePins,
  evaluateAllSeededFailures,
  evaluateSeededFailure,
  matrixSummary,
  refusedFlag,
  runSuite,
  validateFile,
} from "./lib.mjs";

const refused = refusedFlag(process.argv.slice(2));
if (refused) {
  process.stdout.write(
    `${JSON.stringify({
      ok: false,
      error: {
        code: "REFUSED",
        message: `${refused} is refused. This pack is unpaid extract/batch 402 amount-gate fixture validation only.`,
      },
    })}\n`,
  );
  process.exit(2);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    suite: { type: "boolean", default: false },
    cold: { type: "boolean", default: false },
    matrix: { type: "boolean", default: false },
    "cross-check": { type: "boolean", default: false },
    coverage: { type: "boolean", default: false },
    "seeded-failure": { type: "string" },
    "expect-reject": { type: "string" },
    pretty: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  process.stdout.write(`SameDayDesk W7 POST /extract/batch unpaid 402 amount gate.

Usage:
  node tools/verify-sds/batch-extract-402-w7/cli.mjs --cold
  node tools/verify-sds/batch-extract-402-w7/cli.mjs --suite
  node tools/verify-sds/batch-extract-402-w7/cli.mjs --matrix
  node tools/verify-sds/batch-extract-402-w7/cli.mjs --cross-check
  node tools/verify-sds/batch-extract-402-w7/cli.mjs --seeded-failure all
  node tools/verify-sds/batch-extract-402-w7/cli.mjs --seeded-failure wrong-amount
  node tools/verify-sds/batch-extract-402-w7/cli.mjs --seeded-failure missing-amount
  node tools/verify-sds/batch-extract-402-w7/cli.mjs --seeded-failure forged-settlement
  node tools/verify-sds/batch-extract-402-w7/cli.mjs --expect-reject wrong_amount <file.json>
  node tools/verify-sds/batch-extract-402-w7/cli.mjs <file.json> [file.json...]

--cold / --suite   accept every valid unpaid 402 fixture and reject every invalid fixture
--matrix           print the pinned extract/batch amount (10000) and GET /extract contrast (5000)
--cross-check      compare the pin to in-tree llms.txt, quote fixtures, and x402.json
--coverage         1-URL and 5-URL unpaid fixtures share the flat 10000 amount
--seeded-failure   require the named seed (or all three) to be caught (exit 1)
--expect-reject    require the named error code on a single file
--pretty           indent JSON

Does not pay, checkout, publish, attach neo, or mutate a registry.
--live/--pay/--payment/--checkout/--publish/--registry/--refresh/--settle/--neo are refused.
`);
  process.exit(0);
}

const indent = values.pretty ? 2 : 0;

function write(value, ok, code = ok ? 0 : 1) {
  process.stdout.write(`${JSON.stringify(value, null, indent)}\n`);
  process.exit(code);
}

const suiteRequested = Boolean(values.suite || values.cold);
const exclusive =
  Number(suiteRequested) +
  Number(Boolean(values.matrix)) +
  Number(Boolean(values["cross-check"])) +
  Number(Boolean(values.coverage)) +
  Number(Boolean(values["seeded-failure"]));

if (exclusive > 1) {
  process.stderr.write("Pass only one of --cold/--suite, --matrix, --cross-check, --coverage, or --seeded-failure.\n");
  process.exit(2);
}

if (suiteRequested) {
  if (positionals.length > 0 || values["expect-reject"]) {
    process.stderr.write("--cold/--suite does not take files or --expect-reject.\n");
    process.exit(2);
  }
  const report = runSuite();
  const coverage = coverageReport();
  const cross = crossCheckInTreePins();
  write(
    {
      ok: report.ok && coverage.ok && cross.ok,
      command: values.cold ? "cold" : "suite",
      wave: "w7",
      pack: "batch-extract-402-w7",
      route: "POST /extract/batch",
      amountAtomic: "10000",
      amountDisplayUsd: "0.01",
      passed: report.passed,
      failed: report.failed,
      total: report.total,
      coverage,
      crossCheck: {
        ok: cross.ok,
        catalogPath: cross.catalogPath,
        lastUpdated: cross.lastUpdated,
        catalogItems: cross.catalogItems,
        catalogHasExtractBatch: cross.catalogHasExtractBatch,
        catalogExtractAmount: cross.catalogExtractAmount,
        primaryAmountAtomic: cross.primaryAmountAtomic,
        contrastAmountAtomic: cross.contrastAmountAtomic,
        findings: cross.findings,
      },
      boundary: {
        paymentSent: false,
        checkoutMutated: false,
        published: false,
        neoAttached: false,
        live: false,
      },
      results: report.results.map((item) => ({
        file: item.filePath,
        expect: item.expect,
        expectedCode: item.expectedCode ?? null,
        ok: item.ok,
        codes: item.errors.map((error) => error.code),
      })),
    },
    report.ok && coverage.ok && cross.ok,
  );
}

if (values.matrix) {
  write({ ok: true, command: "matrix", ...matrixSummary() }, true);
}

if (values["cross-check"]) {
  const cross = crossCheckInTreePins();
  write(
    {
      ok: cross.ok,
      command: "cross-check",
      ...cross,
    },
    cross.ok,
  );
}

if (values.coverage) {
  const coverage = coverageReport();
  write({ ok: coverage.ok, command: "coverage", ...coverage }, coverage.ok);
}

if (values["seeded-failure"]) {
  if (positionals.length > 0 || values["expect-reject"]) {
    process.stderr.write("--seeded-failure does not take files or --expect-reject.\n");
    process.exit(2);
  }
  const seed = values["seeded-failure"];
  if (seed === "all") {
    const report = evaluateAllSeededFailures();
    write(
      {
        ok: false,
        command: "seeded-failure",
        seed: "all",
        error: report.error,
        caught: report.caught,
        boundary: { paymentSent: false, live: false },
        results: report.seeds.map((item) => ({
          seed: item.id,
          caught: item.caught,
          error: item.error,
          file: item.filePath ?? null,
          naiveVerdict: item.result?.naiveVerdict ?? null,
          honestVerdict: item.result?.honestVerdict ?? null,
          codes: item.result?.codes ?? [],
          amountAtomic: item.result?.amountAtomic ?? null,
        })),
      },
      false,
      1,
    );
  }
  if (!SEEDED_FAILURES.includes(seed)) {
    write(
      {
        ok: false,
        command: "seeded-failure",
        error: {
          code: "USAGE",
          message: `--seeded-failure must be ${SEEDED_FAILURES.join("|")} or all`,
        },
      },
      false,
      2,
    );
  }
  const result = evaluateSeededFailure(seed);
  write(
    {
      ok: false,
      command: "seeded-failure",
      seed,
      error: result.error,
      result: {
        file: result.filePath ?? null,
        fixtureId: result.result?.fixtureId ?? null,
        statusClass: result.result?.statusClass ?? null,
        route: result.result?.route ?? null,
        amountAtomic: result.result?.amountAtomic ?? null,
        naiveVerdict: result.result?.naiveVerdict ?? null,
        honestVerdict: result.result?.honestVerdict ?? null,
        codes: result.result?.codes ?? [],
        caught: result.caught,
      },
      boundary: { paymentSent: false, live: false },
    },
    false,
    1,
  );
}

if (positionals.length === 0) {
  process.stderr.write(
    "Pass --cold, --suite, --matrix, --cross-check, --coverage, --seeded-failure all|wrong-amount|missing-amount|forged-settlement, --help, or one or more JSON files.\n",
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
  const codes = result.errors.map((error) => error.code);
  const ok = !result.ok && codes.includes(expectedCode);
  write(
    {
      ok,
      expectReject: expectedCode,
      file: result.filePath,
      fixtureId: result.fixtureId,
      statusClass: result.statusClass,
      route: result.route,
      amountAtomic: result.amountAtomic,
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
      fixtureId: item.fixtureId,
      statusClass: item.statusClass,
      route: item.route,
      amountAtomic: item.amountAtomic,
      naiveVerdict: item.naiveVerdict,
      honestVerdict: item.honestVerdict,
      codes: item.errors.map((error) => error.code),
      errors: item.errors,
    })),
  },
  failed.length === 0,
);
