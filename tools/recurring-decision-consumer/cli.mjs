#!/usr/bin/env node
import { readBoundedJson } from "./src/io.mjs";
import { evaluateDecision } from "./src/evaluate.mjs";
import { removeState, showState, updateState } from "./src/state.mjs";
import { exportWorkflowStub } from "./src/workflow.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.command) {
  process.stdout.write(`${usage()}\n`);
  process.exit(args.help ? 0 : 2);
}

try {
  if (args.command === "evaluate") {
    const intent = readBoundedJson(args.intent);
    const capture = args.capture ? readBoundedJson(args.capture) : null;
    const prior = args.prior ? readBoundedJson(args.prior) : null;
    const previous = args.previous ? readBoundedJson(args.previous) : null;
    const reference = args.reference ? readBoundedJson(args.reference) : null;
    const result = evaluateDecision({
      intent,
      prior,
      capture,
      clock: args.clock,
      horizonHours: args.horizonHours,
      previous,
      reference,
      statePath: args.state ?? null,
    });
    if (args.state && result.ok && result.useful) {
      const saved = updateState(args.state, {
        subject: intent.subject,
        intentId: intent.intentId,
        clock: args.clock,
        retainedResult: result,
      });
      if (!saved.ok) fail(saved.message);
      result.statePath = args.state;
      result.stateSequence = saved.state.sequence;
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(result.ok ? 0 : 1);
  }

  if (args.command === "state") {
    if (!args.state) fail("state commands require --state");
    if (args.stateAction === "show") {
      const shown = showState(args.state);
      process.stdout.write(`${JSON.stringify(shown, null, 2)}\n`);
      process.exit(shown.ok ? 0 : 1);
    }
    if (args.stateAction === "remove") {
      const removed = removeState(args.state);
      process.stdout.write(`${JSON.stringify(removed, null, 2)}\n`);
      process.exit(0);
    }
    if (args.stateAction === "update") {
      if (!args.retained) fail("state update requires --retained");
      const retainedResult = readBoundedJson(args.retained);
      const saved = updateState(args.state, {
        subject: args.subject,
        intentId: args.intentId,
        clock: args.clock,
        retainedResult,
      });
      process.stdout.write(`${JSON.stringify(saved, null, 2)}\n`);
      process.exit(saved.ok ? 0 : 1);
    }
    fail("state action must be show, update, or remove");
  }

  if (args.command === "export-workflow") {
    const exported = exportWorkflowStub({
      runtime: args.runtime,
      out: args.out,
      verified: args.verified,
    });
    process.stdout.write(`${JSON.stringify(exported, null, 2)}\n`);
    process.exit(exported.ok ? 0 : 1);
  }

  fail("unknown command");
} catch (error) {
  fail(error?.message || String(error));
}

function fail(message) {
  process.stderr.write(`${JSON.stringify({ ok: false, message })}\n`);
  process.exit(1);
}

function usage() {
  return `Run-once recurring decision consumer (caller-owned).
Receives saved permitted captures, decision intent, freshness bounds, and an optional retained previous result.
Returns useful_change or useful_no_change, or stale / unavailable / unsupported / unknown.
No global resident monitor. No synthetic claim of real recurrence. No newly funded offer.

node tools/recurring-decision-consumer/cli.mjs evaluate \\
  --intent <intent.json> --prior <capture.json> --capture <capture.json> \\
  --clock <ISO-UTC> --horizon <hours> [--previous <result.json>] [--reference <label.json>] [--state <state.json>]

node tools/recurring-decision-consumer/cli.mjs state show --state <state.json>
node tools/recurring-decision-consumer/cli.mjs state update --state <state.json> --retained <result.json> --subject <id> --intent-id <id> --clock <ISO-UTC>
node tools/recurring-decision-consumer/cli.mjs state remove --state <state.json>

node tools/recurring-decision-consumer/cli.mjs export-workflow --runtime n8n|native --out <path> [--verified]
`;
}

function parseArgs(argv) {
  const out = { command: argv[0] };
  if (out.command === "state") {
    out.stateAction = argv[1];
  }
  const start = out.command === "state" ? 2 : 1;
  for (let i = start; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--verified") out.verified = true;
    else if (arg === "--intent") out.intent = need(argv, ++i);
    else if (arg === "--prior") out.prior = need(argv, ++i);
    else if (arg === "--capture") out.capture = need(argv, ++i);
    else if (arg === "--previous") out.previous = need(argv, ++i);
    else if (arg === "--reference") out.reference = need(argv, ++i);
    else if (arg === "--state") out.state = need(argv, ++i);
    else if (arg === "--retained") out.retained = need(argv, ++i);
    else if (arg === "--subject") out.subject = need(argv, ++i);
    else if (arg === "--intent-id") out.intentId = need(argv, ++i);
    else if (arg === "--clock") out.clock = need(argv, ++i);
    else if (arg === "--horizon") out.horizonHours = horizon(need(argv, ++i));
    else if (arg === "--runtime") out.runtime = need(argv, ++i);
    else if (arg === "--out") out.out = need(argv, ++i);
    else fail(`unknown option ${arg}`);
  }
  if (out.command === "evaluate") {
    if (!out.intent || !out.clock || out.horizonHours == null) {
      if (!out.help) fail("evaluate requires --intent --clock --horizon");
    }
  }
  if (out.command === "export-workflow") {
    if (!out.runtime || !out.out) {
      if (!out.help) fail("export-workflow requires --runtime and --out");
    }
  }
  return out;
}

function need(argv, index) {
  const value = argv[index];
  if (value == null || value.startsWith("--")) fail("option requires a value");
  return value;
}

function horizon(value) {
  if (!/^\d+(?:\.\d+)?$/.test(value)) fail("horizon requires a non-negative number of hours");
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) fail("horizon requires a non-negative number of hours");
  return number;
}
