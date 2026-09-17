import { parseArgs } from "node:util";
import { SEEDED_FAILURE } from "./constants.mjs";
import {
  evaluateSeededFailure,
  refusedFlag,
  runCold,
  runSuite,
  validateFile,
} from "./lib.mjs";

const HELP = `SameDayDesk receipt-forge reject pack (w903).

Cold-pins committed unpaid SDS extract/settlement artifacts, then
verifies unpaid receipts by canonical SHA-256 digest.
A forged digest, copied settlement, fabricated tx, replayed receipt,
or payment header is rejected. Does not pay, checkout, publish, or go live.

Usage:
  node packs/verifiers/w903-receipt-forge/bin/receipt-forge.mjs --cold
  node packs/verifiers/w903-receipt-forge/bin/receipt-forge.mjs --suite
  node packs/verifiers/w903-receipt-forge/bin/receipt-forge.mjs --seeded-failure forged-digest
  node packs/verifiers/w903-receipt-forge/bin/receipt-forge.mjs --expect-reject receipt_forged <file.json>
  node packs/verifiers/w903-receipt-forge/bin/receipt-forge.mjs <file.json> [file.json...]

--cold             pin committed SDS artifacts, accept valid fixtures, reject seeded forges
--suite            fixture suite only (no committed pin)
--seeded-failure   require the designated forged-digest seed to be caught
--expect-reject    require the named error code on a single file
--pretty           indent JSON

--live/--pay/--checkout/--publish/--registry/--refresh/--settle/--neo/--payment are refused.
`;

function writeJson(value, pretty) {
  return `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`;
}

export function runCli(argv = process.argv.slice(2), io = process) {
  const refused = refusedFlag(argv);
  if (refused) {
    io.stdout.write(
      writeJson({
        ok: false,
        error: {
          code: "REFUSED",
          message: `${refused} is refused. This pack is offline unpaid receipt-forge verification only.`,
        },
      }),
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
        suite: { type: "boolean", default: false },
        cold: { type: "boolean", default: false },
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

  if (values.cold) {
    if (positionals.length > 0 || values["expect-reject"] || values["seeded-failure"] || values.suite) {
      io.stderr.write("--cold does not take files, --suite, --expect-reject, or --seeded-failure.\n");
      return 2;
    }
    const report = runCold();
    return write(
      {
        ok: report.ok,
        command: "cold",
        passed: report.passed,
        failed: report.failed,
        total: report.total,
        live: false,
        paymentSent: false,
        pin: {
          ok: report.pin.ok,
          extractAmount: report.pin.extractAmount,
          payTo: report.pin.payTo,
          settlementTransaction: report.pin.settlementTransaction,
          boundRoute: report.pin.boundRoute,
          files: report.pin.files,
          errors: report.pin.errors,
        },
        results: report.results.map((item) => ({
          file: item.filePath,
          expect: item.expect,
          expectedCode: item.expectedCode ?? null,
          ok: item.ok,
          codes: item.codes ?? item.errors.map((err) => err.code),
        })),
      },
      report.ok ? 0 : 1,
    );
  }

  if (values.suite) {
    if (positionals.length > 0 || values["expect-reject"] || values["seeded-failure"]) {
      io.stderr.write("--suite does not take files, --expect-reject, or --seeded-failure.\n");
      return 2;
    }
    const report = runSuite();
    return write(
      {
        ok: report.ok,
        command: "suite",
        passed: report.passed,
        failed: report.failed,
        total: report.total,
        live: false,
        paymentSent: false,
        results: report.results.map((item) => ({
          file: item.filePath,
          expect: item.expect,
          expectedCode: item.expectedCode ?? null,
          ok: item.ok,
          codes: item.codes ?? item.errors.map((err) => err.code),
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
            message: "--seeded-failure must be forged-digest",
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
        ok: seed.ok,
        command: "seeded-failure",
        seed: SEEDED_FAILURE,
        rejected: seed.caught === true,
        code: seed.caught ? "receipt_forged" : seed.error?.code ?? null,
        error: seed.error,
        result: {
          file: seed.filePath ?? null,
          claimId: seed.result?.claimId ?? null,
          receiptId: seed.result?.receiptId ?? null,
          statusClass: seed.result?.statusClass ?? null,
          naiveVerdict: seed.result?.naiveVerdict ?? null,
          honestVerdict: seed.result?.honestVerdict ?? null,
          claimedDigest: seed.result?.claimedDigest ?? null,
          actualDigest: seed.result?.actualDigest ?? null,
          codes: seed.result?.codes ?? [],
          errors: seed.result?.errors ?? [],
          caught: seed.caught,
        },
      },
      seed.caught ? 0 : 1,
    );
  }

  if (positionals.length === 0) {
    io.stderr.write("Pass --cold, --suite, --seeded-failure forged-digest, --help, or one or more JSON files.\n");
    return 2;
  }

  const expectedCode = values["expect-reject"];
  if (expectedCode && positionals.length !== 1) {
    io.stderr.write("--expect-reject requires exactly one file.\n");
    return 2;
  }

  const results = positionals.map((filePath) => validateFile(filePath));
  if (expectedCode) {
    const result = results[0];
    const codes = result.errors.map((item) => item.code);
    const ok = !result.ok && codes.includes(expectedCode);
    return write(
      {
        ok,
        expectReject: expectedCode,
        file: result.filePath,
        claimId: result.claimId,
        receiptId: result.receiptId,
        statusClass: result.statusClass,
        naiveVerdict: result.naiveVerdict,
        honestVerdict: result.honestVerdict,
        claimedDigest: result.claimedDigest,
        actualDigest: result.actualDigest,
        codes,
        errors: result.errors,
      },
      ok ? 0 : 1,
    );
  }

  const failed = results.filter((item) => !item.ok);
  return write(
    {
      ok: failed.length === 0,
      passed: results.length - failed.length,
      failed: failed.length,
      total: results.length,
      live: false,
      paymentSent: false,
      results: results.map((item) => ({
        file: item.filePath,
        ok: item.ok,
        claimId: item.claimId,
        receiptId: item.receiptId,
        statusClass: item.statusClass,
        naiveVerdict: item.naiveVerdict,
        honestVerdict: item.honestVerdict,
        claimedDigest: item.claimedDigest,
        actualDigest: item.actualDigest,
        codes: item.errors.map((err) => err.code),
        errors: item.errors,
      })),
    },
    failed.length === 0 ? 0 : 1,
  );
}
