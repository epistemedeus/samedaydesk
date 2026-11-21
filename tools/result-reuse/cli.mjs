#!/usr/bin/env node
import { closeSync, fstatSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { bindUsefulDecision, decideOrReuse, exportReuse, previewReuse } from "./src/export.mjs";
import { INPUT_MAX_BYTES } from "./src/limits.mjs";
import { exportPortableDecision, importPortableDecision, retirePortableDecision } from "./src/portable.mjs";
import { residualNeed } from "./src/residual.mjs";

const PORTABLE_COMMANDS = new Set(["export-decision", "import-decision", "retire-decision"]);

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
  want: args.want,
  acceptance: args.acceptance,
};

if (PORTABLE_COMMANDS.has(args.command)) runPortable(args, input);

let decision;
if ((args.command === "decide-or-reuse" || args.command === "residual") && args.decision) {
  try {
    decision = readBoundedJson(args.decision);
  } catch {
    fail("cannot read --decision as bounded JSON");
  }
}
let produced;
if (args.command === "decide-or-reuse" && args.produced) {
  try {
    produced = readBoundedJson(args.produced);
  } catch {
    fail("cannot read --produced as bounded JSON");
  }
}

const result = args.command === "export"
  ? exportReuse(input, options)
  : args.command === "residual"
    ? residualNeed(decision, input, options)
    : args.command === "decide-or-reuse"
      ? (produced
        ? bindUsefulDecision(input, produced, options)
        : decideOrReuse(decision, input, options))
      : previewReuse(input, options);
