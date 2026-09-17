#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  SEEDED_FAILURES,
  codesFrom,
  evaluateFile,
  evaluateSeededFailure,
  refusedFlag,
  runCold,
  runSuite,
  seededFailurePath,
} from "./lib.mjs";

const HELP = `SameDayDesk commerce-receipt HMAC rotation (offline).

Rotates fixture HMAC keys with a required overlap window. Previous kids
verify during overlap and are refused after it. Does not pay, checkout,
publish, or touch neo. Raw key bytes are never written.

Usage:
  node tools/commerce-receipts/hmac-rotate/cli.mjs --cold
  node tools/commerce-receipts/hmac-rotate/cli.mjs --suite
  node tools/commerce-receipts/hmac-rotate/cli.mjs --seeded-failure retired-key-after-overlap
  node tools/commerce-receipts/hmac-rotate/cli.mjs --seeded-failure forged-mac
  node tools/commerce-receipts/hmac-rotate/cli.mjs --expect-reject retired_key_after_overlap <file.json>
  node tools/commerce-receipts/hmac-rotate/cli.mjs --input <pack.json>

--cold             sign, rotate with overlap, dual-verify, then refuse the retired kid
--suite            accept every valid fixture and reject every invalid fixture
--seeded-failure   require the named poison pack to be caught
--expect-reject    require the named error code on a single file
--pretty           indent JSON

--pay/--checkout/--payment/--settle/--live/--neo/--publish/--registry are refused.
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
          decision: "invalid-input",
          reasons: ["money_movement_refused"],
          errors: [
            {
              code: "money_movement_refused",
              path: refused,
              message: "hmac-rotate refuses payment, checkout, neo, and publish",
            },
          ],
          moneyMovement: false,
          neo: false,
          publish: false,
          checkout: false,
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
        suite: { type: "boolean", default: false },
        cold: { type: "boolean", default: false },
        input: { type: "string" },
        out: { type: "string" },
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
    const text = writeJson(value, pretty);
    if (values.out) {
      const outPath = resolve(values.out);
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, text);
    }
    io.stdout.write(text);
    return code;
  };

  if (values.help) {
    io.stdout.write(HELP);
    return 0;
  }

  const selected = [values.cold, values.suite, Boolean(values["seeded-failure"]), Boolean(values.input)]
    .filter(Boolean)
    .length;
  if (selected > 1) {
    io.stderr.write("Use only one of --cold, --suite, --seeded-failure, or --input.\n");
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
        passed: report.passed,
        failed: report.failed,
        total: report.total,
        catalog: report.catalog,
        results: report.results.map((item) => ({
          file: item.filePath,
          expect: item.expect,
          expectedCode: item.expectedCode ?? null,
          ok: item.ok,
          codes: item.codes,
        })),
      },
      report.ok ? 0 : 1,
    );
  }

  if (values["seeded-failure"]) {
    const id = values["seeded-failure"];
    if (!SEEDED_FAILURES[id]) {
      io.stderr.write(
        `unknown seeded failure ${id}. expected ${Object.keys(SEEDED_FAILURES).join(", ")}\n`,
      );
      return 2;
    }
    const report = evaluateSeededFailure(id);
    return write(report, report.ok ? 0 : 1);
  }

  const files = [...positionals];
  if (values.input) files.unshift(values.input);
  if (files.length === 0) {
    io.stderr.write(HELP);
    return 2;
  }

  const expectedCode = values["expect-reject"];
  if (expectedCode && files.length !== 1) {
    io.stderr.write("--expect-reject requires exactly one file.\n");
    return 2;
  }

  if (expectedCode) {
    const result = evaluateFile(files[0]);
    const codes = codesFrom(result);
    const ok = result.ok === false && codes.includes(expectedCode);
    return write(
      {
        ok,
        expectReject: expectedCode,
        observed: codes,
        quotedPath: files[0],
        result,
      },
      ok ? 0 : 1,
    );
  }

  if (files.length === 1) {
    const result = evaluateFile(files[0]);
    return write(result, result.ok ? 0 : 1);
  }

  const results = files.map((filePath) => ({
    file: filePath,
    result: evaluateFile(filePath),
  }));
  const ok = results.every((item) => item.result.ok);
  return write({ ok, results }, ok ? 0 : 1);
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  process.exit(runCli());
}
