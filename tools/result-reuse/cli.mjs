#!/usr/bin/env node
import { closeSync, fstatSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { decideOrReuse, exportReuse, previewReuse } from "./src/export.mjs";
import { INPUT_MAX_BYTES } from "./src/limits.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.command) {
  process.stdout.write(`${usage()}\n`);
  process.exit(args.help ? 0 : 2);
}

let input;
try {
  input = readBoundedJson(args.input);
} catch {
  fail("cannot read --input as bounded JSON");
}

const options = {
  select: args.select,
  taskId: args.taskId,
  subject: args.subject,
  sequence: args.sequence,
  clock: args.clock,
  ownerScope: args.ownerScope,
  recordClass: args.recordClass,
  correctsSequence: args.correctsSequence,
  note: args.note,
  optIn: args.optIn,
  optInWithdrawn: args.optInWithdrawn,
  horizonHours: args.horizonHours,
};

let decision;
if (args.command === "decide-or-reuse") {
  try {
    decision = readBoundedJson(args.decision);
  } catch {
    fail("cannot read --decision as bounded JSON");
  }
}

const result = args.command === "export"
  ? exportReuse(input, options)
  : args.command === "decide-or-reuse"
    ? decideOrReuse(decision, input, options)
    : previewReuse(input, options);
if (!result.ok) {
  if (args.command === "decide-or-reuse") {
    process.stderr.write(`${JSON.stringify(result)}\n`);
    process.exit(1);
  }
  fail(result.message);
}
if (args.command === "export") {
  try {
    writeFileSync(args.out, `${JSON.stringify(result.observation, null, 2)}\n`);
  } catch {
    fail("cannot write --out");
  }
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

function fail(message) {
  process.stderr.write(`${JSON.stringify({ ok: false, message })}\n`);
  process.exit(1);
}

function usage() {
  return `Opt-in reuse of an already produced SameDayDesk result.
Purchasing never requires publishing. Preview is the default. Writing requires --opt-in.
A schema-valid export is user-selected unverified evidence, never automatic public-safe certification.

node tools/result-reuse/cli.mjs preview --input <result.json> --task-id <id> --subject <id> --sequence <n> --clock <ISO-UTC> [--select title,description]
node tools/result-reuse/cli.mjs export --input <result.json> --task-id <id> --subject <id> --sequence <n> --clock <ISO-UTC> --opt-in --out <observation.json>
node tools/result-reuse/cli.mjs decide-or-reuse --decision <observation.json> --input <result.json> --task-id <id> --subject <id> --sequence <n> --clock <ISO-UTC> --horizon <hours> --opt-in

decide-or-reuse keys a saved observation on the digest of its public inputs.
It returns a reuse verdict (decision, input digest, source URI, revision, clock)
or a recompute verdict with its reason. A private field is rejected.
Does not fetch, pay, contact the merchant, or write a new store.
Default outputs of page-change and record stay intact.`;
}

function parseArgs(argv) {
  const out = { command: argv[0], select: [] };
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--opt-in") out.optIn = true;
    else if (arg === "--withdraw-opt-in") out.optInWithdrawn = true;
    else if (arg === "--input") out.input = optionValue(argv, ++i);
    else if (arg === "--out") out.out = optionValue(argv, ++i);
    else if (arg === "--select") out.select = optionValue(argv, ++i).split(",").map((item) => item.trim()).filter(Boolean);
    else if (arg === "--task-id") out.taskId = optionValue(argv, ++i);
    else if (arg === "--subject") out.subject = optionValue(argv, ++i);
    else if (arg === "--sequence") out.sequence = positiveInteger(optionValue(argv, ++i));
    else if (arg === "--clock") out.clock = optionValue(argv, ++i);
    else if (arg === "--owner-scope") out.ownerScope = optionValue(argv, ++i);
    else if (arg === "--class") out.recordClass = optionValue(argv, ++i);
    else if (arg === "--corrects-sequence") out.correctsSequence = positiveInteger(optionValue(argv, ++i));
    else if (arg === "--note") out.note = optionValue(argv, ++i);
    else if (arg === "--decision") out.decision = optionValue(argv, ++i);
    else if (arg === "--horizon") out.horizonHours = horizonHours(optionValue(argv, ++i));
    else fail("unknown option");
  }
  if (out.optIn && out.optInWithdrawn) fail("opt-in and withdrawal conflict");
  if (out.command === "export" && !out.out) fail("export requires --out");
  if (out.command === "decide-or-reuse" && !out.decision && !out.help) fail("decide-or-reuse requires --decision");
  if (
    out.command
    && out.command !== "preview"
    && out.command !== "export"
    && out.command !== "decide-or-reuse"
    && !out.help
  ) {
    fail("command must be preview, export, or decide-or-reuse");
  }
  if (out.command && !out.input && !out.help) fail("requires --input");
  return out;
}

function optionValue(argv, index) {
  const value = argv[index];
  if (value == null || value.startsWith("--")) fail("option requires a value");
  return value;
}

function positiveInteger(value) {
  if (!/^\d+$/.test(value)) fail("sequence options require positive integers");
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) fail("sequence options require positive integers");
  return number;
}

function horizonHours(value) {
  if (!/^\d+(?:\.\d+)?$/.test(value)) fail("horizon requires a non-negative number of hours");
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) fail("horizon requires a non-negative number of hours");
  return number;
}

function readBoundedJson(path) {
  const descriptor = openSync(path, "r");
  try {
    if (fstatSync(descriptor).size > INPUT_MAX_BYTES) throw new Error("oversized");
    return JSON.parse(readFileSync(descriptor, "utf8"));
  } finally {
    closeSync(descriptor);
  }
}
