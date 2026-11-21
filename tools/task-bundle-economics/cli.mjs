#!/usr/bin/env node
import { closeSync, fstatSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { compareFor, diagnoseFor, evaluateBundle, receiptFor } from "./src/evaluate.mjs";
import { INPUT_MAX_BYTES } from "./src/limits.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.command) {
  process.stdout.write(`${usage()}\n`);
  process.exit(args.help ? 0 : 2);
}

let input;
let inputPath;
try {
  inputPath = resolve(args.input);
  input = readBoundedJson(inputPath);
} catch {
  fail("cannot read --input as bounded JSON");
}

const result = args.command === "evaluate"
  ? evaluateBundle(input)
  : args.command === "receipt"
    ? receiptFor(input)
    : args.command === "compare"
      ? compareFor(input)
      : diagnoseFor(input, { baseDir: dirname(inputPath) });

if (!result.ok) {
  process.stderr.write(`${JSON.stringify(result)}\n`);
  process.exit(1);
}

if (args.out) {
  try {
    writeFileSync(args.out, `${JSON.stringify(result, null, 2)}\n`);
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
  return `Signer-free task bundle economics readout.
Reads a bounded JSON bundle and prints grouping, existing 5 percent fee terms, effort comparison, and reviewer-exception decisions.
Does not pay, sign, reserve funds, commission work, or execute verifier payloads.

node tools/task-bundle-economics/cli.mjs evaluate --input <bundle.json>
node tools/task-bundle-economics/cli.mjs receipt --input <bundle.json> [--out <receipt.json>]
node tools/task-bundle-economics/cli.mjs compare --input <bundle.json>
node tools/task-bundle-economics/cli.mjs diagnose --input <bundle.json> [--out <diagnosis.json>]

evaluate prints the full decision. receipt writes a portable requester receipt. compare focuses on measured versus unknown effort and fee totals. diagnose prints an evidence-only structured diagnosis. When delivery.artifactPath is set, diagnose reads that bounded artifact file relative to the input JSON directory.`;
}

function parseArgs(argv) {
  const out = {};
  let i = 0;
  if (argv[0] && !argv[0].startsWith("-")) {
    out.command = argv[0];
    i = 1;
  }
  for (; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--input") out.input = optionValue(argv, ++i);
    else if (arg === "--out") out.out = optionValue(argv, ++i);
    else fail("unknown option");
  }
  if (
    out.command
    && out.command !== "evaluate"
    && out.command !== "receipt"
    && out.command !== "compare"
    && out.command !== "diagnose"
    && !out.help
  ) {
    fail("command must be evaluate, receipt, compare, or diagnose");
  }
  if (out.command && !out.input && !out.help) fail("requires --input");
  return out;
}

function optionValue(argv, index) {
  const value = argv[index];
  if (value == null || value.startsWith("--")) fail("option requires a value");
  return value;
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
