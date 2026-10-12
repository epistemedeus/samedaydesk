#!/usr/bin/env node
// Ordinary caller entry. Reads one regular JSON file and prints one diagnostic.
// Does not import the server, fetch a route, or execute catalog instructions.

import { readFileSync, statSync } from "node:fs";
import { diagnoseCallerContract } from "./lib/caller-readiness.mjs";
import { MAX_BYTES } from "./lib/supplied-bounds.mjs";

function emit(payload, exitCode) {
  const text = `${JSON.stringify(payload)}\n`;
  if (Buffer.byteLength(text) > MAX_BYTES) {
    const refused = `${JSON.stringify({ refused: true, code: "oversized_output", nextAction: "refused:oversized_output" })}\n`;
    process.stderr.write("refused:oversized_output\n");
    process.stdout.write(refused);
    process.exit(2);
  }
  process.stdout.write(text);
  process.exit(exitCode);
}

function refuse(code) {
  process.stderr.write(`refused:${code}\n`);
  emit({
    refused: true,
    code,
    nextAction: `refused:${code}`,
    quoteGenerated: false,
    paymentSent: false,
    repairPosted: false,
    coldStartExecuted: false,
    routeFetched: false,
    completedUserTask: false,
    faithfulInvocation: false,
    outsideAcceptance: "not_observed",
    savingsClaim: false,
    directPathRetained: true,
    cost: { state: "unknown", amount: null, currency: null },
  }, 2);
}

function parseIn(argv) {
  if (argv.length !== 2 || argv[0] !== "--in" || typeof argv[1] !== "string" || argv[1].length === 0) {
    process.stderr.write("usage: task-readiness-caller.mjs --in file.json\n");
    process.exit(2);
  }
  return argv[1];
}

const file = parseIn(process.argv.slice(2));
if (file.includes("\u0000") || /^[a-z][a-z0-9+.-]*:/i.test(file)) refuse("unsafe_source");

let stat;
try {
  stat = statSync(file);
} catch {
  refuse("unsafe_source");
}
if (!stat.isFile() || stat.isFIFO()) refuse("unsafe_source");
if (stat.size > MAX_BYTES) refuse("oversized_input");

let raw;
try {
  raw = readFileSync(file);
} catch {
  refuse("unsafe_source");
}
if (raw.length > MAX_BYTES || raw.includes(0)) refuse(raw.includes(0) ? "hostile_input" : "oversized_input");

let input;
try {
  input = JSON.parse(raw.toString("utf8"));
} catch {
  refuse("malformed_json");
}

try {
  const result = diagnoseCallerContract(input);
  emit(result, result.nextAction === "decimal_match" ? 0 : 1);
} catch (error) {
  refuse(typeof error?.code === "string" ? error.code : "caller_failed");
}
