#!/usr/bin/env node
import { parseArgs } from "node:util";
import {
  SEEDED_FAILURE,
  coverageReport,
  crossCheckInTreeCatalog,
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
        message: `${refused} is refused. This pack is unpaid amount-matrix fixture validation only.`,
      },
    })}\n`,
  );
  process.exit(2);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    suite: { type: "boolean", default: false },
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
  process.stdout.write(`SameDayDesk W7 unpaid amount-matrix fixtures.

Usage:
  node tools/commerce-receipts/amount-matrix-w7/cli.mjs --suite
  node tools/commerce-receipts/amount-matrix-w7/cli.mjs --matrix
  node tools/commerce-receipts/amount-matrix-w7/cli.mjs --cross-check
  node tools/commerce-receipts/amount-matrix-w7/cli.mjs --seeded-failure stale-listed-amount
  node tools/commerce-receipts/amount-matrix-w7/cli.mjs --expect-reject stale_listed_amount <file.json>
  node tools/commerce-receipts/amount-matrix-w7/cli.mjs <file.json> [file.json...]

--suite            accept every valid unpaid fixture and reject every invalid fixture
--matrix           print the pinned SDS route/amount matrix (cold)
--cross-check      compare the matrix to in-tree fixtures/presence/catalog/x402.json
--coverage         every matrix route and unique amount has an unpaid fixture
--seeded-failure   require the designated stale-listed-amount seed to be caught (exit 1)
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

const exclusive =
  Number(Boolean(values.suite)) +
  Number(Boolean(values.matrix)) +
  Number(Boolean(values["cross-check"])) +
  Number(Boolean(values.coverage)) +
  Number(Boolean(values["seeded-failure"]));

if (exclusive > 1) {
  process.stderr.write("Pass only one of --suite, --matrix, --cross-check, --coverage, or --seeded-failure.\n");
  process.exit(2);
}

if (values.suite) {
  if (positionals.length > 0 || values["expect-reject"]) {
    process.stderr.write("--suite does not take files or --expect-reject.\n");
    process.exit(2);
  }
  const report = runSuite();
  const coverage = coverageReport();
  const cross = crossCheckInTreeCatalog();
  write(
    {
      ok: report.ok && coverage.ok && cross.ok,
      command: "suite",
      passed: report.passed,
      failed: report.failed,
      total: report.total,
      coverage,
      crossCheck: {
        ok: cross.ok,
        catalogPath: cross.catalogPath,
        lastUpdated: cross.lastUpdated,
        matrixRoutes: cross.matrixRoutes,
        catalogItems: cross.catalogItems,
        findings: cross.findings,
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
  const cross = crossCheckInTreeCatalog();
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
  if (values["seeded-failure"] !== SEEDED_FAILURE) {
    write(
      {
        ok: false,
        command: "seeded-failure",
        error: {
          code: "USAGE",
          message: "--seeded-failure must be stale-listed-amount",
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
        fixtureId: seed.result?.fixtureId ?? null,
        statusClass: seed.result?.statusClass ?? null,
        route: seed.result?.route ?? null,
        amountAtomic: seed.result?.amountAtomic ?? null,
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
    "Pass --suite, --matrix, --cross-check, --coverage, --seeded-failure stale-listed-amount, --help, or one or more JSON files.\n",
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
