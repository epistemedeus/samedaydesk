#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  EXIT,
  SEEDS,
  evaluateFile,
  packFixtureDir,
  resolveCasePath,
  runSuite,
} from "./lib.mjs";

export function usage() {
  return `Proposed $5 output-contract evaluation. Offline. Settlement is preserved when output is invalid.

Usage:
  node tools/output-contract-evaluation/cli.mjs evaluate --case <file.json>
  node tools/output-contract-evaluation/cli.mjs evaluate --case packs/output-contract-evaluation/fixtures/invalid-output-settlement-preserved.json --pretty
  node tools/output-contract-evaluation/cli.mjs evaluate --seed void-settlement --expect-reject void_settlement_on_invalid_refused --pretty
  node tools/output-contract-evaluation/cli.mjs --suite
  node tools/output-contract-evaluation/cli.mjs --help

Does not pay, publish, change SKUs, or mutate checkout, registry, or settlement.
`;
}

export function parseArgs(argv) {
  const out = {
    command: null,
    casePath: null,
    seed: null,
    expectReject: null,
    suite: false,
    pretty: false,
    help: false,
  };
  const rest = [...argv];
  if (rest[0] === "evaluate") {
    out.command = "evaluate";
    rest.shift();
  }
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--pretty") out.pretty = true;
    else if (arg === "--suite") out.suite = true;
    else if (arg === "--case") {
      const value = rest[++i];
      if (value == null || value.startsWith("--")) throw usageError("--case requires a file");
      out.casePath = value;
      out.command = out.command || "evaluate";
    } else if (arg === "--seed") {
      const value = rest[++i];
      if (value == null || value.startsWith("--")) throw usageError("--seed requires a name");
      out.seed = value;
      out.command = out.command || "evaluate";
    } else if (arg === "--expect-reject") {
      const value = rest[++i];
      if (value == null || value.startsWith("--")) throw usageError("--expect-reject requires a code");
      out.expectReject = value;
    } else if (arg === "evaluate") {
      out.command = "evaluate";
    } else {
      throw usageError(`unknown option ${arg}`);
    }
  }
  return out;
}

function usageError(message) {
  const error = new Error(message);
  error.code = "USAGE";
  return error;
}

function writeJson(value, pretty) {
  process.stdout.write(`${JSON.stringify(value, null, pretty ? 2 : 0)}\n`);
}

export function run(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (cause) {
    process.stderr.write(`${cause.message}\n${usage()}`);
    return EXIT.USAGE;
  }
  if (args.help) {
    process.stdout.write(usage());
    return EXIT.OK;
  }
  if (args.suite) {
    if (args.casePath || args.seed || args.expectReject) {
      process.stderr.write("--suite does not take --case, --seed, or --expect-reject.\n");
      return EXIT.USAGE;
    }
    const report = runSuite(packFixtureDir());
    writeJson(report, args.pretty);
    return report.ok ? EXIT.OK : EXIT.FAIL;
  }
  if (args.command !== "evaluate") {
    process.stderr.write(usage());
    return EXIT.USAGE;
  }
  const locator = args.seed || args.casePath;
  if (!locator) {
    process.stderr.write("evaluate requires --case or --seed.\n");
    return EXIT.USAGE;
  }
  if (args.seed && !SEEDS[args.seed]) {
    writeJson(
      {
        ok: false,
        error: {
          code: "unknown_seed",
          message: `unknown seed ${args.seed}`,
          known: Object.keys(SEEDS),
        },
      },
      args.pretty,
    );
    return EXIT.FAIL;
  }
  const filePath = resolveCasePath(locator);
  const result = evaluateFile(filePath);
  if (args.expectReject) {
    const codes = [
      result.error?.code,
      ...(result.errors || []).map((item) => item.code),
    ].filter(Boolean);
    const ok = result.ok === false && codes.includes(args.expectReject);
    writeJson(
      {
        ok,
        expectReject: args.expectReject,
        file: result.filePath,
        codes,
        error: result.error,
        settlementPreserved: result.settlementPreserved,
        settlementMutated: result.settlementMutated,
        paid: result.paid,
        paymentSent: result.paymentSent,
      },
      args.pretty,
    );
    return ok ? EXIT.OK : EXIT.FAIL;
  }
  writeJson(result, args.pretty);
  return result.ok ? EXIT.OK : EXIT.FAIL;
}

export function main(argv = process.argv.slice(2)) {
  const code = run(argv);
  process.exitCode = code;
  return code;
}

const isDirect =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirect) main(process.argv.slice(2));
