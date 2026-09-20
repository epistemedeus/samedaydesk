#!/usr/bin/env node
/**
 * Cold-run + seeded-failure CLI for SDS pulse flush-id replay-nonce fixtures.
 * Does not pay, publish, or open checkout.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { runColdCohort } from "./src/cohort.mjs";
import { listSeededFailures, runSeededFailure } from "./src/seeded.mjs";

const PACK = dirname(fileURLToPath(import.meta.url));

const FORBIDDEN = new Set([
  "--pay",
  "--payment",
  "--checkout",
  "--publish",
  "--registry",
  "--live",
]);

function forbiddenFlag(arg) {
  if (typeof arg !== "string" || !arg.startsWith("-")) return false;
  const name = arg.toLowerCase().split("=")[0];
  return FORBIDDEN.has(name);
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(argv) {
  const flags = Object.assign(Object.create(null), { help: false, seeded: null, listSeeded: false });
  let command = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (forbiddenFlag(arg)) {
      throw Object.assign(new Error(`forbidden flag: ${arg}`), { code: "payment-forbidden" });
    }
    if (arg === "--help" || arg === "-h") flags.help = true;
    else if (arg === "--seeded-failure") {
      const value = argv[i + 1];
      if (!value || value.startsWith("-")) flags.listSeeded = true;
      else {
        flags.seeded = value;
        i += 1;
      }
    } else if (arg === "--list-seeded-failures") {
      flags.listSeeded = true;
    } else if (!arg.startsWith("-") && !command) {
      command = arg;
    } else {
      throw new Error(`unknown option ${arg}; run --help`);
    }
  }
  return { command: command || "cold", flags };
}

const HELP = `sds-regression-replay-nonce — pulse flush-id replay-nonce fixtures

Usage:
  node tests/regression-sds/replay-nonce/run.mjs
  node tests/regression-sds/replay-nonce/run.mjs cold
  node tests/regression-sds/replay-nonce/run.mjs --seeded-failure replay-as-fresh-apply
  node tests/regression-sds/replay-nonce/run.mjs --seeded-failure list
  node tests/regression-sds/replay-nonce/run.mjs test

Cold run loads fixtures/ against published pulse_apply_delta nonce
receipts, WAL UUID gates, and file-fallback enqueue.
Seeded failures must be rejected (exit 0 = refusal fired).
Does not pay, publish, or open Stripe.
`;

export async function runCli(argv, { stdout = process.stdout } = {}) {
  const { command, flags } = parseArgs(argv);
  if (flags.help) {
    stdout.write(HELP);
    return 0;
  }
  if (command === "test") {
    const result = spawnSync(
      process.execPath,
      ["--test", "--test-concurrency=1", join(PACK, "test")],
      { stdio: "inherit", cwd: PACK },
    );
    return result.status ?? 1;
  }
  if (flags.listSeeded || flags.seeded === "list") {
    writeJson({
      schema: "sds.regression.replay-nonce.v1",
      mode: "seeded-failure-list",
      ids: listSeededFailures(),
    });
    return 0;
  }
  if (flags.seeded) {
    const result = await runSeededFailure(flags.seeded);
    writeJson(result);
    return result.ok ? 0 : 1;
  }
  if (command !== "cold") {
    throw new Error(`unknown command ${command}; run --help`);
  }
  const result = await runColdCohort();
  writeJson(result);
  return result.ok ? 0 : 1;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runCli(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`${JSON.stringify({ error: { code: error.code || "cli", message: error.message } })}\n`);
      process.exitCode = error.code === "payment-forbidden" ? 2 : 1;
    },
  );
}
