#!/usr/bin/env node
import { closeSync, fstatSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { exportReuse, previewReuse } from "./src/export.mjs";
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
};

const result = args.command === "export" ? exportReuse(input, options) : previewReuse(input, options);
if (!result.ok) fail(result.message);
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

Does not fetch, pay, or contact the merchant. Default outputs of page-change and record stay intact.`;
}

function parseArgs(argv) {
  const out = { command: argv[0], select: [] };
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--opt-in") out.optIn = true;
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
    else fail("unknown option");
  }
  if (out.command === "export" && !out.out) fail("export requires --out");
  if (out.command && out.command !== "preview" && out.command !== "export" && !out.help) {
    fail("command must be preview or export");
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

function readBoundedJson(path) {
  const descriptor = openSync(path, "r");
  try {
    if (fstatSync(descriptor).size > INPUT_MAX_BYTES) throw new Error("oversized");
    return JSON.parse(readFileSync(descriptor, "utf8"));
  } finally {
    closeSync(descriptor);
  }
}
