#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { runMaintenanceShell } from "./src/occurrence.mjs";

const args = process.argv.slice(2);

if (args.includes("--help") || args.length === 0 || args[0] !== "run") {
  process.stdout.write(`${usage()}\n`);
  process.exit(args.includes("--help") ? 0 : 2);
}
if (args.includes("--out") || args.includes("--opt-in")) fail("this shell does not write a receipt");

const call = {
  result: load("--result"),
  readCurrent: load("--authority"),
  principal: load("--principal"),
  work: load("--work"),
  now: flag(args, "--now"),
  laterTaskId: flag(args, "--later-task"),
  asked: flag(args, "--asked") ?? "safe_derivative",
};
if (!call.now) fail("run requires --now");
if (!call.laterTaskId) fail("run requires --later-task");

const result = runMaintenanceShell(call);
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exit(result.ok ? 0 : 1);

function load(name) {
  const path = flag(args, name);
  if (!path) fail(`run requires ${name}`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail(`cannot read ${name} as JSON`);
  }
}

function flag(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return null;
  return argv[index + 1] ?? null;
}

function fail(message) {
  process.stderr.write(`${JSON.stringify({ ok: false, message })}\n`);
  process.exit(2);
}

function usage() {
  return `One finite maintenance read of a prior E11 template result.

node tools/ae20-e11-maintenance-shell/cli.mjs run \\
  --result <template-result.json> \\
  --authority <readCurrent.json> \\
  --principal <principal.json> \\
  --work <work.json> \\
  --now <iso-instant> \\
  --later-task <task-id> \\
  --asked safe_derivative

No timer, queue, supplier rerun, receipt write, or live authority call.
A session token is not a grant. Raw bytes are not inferred from safe_derivative_only.`;
}
