#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  SEEDED_FAILURES,
  codesFrom,
  probeFile,
  runSuite,
  seededFailurePath,
} from "./lib.mjs";

function usage() {
  return `SameDayDesk cross-party receipt join probe (read-only).

Joins local buyer, seller, and facilitator receipt fixtures on an exact
receipt_id, transaction_hash, or operation_id. Does not pay, checkout,
settle, fetch, publish, or write a registry.

Usage:
  node tools/commerce-receipts/join/join.mjs --input <pack.json>
  node tools/commerce-receipts/join/join.mjs --suite
  node tools/commerce-receipts/join/join.mjs --expect-reject <code> <pack.json>
  node tools/commerce-receipts/join/join.mjs --seeded-failure money-movement
  node tools/commerce-receipts/join/join.mjs --seeded-failure join-without-exact-key

Exit 0 on a join, or when --expect-reject / --seeded-failure matches.
Exit 2 on invalid input, including money movement.
Exit 1 when an expected reject is not observed.
`;
}

const PAY_FLAGS = new Set(["--pay", "--checkout", "--settle", "--transfer", "--refund", "--capture"]);

export function moneyMovementFromArgv(argv) {
  return argv.find((arg) => PAY_FLAGS.has(arg)) ?? null;
}

function writeJson(value, pretty) {
  return `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`;
}

export function runCli(argv = process.argv.slice(2)) {
  const payFlag = moneyMovementFromArgv(argv);
  if (payFlag) {
    process.stdout.write(
      writeJson(
        {
          ok: false,
          decision: "invalid-input",
          reasons: ["money_movement_refused"],
          errors: [
            {
              code: "money_movement_refused",
              path: payFlag,
              message: "join probe refuses payment, checkout, and settlement",
            },
          ],
          moneyMovement: false,
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
        input: { type: "string" },
        out: { type: "string" },
        "expect-reject": { type: "string" },
        "seeded-failure": { type: "string" },
      },
    }));
  } catch (cause) {
    process.stderr.write(`${cause.message}\n`);
    process.stderr.write(usage());
    return 2;
  }

  if (values.help || argv.length === 0) {
    process.stdout.write(usage());
    return argv.length === 0 ? 2 : 0;
  }

  const pretty = values.pretty === true;
  const emit = (value, code) => {
    const json = writeJson(value, pretty);
    if (values.out) {
      mkdirSync(dirname(values.out), { recursive: true });
      writeFileSync(values.out, json, "utf8");
    }
    process.stdout.write(json);
    return code;
  };

  if (values.suite) {
    if (positionals.length > 0 || values.input || values["expect-reject"] || values["seeded-failure"]) {
      process.stderr.write("--suite does not take files, --input, --expect-reject, or --seeded-failure.\n");
      return 2;
    }
    const report = runSuite();
    return emit(
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
          codes: item.codes,
        })),
      },
      report.ok ? 0 : 1,
    );
  }

  if (values["seeded-failure"]) {
    const id = values["seeded-failure"];
    const spec = SEEDED_FAILURES[id];
    const filePath = seededFailurePath(id);
    if (!spec || !filePath) {
      process.stderr.write(`unknown seeded failure: ${id}\n`);
      return 2;
    }
    const result = probeFile(filePath);
    const codes = codesFrom(result);
    const caught = !result.ok && codes.includes(spec.code);
    if (!caught) {
      return emit(
        {
          ok: false,
          error: {
            code: "SEED_ACCEPT",
            message: `seeded ${id} was not refused`,
          },
          seededFailure: id,
          file: filePath,
          codes,
          result,
        },
        1,
      );
    }
    return emit(
      {
        ok: true,
        seededFailure: id,
        rejected: true,
        code: spec.code,
        message: spec.message,
        file: filePath,
        codes,
        decision: result.decision,
        errors: result.errors,
      },
      0,
    );
  }

  const files = [];
  if (values.input) files.push(values.input);
  for (const positional of positionals) files.push(positional);

  if (files.length === 0) {
    process.stderr.write("Pass --suite, --help, --seeded-failure, or --input <pack.json>.\n");
    process.stderr.write(usage());
    return 2;
  }

  const expectedCode = values["expect-reject"];
  if (expectedCode && files.length !== 1) {
    process.stderr.write("--expect-reject requires exactly one file.\n");
    return 2;
  }

  const results = files.map((filePath) => probeFile(filePath));
  if (expectedCode) {
    const result = results[0];
    const codes = codesFrom(result);
    const ok = !result.ok && codes.includes(expectedCode);
    return emit(
      {
        ok,
        expectReject: expectedCode,
        file: result.quotedPath,
        codes,
        errors: result.errors,
        decision: result.decision,
      },
      ok ? 0 : 1,
    );
  }

  if (results.length === 1) {
    const result = results[0];
    return emit(result, result.ok ? 0 : 2);
  }

  const failed = results.filter((item) => !item.ok);
  return emit(
    {
      ok: failed.length === 0,
      passed: results.length - failed.length,
      failed: failed.length,
      total: results.length,
      results,
    },
    failed.length === 0 ? 0 : 2,
  );
}

const isMain =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  process.exit(runCli());
}
