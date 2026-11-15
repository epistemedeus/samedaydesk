#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { FORBIDDEN_COMMANDS } from "./src/constants.mjs";
import {
  acceptWork,
  claimWork,
  deliverWork,
  postWork,
  projectFeeWork,
  proveWork,
  recoverWork,
  releaseWork,
  selectWork,
  showWork,
} from "./src/commands.mjs";
import { handleApi } from "./src/http.mjs";
import { readBoundedJson } from "./src/json.mjs";
import { measureWholeEffort } from "./src/whole-effort.mjs";

const COMMANDS = new Map([
  ["post", postWork],
  ["claim", claimWork],
  ["select", selectWork],
  ["deliver", deliverWork],
  ["accept", acceptWork],
  ["proof", proveWork],
  ["project-fee", projectFeeWork],
  ["release", releaseWork],
  ["recover", recoverWork],
  ["show", showWork],
]);

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.command) {
  process.stdout.write(`${usage()}\n`);
  process.exit(args.help ? 0 : 2);
}
if (FORBIDDEN_COMMANDS.includes(args.command)) {
  fail("payment_command_refused");
}

if (args.command === "api") {
  const request = readRequired(args.request);
  const result = handleApi(request);
  emit(result);
}
if (args.command === "whole-effort") {
  if (!args.clock) fail("clock_required");
  const measured = measureWholeEffort({ clock: args.clock, scenario: args.scenario || "authorized", workdir: args.workdir });
  if (measured.ok && args.out) {
    writeFileSync(args.out, `${JSON.stringify(measured.comparison, null, 2)}\n`);
  }
  emit(measured.ok ? measured.comparison : measured);
}

const input = args.input ? readRequired(args.input) : {};
if (args.command === "proof" && args.optIn) input.optIn = true;
if (args.command === "show" && args.public) input.public = true;
if (args.command === "recover" || args.command === "release") {
  if (args.automatic) input.automatic = true;
  if (args.explicitRelease) input.explicitRelease = true;
  if (args.fencing) input.fencing = args.fencing;
  if (args.holder) input.holderId = args.holder;
}
const handler = COMMANDS.get(args.command);
if (!handler) fail("command_refused");
const result = handler(input, { journeyPath: args.journey, clock: args.clock });
if (result.ok && args.out) {
  const body = result.proof || result.projection || result;
  writeFileSync(args.out, `${JSON.stringify(body, null, 2)}\n`);
}
emit(result);

function readRequired(path) {
  const read = readBoundedJson(path);
  if (!read.ok) fail(read.reason, read.message);
  return read.value;
}

function emit(result) {
  const stream = result.ok ? process.stdout : process.stderr;
  stream.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}

function fail(reason, message) {
  process.stderr.write(`${JSON.stringify({ ok: false, reason, message, paymentCommand: false, signer: false, ledger: false })}\n`);
  process.exit(1);
}

function usage() {
  return `Two-sided work consumer.
Posts, claims or selects, delivers, and records substantive acceptance from the existing task-bundle-economics diagnose outcomes.
Projects the existing 5 percent gross / equal-net fee only when terms already authorize it.
Writes a reward-free reusable proof through the existing result-reuse export.
Does not pay, sign, unlock a retained lock automatically, or open a second ledger.

node tools/two-sided-work-consumer/cli.mjs post --journey <file> --input <post.json> --clock <ISO-UTC>
node tools/two-sided-work-consumer/cli.mjs claim --journey <file> --input <claim.json> --clock <ISO-UTC>
node tools/two-sided-work-consumer/cli.mjs select --journey <file> --input <selection.json> --clock <ISO-UTC>
node tools/two-sided-work-consumer/cli.mjs deliver --journey <file> --input <delivery.json> --clock <ISO-UTC>
node tools/two-sided-work-consumer/cli.mjs accept --journey <file> --input <acceptance.json> --clock <ISO-UTC>
node tools/two-sided-work-consumer/cli.mjs proof --journey <file> --input <proof.json> --clock <ISO-UTC> --opt-in --out <public.json>
node tools/two-sided-work-consumer/cli.mjs project-fee --journey <file> --input <fee.json> --clock <ISO-UTC>
node tools/two-sided-work-consumer/cli.mjs release --journey <file> --holder <id> --fencing <token> --clock <ISO-UTC>
node tools/two-sided-work-consumer/cli.mjs recover --journey <file> --clock <ISO-UTC> [--automatic | --explicit-release --holder <id> --fencing <token>]
node tools/two-sided-work-consumer/cli.mjs show --journey <file> [--public]
node tools/two-sided-work-consumer/cli.mjs api --request <request.json>
node tools/two-sided-work-consumer/cli.mjs whole-effort --clock <ISO-UTC> [--scenario authorized|unknown|unauthorized] [--out <receipt.json>]`;
}

function parseArgs(argv) {
  const out = {};
  if (argv[0] && !argv[0].startsWith("-")) {
    out.command = argv[0];
  }
  for (let i = out.command ? 1 : 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--opt-in") out.optIn = true;
    else if (arg === "--public") out.public = true;
    else if (arg === "--automatic") out.automatic = true;
    else if (arg === "--explicit-release") out.explicitRelease = true;
    else if (arg === "--journey") out.journey = optionValue(argv, ++i);
    else if (arg === "--input") out.input = optionValue(argv, ++i);
    else if (arg === "--clock") out.clock = optionValue(argv, ++i);
    else if (arg === "--out") out.out = optionValue(argv, ++i);
    else if (arg === "--request") out.request = optionValue(argv, ++i);
    else if (arg === "--fencing") out.fencing = optionValue(argv, ++i);
    else if (arg === "--holder") out.holder = optionValue(argv, ++i);
    else if (arg === "--scenario") out.scenario = optionValue(argv, ++i);
    else if (arg === "--workdir") out.workdir = optionValue(argv, ++i);
    else fail("unknown_option");
  }
  return out;
}

function optionValue(argv, index) {
  const value = argv[index];
  if (value == null || value.startsWith("--")) fail("option_requires_value");
  return value;
}
