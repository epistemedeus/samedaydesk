#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  SEEDED_FAILURE,
  codesFrom,
  evaluateFile,
  evaluateSeededFailure,
  refusedFlag,
  runCold,
  runSuite,
} from "./lib.mjs";

const HELP = `SameDayDesk bazaar-listing vs unpaid commerce-receipt drift (offline).

Joins Coinbase Bazaar SDS listings to unpaid origin 402 receipts by
origin+pathname. Catalog absence is not demand. Compact observations stay
digest-only. Does not pay, checkout, publish, call CDP, or touch neo.

Usage:
  node tools/commerce-receipts/bazaar-drift/cli.mjs --cold
  node tools/commerce-receipts/bazaar-drift/cli.mjs --suite
  node tools/commerce-receipts/bazaar-drift/cli.mjs --seeded-failure read-claimed-match
  node tools/commerce-receipts/bazaar-drift/cli.mjs --expect-reject amount_drift <file.json>
  node tools/commerce-receipts/bazaar-drift/cli.mjs <file.json>

--cold             honest audit of pinned 8 SDS bazaar routes vs unpaid receipts
--suite            accept every valid fixture and reject every invalid fixture
--seeded-failure   require the designated /read claim-match seed to be caught (exit 1)
--expect-reject    require the named error code on a single file
--pretty           indent JSON

--live/--pay/--payment/--checkout/--publish/--registry/--refresh/--settle/--neo/--neo-kernel-vendor are refused.
`;

function writeJson(value, pretty) {
  return `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`;
}

export function runCli(argv = process.argv.slice(2), io = process) {
  const refused = refusedFlag(argv);
  if (refused) {
    io.stdout.write(
      writeJson(
        {
          ok: false,
          error: {
            code: "REFUSED",
            message: `${refused} is refused. This pack is unpaid bazaar-vs-receipt drift only. No pay, publish, or neo-kernel-vendor.`,
          },
        },
        false,
      ),
    );
    return 2;
  }

  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        help: { type: "boolean", default: false },
        pretty: { type: "boolean", default: false },
        cold: { type: "boolean", default: false },
        suite: { type: "boolean", default: false },
        "seeded-failure": { type: "string" },
        "expect-reject": { type: "string" },
      },
    }));
  } catch (cause) {
    io.stderr.write(`${cause.message}\n`);
    return 2;
  }

  const pretty = values.pretty === true;
  const write = (value, code) => {
    io.stdout.write(writeJson(value, pretty));
    return code;
  };

  if (values.help) {
    io.stdout.write(HELP);
    return 0;
  }

  const selected = [values.cold, values.suite, Boolean(values["seeded-failure"])].filter(Boolean).length;
  if (selected > 1) {
    io.stderr.write("Use only one of --cold, --suite, or --seeded-failure.\n");
    return 2;
  }

  if (values.cold) {
    if (positionals.length > 0 || values["expect-reject"]) {
      io.stderr.write("--cold does not take files or --expect-reject.\n");
      return 2;
    }
    const cold = runCold();
    return write(cold, cold.ok ? 0 : 1);
  }

  if (values.suite) {
    if (positionals.length > 0 || values["expect-reject"]) {
      io.stderr.write("--suite does not take files or --expect-reject.\n");
      return 2;
    }
    const report = runSuite();
    return write(
      {
        ok: report.ok,
        command: "suite",
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
      report.ok ? 0 : 1,
    );
  }

  if (values["seeded-failure"]) {
    if (values["seeded-failure"] !== SEEDED_FAILURE) {
      return write(
        {
          ok: false,
          command: "seeded-failure",
          error: {
            code: "USAGE",
            message: "--seeded-failure must be read-claimed-match",
          },
        },
        2,
      );
    }
    if (positionals.length > 0 || values["expect-reject"]) {
      io.stderr.write("--seeded-failure does not take files or --expect-reject.\n");
      return 2;
    }
    const seed = evaluateSeededFailure();
    return write(
      {
        ok: false,
        command: "seeded-failure",
        seed: SEEDED_FAILURE,
        error: seed.error,
        result: {
          file: seed.filePath ?? null,
          path: seed.result?.path ?? null,
          bazaarAmount: seed.result?.bazaarAmount ?? null,
          receiptAmount: seed.result?.receiptAmount ?? null,
          naiveVerdict: seed.result?.naiveVerdict ?? null,
          honestVerdict: seed.result?.honestVerdict ?? null,
          codes: seed.result ? codesFrom(seed.result) : [],
          caught: seed.caught,
        },
      },
      1,
    );
  }

  if (positionals.length === 0) {
    io.stderr.write(HELP);
    return 2;
  }

  const expectedCode = values["expect-reject"];
  if (expectedCode && positionals.length !== 1) {
    io.stderr.write("--expect-reject requires exactly one file.\n");
    return 2;
  }

  if (expectedCode) {
    const result = evaluateFile(positionals[0]);
    const codes = codesFrom(result);
    const ok = result.ok === false && codes.includes(expectedCode);
    return write(
      {
        ok,
        expectReject: expectedCode,
        file: result.filePath,
        path: result.path ?? null,
        bazaarAmount: result.bazaarAmount ?? null,
        receiptAmount: result.receiptAmount ?? null,
        naiveVerdict: result.naiveVerdict,
        honestVerdict: result.honestVerdict,
        codes,
        errors: result.errors,
      },
      ok ? 0 : 1,
    );
  }

  if (positionals.length === 1) {
    const result = evaluateFile(positionals[0]);
    return write(result, result.ok ? 0 : 1);
  }

  const results = positionals.map((filePath) => evaluateFile(filePath));
  const failed = results.filter((item) => !item.ok);
  return write(
    {
      ok: failed.length === 0,
      passed: results.length - failed.length,
      failed: failed.length,
      total: results.length,
      results: results.map((item) => ({
        file: item.filePath,
        ok: item.ok,
        path: item.path ?? null,
        codes: codesFrom(item),
      })),
    },
    failed.length === 0 ? 0 : 1,
  );
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  process.exit(runCli());
}
