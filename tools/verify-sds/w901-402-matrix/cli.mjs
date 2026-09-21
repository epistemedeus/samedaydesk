#!/usr/bin/env node
import { parseArgs } from "node:util";
import {
  SEEDED_FAILURE_ALL,
  coverageReport,
  crossCheckInTreeCatalog,
  evaluateSeededFailure,
  matrixSummary,
  refusedFlag,
  resolveSeedSpec,
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
        message: `${refused} is refused. This pack is unpaid 402-matrix fixture validation only.`,
      },
    })}\n`,
  );
  process.exit(2);
}

let values;
let positionals;
try {
  ({ values, positionals } = parseArgs({
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
  }));
} catch (cause) {
  process.stdout.write(
    `${JSON.stringify({
      ok: false,
      error: {
        code: "USAGE",
        message: cause.message,
      },
    })}\n`,
  );
  process.exit(2);
}

if (values.help) {
  process.stdout.write(`SameDayDesk w901 unpaid 402 matrix.

Usage:
  node tools/verify-sds/w901-402-matrix/cli.mjs --cold
  node tools/verify-sds/w901-402-matrix/cli.mjs --suite
  node tools/verify-sds/w901-402-matrix/cli.mjs --matrix
  node tools/verify-sds/w901-402-matrix/cli.mjs --cross-check
  node tools/verify-sds/w901-402-matrix/cli.mjs --seeded-failure all
  node tools/verify-sds/w901-402-matrix/cli.mjs --seeded-failure bad-amount
  node tools/verify-sds/w901-402-matrix/cli.mjs --seeded-failure bad-status
  node tools/verify-sds/w901-402-matrix/cli.mjs --seeded-failure forged-settle
  node tools/verify-sds/w901-402-matrix/cli.mjs --expect-reject stale_listed_amount <file.json>
  node tools/verify-sds/w901-402-matrix/cli.mjs <file.json> [file.json...]

--cold / --suite   accept every valid unpaid 402 fixture and reject every invalid fixture
--matrix           print the pinned SDS route/amount matrix (cold)
--cross-check      compare the matrix to in-tree fixtures/presence/catalog/x402.json
--coverage         every matrix route and unique amount has an unpaid 402 fixture
--seeded-failure   require designated seeds to be caught (exit 1): all, bad-amount, bad-status, forged-settle
--expect-reject    require the named error code on a single file
--pretty           indent JSON

Does not pay, checkout, publish, attach neo, or mutate a registry.
--live/--pay/--payment/--checkout/--publish/--registry/--refresh/--settle/--neo
(including equals-form --live=true) are refused.
`);
  process.exit(0);
}

const indent = values.pretty ? 2 : 0;

function write(value, ok, code = ok ? 0 : 1) {
  process.stdout.write(`${JSON.stringify(value, null, indent)}\n`);
  process.exit(code);
}

try {
runCommands();
} catch (cause) {
  write(
    {
      ok: false,
      error: {
        code: "MATRIX",
        message: cause.message,
      },
    },
    false,
    2,
  );
}

function runCommands() {
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
  const cross = crossCheckInTreeCatalog();
  write(
    {
      ok: report.ok && coverage.ok && cross.ok,
      command: values.cold ? "cold" : "suite",
      wave: "w901",
      pack: "w901-402-matrix",
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
  const requested = values["seeded-failure"];
  if (!resolveSeedSpec(requested)) {
    write(
      {
        ok: false,
        command: "seeded-failure",
        error: {
          code: "USAGE",
          message: "--seeded-failure must be all, bad-amount, bad-status, or forged-settle",
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
  const seed = evaluateSeededFailure(requested);
  const summarize = (item) => ({
    seed: item.seed ?? requested,
    file: item.filePath ?? null,
    fixtureId: item.result?.fixtureId ?? null,
    statusClass: item.result?.statusClass ?? null,
    route: item.result?.route ?? null,
    amountAtomic: item.result?.amountAtomic ?? null,
    naiveVerdict: item.result?.naiveVerdict ?? null,
    honestVerdict: item.result?.honestVerdict ?? null,
    codes: item.result?.codes ?? [],
    caught: item.caught,
  });
  const caught = Boolean(seed.caught);
  write(
    {
      ok: false,
      command: "seeded-failure",
      seed: requested === SEEDED_FAILURE_ALL ? SEEDED_FAILURE_ALL : seed.seed,
      error: seed.error,
      result: seed.results ? seed.results.map(summarize) : summarize(seed),
    },
    false,
    caught ? 1 : 2,
  );
}

if (positionals.length === 0) {
  process.stderr.write(
    "Pass --cold, --suite, --matrix, --cross-check, --coverage, --seeded-failure all, --help, or one or more JSON files.\n",
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
}