if (!result.ok) {
  if (args.command === "decide-or-reuse" || args.command === "residual") {
    process.stderr.write(`${JSON.stringify(result)}\n`);
    process.exit(1);
  }
  fail(result.message);
}
if (args.command === "export" || (args.command === "decide-or-reuse" && args.produced)) {
  try {
    writeFileSync(args.out, `${JSON.stringify(result.observation, null, 2)}\n`);
  } catch {
    fail("cannot write --out");
  }
}
if (args.command === "decide-or-reuse" && args.produced) {
  const receipt = { ...result };
  delete receipt.observation;
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
} else {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function runPortable(args, input) {
  let result;
  if (args.command === "export-decision") {
    let saved;
    try {
      saved = readBoundedJson(args.decision);
    } catch {
      fail("cannot read --decision as bounded JSON");
    }
    result = exportPortableDecision(saved, input, {
      optIn: args.optIn === true,
      createdAt: args.createdAt,
      staleAfter: args.staleAfter,
    });
  } else if (args.command === "retire-decision") {
    result = retirePortableDecision(input, { retiredAt: args.retiredAt, reason: args.reason, state: args.state });
  } else {
    let portable;
    try {
      portable = readBoundedJson(args.portable);
    } catch {
      fail("cannot read --portable as bounded JSON");
    }
    result = importPortableDecision(portable, input, { clock: args.clock });
  }
  if (!result.ok) {
    process.stderr.write(`${JSON.stringify(result)}\n`);
    process.exit(1);
  }
  if (result.portable) {
    try {
      writeFileSync(args.out, `${JSON.stringify(result.portable, null, 2)}\n`);
    } catch {
      fail("cannot write --out");
    }
    process.stdout.write(`${JSON.stringify({ ok: true, mode: result.mode, producerInvoked: false, key: result.portable.key, lifecycle: result.portable.lifecycle, integrity: result.portable.integrity }, null, 2)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
  process.exit(0);
}

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
node tools/result-reuse/cli.mjs decide-or-reuse --input <before-work.json> --produced <decision.json> --out <observation.json> --task-id <id> --subject <id> --sequence <n> --clock <ISO-UTC> --horizon <hours> --opt-in
node tools/result-reuse/cli.mjs decide-or-reuse --input <before-work.json> --decision <observation.json> --task-id <id> --subject <id> --sequence <n> --clock <ISO-UTC> --horizon <hours> --opt-in

node tools/result-reuse/cli.mjs export-decision --input <before-work.json> --decision <observation.json> --created-at <ISO-UTC> [--stale-after <ISO-UTC>] --opt-in --out <portable.json>
node tools/result-reuse/cli.mjs import-decision --input <before-work.json> --portable <portable.json> [--clock <ISO-UTC>]
node tools/result-reuse/cli.mjs retire-decision --input <portable.json> --retired-at <ISO-UTC> --reason <text> [--state retired|stale] --out <portable.json>

decide-or-reuse binds a useful source-change-alert or verification-reconcile decision to the public manifest that exists before that producer runs.
Both recipes can read the same saved capture and prior. Each decision is bound and reused separately; any other recipe is refused.
A hit returns that saved decision and its provenance. It does not run the producer.
A changed or missing binding returns recompute-required and does not invent a fresh answer.
Naming --producer does not execute it.
export-decision writes an opt-in CC0 portable decision keyed by recipe, capture digest, prior digest and field list, not by task or subject.
It carries no local paths and no producer state. import-decision reuses it only on an exact key match and an active lifecycle;
any mismatch, retirement or staleness returns recompute. import-decision never runs or names a producer.
The useful body is digested at bind. Reuse, residual and portable export verify that digest before they return the stored body.
A missing legacy digest stays uncertified. A changed outcome or evidence is integrity_mismatch and does not run a producer.
The digest is corruption detection, not a signature: rewriting both the body and the stored digest is not detected.
node tools/result-reuse/cli.mjs residual --input <before-work.json> --decision <observation.json> --want <field,...> [--acceptance <text>] --task-id <id> --subject <id> --sequence <n> --clock <ISO-UTC> --horizon <hours> --opt-in

residual starts from a decide-or-reuse hit. source-change-alert splits wanted fields: answered fields stay direct,
fields the saved capture holds are a direct rerun, and only fields absent from that capture become an unsent unfunded residual need.
verification-reconcile does not project named content fields. Any other recipe stays recompute. It posts nothing.
An exported result observation is legacy input and is not upgraded.
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
    else if (arg === "--produced") out.produced = optionValue(argv, ++i);
    else if (arg === "--producer") out.producer = optionValue(argv, ++i);
    else if (arg === "--portable") out.portable = optionValue(argv, ++i);
    else if (arg === "--created-at") out.createdAt = optionValue(argv, ++i);
    else if (arg === "--stale-after") out.staleAfter = optionValue(argv, ++i);
    else if (arg === "--retired-at") out.retiredAt = optionValue(argv, ++i);
    else if (arg === "--reason") out.reason = optionValue(argv, ++i);
    else if (arg === "--state") out.state = optionValue(argv, ++i);
    else if (arg === "--horizon") out.horizonHours = horizonHours(optionValue(argv, ++i));
    else if (arg === "--want") out.want = optionValue(argv, ++i).split(",").map((item) => item.trim()).filter(Boolean);
    else if (arg === "--acceptance") out.acceptance = optionValue(argv, ++i);
    else fail("unknown option");
  }
  if (out.optIn && out.optInWithdrawn) fail("opt-in and withdrawal conflict");
  if (out.command === "export" && !out.out) fail("export requires --out");
  if (out.portable && out.command !== "import-decision") fail("--portable is only valid for import-decision");
  if (out.produced && out.command !== "decide-or-reuse") fail("--produced is only valid for decide-or-reuse");
  if (out.producer && out.command !== "decide-or-reuse" && !PORTABLE_COMMANDS.has(out.command)) fail("--producer is only valid for decide-or-reuse");
  if (out.command === "decide-or-reuse" && out.produced && out.decision) fail("decide-or-reuse accepts either --decision or --produced");
  if (out.command === "decide-or-reuse" && !out.decision && !out.produced && !out.help) {
    fail("decide-or-reuse requires --decision or --produced");
  }
  if (out.produced && !out.out) fail("binding a decision requires --out");
  if ((out.want || out.acceptance) && out.command !== "residual") fail("--want and --acceptance are only valid for residual");
  if (out.command === "residual" && (out.produced || !out.decision) && !out.help) fail("residual requires --decision and does not accept --produced");
  if (PORTABLE_COMMANDS.has(out.command) && !out.help) {
    if (out.producer) fail("portable commands never run a producer; --producer is refused");
    if (out.command === "export-decision" && (!out.decision || !out.out)) fail("export-decision requires --decision and --out");
    if (out.command === "import-decision" && !out.portable) fail("import-decision requires --portable");
    if (out.command === "retire-decision" && !out.out) fail("retire-decision requires --out");
  }
  if (
    out.command
    && out.command !== "preview"
    && out.command !== "export"
    && out.command !== "decide-or-reuse"
    && out.command !== "residual"
    && !PORTABLE_COMMANDS.has(out.command)
    && !out.help
  ) {
    fail("command must be preview, export, decide-or-reuse, residual, export-decision, import-decision, or retire-decision");
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
