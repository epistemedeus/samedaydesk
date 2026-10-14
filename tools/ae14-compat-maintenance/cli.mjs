#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runMaintenanceOccurrence } from "./src/occurrence.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

if (args.includes("--help") || args.length === 0 || args[0] !== "run") {
  process.stdout.write(`${usage()}\n`);
  process.exit(args.includes("--help") ? 0 : 2);
}

const requestPath = flag(args, "--request");
if (!requestPath) fail("run requires --request");
let request;
try {
  request = JSON.parse(readFileSync(requestPath, "utf8"));
} catch {
  fail("cannot read --request as JSON");
}
if (request.priorPath) request.priorPath = absolute(request.priorPath);
if (request.currentFixturePath) request.currentFixturePath = absolute(request.currentFixturePath);
if (args.includes("--opt-in")) request.optIn = true;
const out = flag(args, "--out");
if (out && request.optIn !== true) fail("refusing to write without --opt-in");

const result = await runMaintenanceOccurrence(request);
if (out) {
  if (!result.reuse?.observation) fail("opt-in did not produce an observation");
  writeFileSync(out, `${JSON.stringify(result.reuse.observation, null, 2)}\n`);
}
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exit(result.ok ? 0 : 1);

function absolute(path) {
  return isAbsolute(path) ? path : resolve(here, path);
}

function flag(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return null;
  return argv[index + 1] ?? null;
}

function fail(message) {
  process.stderr.write(`${JSON.stringify({ ok: false, message })}\n`);
  process.exit(1);
}

function usage() {
  return `One finite compatibility-maintenance occurrence.

node tools/ae14-compat-maintenance/cli.mjs run --request <request.json>
node tools/ae14-compat-maintenance/cli.mjs run --request <request.json> --opt-in --out <observation.json>

No timer, scheduler, queue, subscription, or supplier 228200 rerun. HTTP transport status is not useful work.`;
}
