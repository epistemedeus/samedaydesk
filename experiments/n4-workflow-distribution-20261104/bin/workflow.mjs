#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { runJourney } from "../src/journey.mjs";
import { installState, removeState, updateState } from "../src/state.mjs";

const argv = process.argv.slice(2);
const command = argv[0];
const args = parseArgs(argv.slice(1));

if (!command || args.help) {
  process.stdout.write(`${usage()}\n`);
  process.exit(args.help ? 0 : 2);
}

if (command === "install" || command === "update" || command === "remove") {
  if (!args.state) fail(2, "--state is required");
  const result = command === "install"
    ? installState(args.state, args.clock)
    : command === "update"
      ? updateState(args.state, args.clock)
      : removeState(args.state);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 3);
}

if (command === "run") {
  if (!args.state || !args.input || !args.out) fail(2, "run requires --state, --input, and --out");
  mkdirSync(dirname(args.out), { recursive: true });
  const ran = await runJourney({ stateDir: args.state, inputPath: args.input, outDir: args.out });
  process.stdout.write(`${JSON.stringify({
    outcome: ran.result.outcome,
    reason: ran.result.reason ?? null,
    producerInvoked: ran.result.producerInvoked === true,
    transferSent: ran.result.transfer?.sent === true,
  })}\n`);
  process.exit(ran.exitCode);
}

fail(2, "command must be install, update, remove, or run");

function usage() {
  return `Harbor catalog page workflow.
One fitting case runs the owned page-change job, the direct source-change decision, the Dify table checker, and the Ghost catalog projection.
A non-fitting case returns one direct route and runs none of those.

  node experiments/n4-workflow-distribution-20261104/bin/workflow.mjs install --state <dir> --clock <ISO-UTC>
  node experiments/n4-workflow-distribution-20261104/bin/workflow.mjs update --state <dir> --clock <ISO-UTC>
  node experiments/n4-workflow-distribution-20261104/bin/workflow.mjs remove --state <dir>
  node experiments/n4-workflow-distribution-20261104/bin/workflow.mjs run --state <dir> --input <case.json> --out <dir>

Install, update, and remove affect only the state directory. They do not start Dify or Ghost.`;
}

function parseArgs(list) {
  const out = {};
  for (let index = 0; index < list.length; index += 1) {
    const arg = list[index];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--state") out.state = need(list, ++index);
    else if (arg === "--clock") out.clock = need(list, ++index);
    else if (arg === "--input") out.input = need(list, ++index);
    else if (arg === "--out") out.out = need(list, ++index);
    else fail(2, "unknown option");
  }
  return out;
}

function need(list, index) {
  const value = list[index];
  if (value == null || value.startsWith("--")) fail(2, "option requires a value");
  return value;
}

function fail(code, message) {
  process.stderr.write(`${JSON.stringify({ ok: false, message })}\n`);
  process.exit(code);
}
