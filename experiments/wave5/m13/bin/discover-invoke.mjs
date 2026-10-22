#!/usr/bin/env node
/**
 * Fresh consumer: discover SameDayDesk from existing registries by stable
 * identity, then invoke the current PR52 paid-useful-jobs CLI.
 * Live MCP/x402 settle is out of scope.
 */
import { resolve } from "node:path";
import { discoverCurrent, discoverThenInvoke, DEFAULT_JOB_ID } from "../src/index.mjs";

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i += 1;
      }
    } else out._.push(a);
  }
  return out;
}

function usage() {
  return `w5-m13 discover-invoke — discover then invoke the current SameDayDesk service

Commands:
  discover
  journey --job-id <id> [--before file] [--after file] [--used file] [--input file]
          [--next-run file] [--input-root dir] [--out-dir dir] [--example]
          [--funding unfunded|reserved-fixture] [--payment file.json]

Examples:
  node experiments/wave5/m13/bin/discover-invoke.mjs discover
  node experiments/wave5/m13/bin/discover-invoke.mjs journey --job-id vendor-budget-impact \\
    --before server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/before.json \\
    --after server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/after.json \\
    --out-dir /tmp/w5-m13-vendor-budget

Selects jobs by catalog id, MCP by server name + isLatest, live ops by operationId.
Does not treat catalog array index 0 as identity. Does not live-settle.
`;
}

function collectInputs(args) {
  const inputs = {};
  for (const key of ["before", "after", "used", "input", "next-run", "input-root"]) {
    if (args[key]) inputs[key] = resolve(String(args[key]));
  }
  return inputs;
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] || "help";

if (cmd === "help" || cmd === "--help" || cmd === "-h") {
  process.stdout.write(usage());
  process.exit(0);
}

if (cmd === "discover") {
  const { discovery } = await discoverCurrent({ jobId: args["job-id"] || DEFAULT_JOB_ID });
  process.stdout.write(`${JSON.stringify(discovery, null, 2)}\n`);
  process.exit(0);
}

if (cmd !== "journey" && cmd !== "invoke") {
  process.stderr.write(`unknown command ${cmd}\n`);
  process.stdout.write(usage());
  process.exit(2);
}

const jobId = args["job-id"] || args._[1] || DEFAULT_JOB_ID;
const result = await discoverThenInvoke({
  jobId,
  inputs: collectInputs(args),
  outDir: args["out-dir"] ? resolve(String(args["out-dir"])) : undefined,
  funding: args.funding,
  payment: args.payment ? resolve(String(args.payment)) : undefined,
  example: args.example === true,
});

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (result.failureClass === "transport") process.exit(3);
process.exit(result.ok ? 0 : 2);
