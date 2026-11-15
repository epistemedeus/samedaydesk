#!/usr/bin/env node
import { readBoundedJson } from "./src/io.mjs";
import { evaluateDecision } from "./src/evaluate.mjs";
import { evaluateStoredN8n } from "./src/n8n-stored.mjs";
import { removeState, showState, updateState } from "./src/state.mjs";
import { exportWorkflowStub } from "./src/workflow.mjs";
import { receiveEvaluateRequest } from "./src/http-adapter.mjs";
import { produceRecurringResult } from "./src/recurring-result.mjs";
import { measureWholeEffort } from "./src/effort.mjs";
import { sourceReceipt } from "./src/receipt.mjs";
import { EFFORT_SCHEMA, INTENTS_SCHEMA, PRIORS_SCHEMA, REFERENCES_SCHEMA } from "./src/pins.mjs";
import {
  aglModulePresence,
  decideOrReuseViaAgl,
  importPortableViaAgl,
  AGL_IMPORT_MAP,
} from "./src/agl-bridge.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.command) {
  process.stdout.write(`${usage()}\n`);
  process.exit(args.help ? 0 : 2);
}

await main();

async function main() {
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
    // Cache only useful results. Reference control failures set useful:false so they do not update state.
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

  if (args.command === "receive-http") {
    const request = readBoundedJson(args.request);
    const response = receiveEvaluateRequest(request);
    process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
    process.exit(response.status >= 200 && response.status < 300 ? 0 : 1);
  }

  if (args.command === "receive-stored-n8n") {
    const saved = readBoundedJson(args.saved);
    const intent = readBoundedJson(args.intent);
    const prior = readBoundedJson(args.prior);
    const previous = args.previous ? readBoundedJson(args.previous) : null;
    const reference = args.reference ? readBoundedJson(args.reference) : null;
    const result = evaluateStoredN8n({
      saved,
      workflowId: args.workflowId,
      executionId: args.executionId,
      nodeName: args.node,
      intent,
      prior,
      clock: args.clock,
      horizonHours: args.horizonHours,
      previous,
      reference,
      statePath: args.state ?? null,
    });
    if (args.state && result.ok && result.useful) {
      const savedState = updateState(args.state, {
        subject: intent.subject,
        intentId: intent.intentId,
        clock: args.clock,
        retainedResult: result,
      });
      if (!savedState.ok) fail(savedState.message);
      result.statePath = args.state;
      result.stateSequence = savedState.state.sequence;
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(result.ok ? 0 : 1);
  }

  if (args.command === "recur") {
    const result = produceRecurringResult(loadRecurring(args));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(result.ok ? 0 : 1);
  }

  if (args.command === "effort") {
    const input = loadRecurring(args);
    const report = measureWholeEffort({ ...input, nestedSaved: readBoundedJson(args.nested) });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exit(report.ok && report.schema === EFFORT_SCHEMA ? 0 : 1);
  }

  if (args.command === "receipt") {
    process.stdout.write(`${JSON.stringify(sourceReceipt(), null, 2)}\n`);
    process.exit(0);
  }

  if (args.command === "agl-presence") {
    const presence = aglModulePresence();
    process.stdout.write(`${JSON.stringify({ ok: true, presence, importMap: AGL_IMPORT_MAP }, null, 2)}\n`);
    process.exit(0);
  }

  if (args.command === "agl-decide-or-reuse") {
    const saved = readBoundedJson(args.saved);
    const input = readBoundedJson(args.manifest || args.input);
    const result = await decideOrReuseViaAgl(saved, input, {
      taskId: args.taskId,
      subject: args.subject,
      sequence: args.sequence == null ? undefined : Number(args.sequence),
      clock: args.clock,
      horizonHours: args.horizonHours,
      optIn: args.optIn === true,
      optInWithdrawn: args.optInWithdrawn === true,
      intentId: args.intentId,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(result.ok ? 0 : 1);
  }

  if (args.command === "agl-import-portable") {
    const portable = readBoundedJson(args.portable);
    const manifest = readBoundedJson(args.manifest);
    const result = await importPortableViaAgl(portable, manifest, {
      clock: args.clock,
      horizonHours: args.horizonHours,
      intentId: args.intentId,
      subject: args.subject,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(result.ok ? 0 : 1);
  }

  fail("unknown command");
} catch (error) {
  fail(error?.message || String(error));
}
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
node tools/recurring-decision-consumer/cli.mjs receive-http --request <http-or-mcp-request.json>

node tools/recurring-decision-consumer/cli.mjs receive-stored-n8n \\
  --saved <execution.json> --workflow-id <id> --execution-id <id> --node <name> \\
  --intent <intent.json> --prior <capture.json> --clock <ISO-UTC> --horizon <hours> \\
  [--reference <label.json>] [--previous <result.json>] [--state <state.json>]

node tools/recurring-decision-consumer/cli.mjs recur \\
  --saved <execution.json> --workflow-id <id> --execution-id <id> --node <name> \\
  --intents <intents.json> --priors <priors.json> --schedule <schedule.json> \\
  --clock <ISO-UTC> --horizon <hours> [--adapt] [--cancel] [--state <directory>]

node tools/recurring-decision-consumer/cli.mjs effort \\
  --saved <execution.json> --nested <nested-execution.json> \\
  --workflow-id <id> --execution-id <id> --node <name> \\
  --intents <intents.json> --priors <priors.json> --schedule <schedule.json> \\
  --clock <ISO-UTC> --horizon <hours>

node tools/recurring-decision-consumer/cli.mjs receipt

AGL consume (vendor-free import; requires tools/result-reuse from candidate head 95c8a841):
node tools/recurring-decision-consumer/cli.mjs agl-presence
node tools/recurring-decision-consumer/cli.mjs agl-decide-or-reuse --saved <obs.json> --manifest <before-work.json> \
  --task-id <id> --subject <id> --sequence <n> --clock <ISO> --horizon <hours> --opt-in
node tools/recurring-decision-consumer/cli.mjs agl-import-portable --portable <portable.json> --manifest <before-work.json> [--clock <ISO>]
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
    else if (arg === "--request") out.request = need(argv, ++i);
    else if (arg === "--saved") out.saved = need(argv, ++i);
    else if (arg === "--workflow-id") out.workflowId = need(argv, ++i);
    else if (arg === "--execution-id") out.executionId = need(argv, ++i);
    else if (arg === "--node") out.node = need(argv, ++i);
    else if (arg === "--manifest") out.manifest = need(argv, ++i);
    else if (arg === "--input") out.input = need(argv, ++i);
    else if (arg === "--portable") out.portable = need(argv, ++i);
    else if (arg === "--task-id") out.taskId = need(argv, ++i);
    else if (arg === "--sequence") out.sequence = need(argv, ++i);
    else if (arg === "--opt-in") out.optIn = true;
    else if (arg === "--opt-in-withdrawn") out.optInWithdrawn = true;
    else if (arg === "--intents") out.intents = need(argv, ++i);
    else if (arg === "--priors") out.priors = need(argv, ++i);
    else if (arg === "--references") out.references = need(argv, ++i);
    else if (arg === "--schedule") out.schedule = need(argv, ++i);
    else if (arg === "--nested") out.nested = need(argv, ++i);
    else if (arg === "--adapt") out.adapt = true;
    else if (arg === "--cancel") out.cancel = true;
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
  if (out.command === "receive-http") {
    if (!out.request) {
      if (!out.help) fail("receive-http requires --request");
    }
  }
  if (out.command === "receive-stored-n8n") {
    if (!out.saved || !out.workflowId || !out.executionId || !out.node || !out.intent || !out.prior || !out.clock || out.horizonHours == null) {
      if (!out.help) fail("receive-stored-n8n requires --saved --workflow-id --execution-id --node --intent --prior --clock --horizon");
    }
  }
  if (out.command === "recur") {
    const hasStored = out.saved && out.workflowId && out.executionId && out.node;
    const hasCapture = Boolean(out.capture);
    if (!out.schedule || !out.intents || !out.clock || out.horizonHours == null || (!hasStored && !hasCapture) || (hasStored && hasCapture)) {
      if (!out.help) fail("recur requires --schedule --intents --clock --horizon and one of stored execution or --capture");
    }
    if (out.adapt && out.cancel) {
      if (!out.help) fail("adapt and cancel are separate caller actions");
    }
  }
  if (out.command === "effort") {
    if (!out.saved || !out.nested || !out.workflowId || !out.executionId || !out.node || !out.schedule || !out.intents || !out.clock || out.horizonHours == null) {
      if (!out.help) fail("effort requires --saved --nested --workflow-id --execution-id --node --schedule --intents --clock --horizon");
    }
  }
  return out;
}

function loadRecurring(args) {
  const intentsDoc = readBoundedJson(args.intents);
  if (!intentsDoc || intentsDoc.schema !== INTENTS_SCHEMA || !Array.isArray(intentsDoc.intents)) {
    fail("intents schema unsupported");
  }
  const schedule = readBoundedJson(args.schedule);
  const priors = args.priors ? readBoundedJson(args.priors) : { default: null, byIntent: {} };
  if (args.priors && priors?.schema !== PRIORS_SCHEMA) fail("priors schema unsupported");
  const references = args.references ? readBoundedJson(args.references) : { byIntent: {} };
  if (args.references && references?.schema !== REFERENCES_SCHEMA) fail("references schema unsupported");
  return {
    saved: args.saved ? readBoundedJson(args.saved) : null,
    capture: args.capture ? readBoundedJson(args.capture) : null,
    workflowId: args.workflowId,
    executionId: args.executionId,
    nodeName: args.node,
    intents: intentsDoc.intents,
    priors,
    references,
    clock: args.clock,
    horizonHours: args.horizonHours,
    schedule,
    stateDir: args.state ?? null,
    adapt: args.adapt === true,
    cancel: args.cancel === true,
    ownerQaPriors: priors.ownerQa === true,
  };
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
