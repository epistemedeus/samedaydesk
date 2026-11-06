#!/usr/bin/env node
import { closeSync, fstatSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { installConsumer, removeInstalled, runInstalled, updateInstalled } from "./src/acquire.mjs";
import { invoke } from "./src/adapter.mjs";
import { registerExtension, updateExtension, removeExtension, readExtension } from "./src/lifecycle.mjs";
import { loadAllInterfaces } from "./src/manifests.mjs";
import { INPUT_MAX_BYTES } from "../result-reuse/src/limits.mjs";

const ACQUIRABLE = new Set(["native", "mcp", "review"]);

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.command) {
  process.stdout.write(`${usage()}\n`);
  process.exit(args.help ? 0 : 2);
}

const result = dispatch(args);
if (!result.ok) {
  process.stderr.write(`${JSON.stringify(result)}\n`);
  process.exit(1);
}
if (args.command === "export" && args.out && result.sdk?.observation) {
  try {
    writeFileSync(args.out, `${JSON.stringify(result.sdk.observation, null, 2)}\n`);
  } catch {
    fail("cannot write --out");
  }
}
if (args.command === "decide-or-reuse" && args.produced && args.out && result.sdk?.observation) {
  try {
    writeFileSync(args.out, `${JSON.stringify(result.sdk.observation, null, 2)}\n`);
  } catch {
    fail("cannot write --out");
  }
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

function dispatch(parsed) {
  if (parsed.command === "manifests") return loadAllInterfaces();
  if (parsed.command === "acquire") {
    return installConsumer({
      store: parsed.store,
      consumer: parsed.consumer,
      version: parsed.version,
      clock: parsed.clock,
      site: parsed.site,
      sourceCommit: parsed.source,
    });
  }
  if (parsed.command === "run") {
    return runInstalled({
      store: parsed.store,
      consumer: parsed.consumer,
      job: {
        tool: parsed.tool || "preview_reuse",
        input: parsed.inputValue,
        task_id: parsed.taskId,
        subject: parsed.subject,
        sequence: parsed.sequence,
        clock: parsed.clock,
        opt_in: parsed.optIn,
        horizon: parsed.horizonHours,
        produced: parsed.producedValue,
        publish: parsed.publish === true,
      },
    });
  }
  if (parsed.command === "register") {
    return registerExtension({ store: parsed.store, consumer: parsed.consumer, version: parsed.version, clock: parsed.clock });
  }
  if (parsed.command === "update") {
    if (ACQUIRABLE.has(parsed.consumer)) {
      return updateInstalled({
        store: parsed.store,
        consumer: parsed.consumer,
        version: parsed.version,
        clock: parsed.clock,
        sourceCommit: parsed.source,
      });
    }
    return updateExtension({ store: parsed.store, consumer: parsed.consumer, version: parsed.version, clock: parsed.clock });
  }
  if (parsed.command === "remove") {
    if (ACQUIRABLE.has(parsed.consumer)) {
      return removeInstalled({ store: parsed.store, consumer: parsed.consumer, clock: parsed.clock });
    }
    return removeExtension({ store: parsed.store, consumer: parsed.consumer, clock: parsed.clock });
  }
  if (parsed.command === "status") {
    return readExtension({ store: parsed.store, consumer: parsed.consumer });
  }
  if (parsed.command === "invoke") {
    return invoke({
      ...parsed,
      consumer: parsed.consumer,
      tool: parsed.tool,
      input: parsed.input ?? parsed.input_json,
    });
  }
  const params = {
    consumer: parsed.consumer,
    tool: toolFor(parsed.command, parsed.tool),
    input: parsed.inputValue,
    produced: parsed.producedValue,
    decision: parsed.decisionValue,
    task_id: parsed.taskId,
    subject: parsed.subject,
    sequence: parsed.sequence,
    clock: parsed.clock,
    select: parsed.select,
    opt_in: parsed.optIn,
    withdraw_opt_in: parsed.optInWithdrawn,
    horizon: parsed.horizonHours,
    owner_scope: parsed.ownerScope,
    class: parsed.recordClass,
    corrects_sequence: parsed.correctsSequence,
    note: parsed.note,
  };
  return invoke(params);
}

function toolFor(command, tool) {
  if (command === "preview") return "preview_reuse";
  if (command === "export") return "export_reuse";
  if (command === "decide-or-reuse") return "decide_or_reuse";
  return tool;
}

function fail(message) {
  process.stderr.write(`${JSON.stringify({ ok: false, message })}\n`);
  process.exit(1);
}

function usage() {
  return `Source-only workflow-owned extensions for SameDayDesk result-reuse.
Embeds the existing result-reuse SDK in a Dify tool interface and a Ghost draft adapter.
Manifests do not claim installation passed. Runtime execution status stays "not yet executed on runtime".
When Dify or Ghost is unavailable, the existing local result-reuse CLI is the useful direct path.

node tools/workflow-owned-extensions/cli.mjs preview --input <result.json> --task-id <id> --subject <id> --sequence <n> --clock <ISO-UTC> [--consumer dify|ghost]
node tools/workflow-owned-extensions/cli.mjs export --input <result.json> --task-id <id> --subject <id> --sequence <n> --clock <ISO-UTC> --opt-in --out <observation.json>
node tools/workflow-owned-extensions/cli.mjs decide-or-reuse --input <before-work.json> --produced <decision.json> --out <observation.json> --task-id <id> --subject <id> --sequence <n> --clock <ISO-UTC> --horizon <hours> --opt-in
node tools/workflow-owned-extensions/cli.mjs invoke --tool preview_reuse --params <params.json>
node tools/workflow-owned-extensions/cli.mjs register --store <dir> --clock <ISO-UTC> [--consumer dify|ghost]
node tools/workflow-owned-extensions/cli.mjs update --store <dir> --version <semver> --clock <ISO-UTC> [--consumer dify|ghost|native|mcp|review]
node tools/workflow-owned-extensions/cli.mjs remove --store <dir> --clock <ISO-UTC> [--consumer dify|ghost|native|mcp|review]
node tools/workflow-owned-extensions/cli.mjs status --store <dir> [--consumer dify|ghost|native|mcp|review]
node tools/workflow-owned-extensions/cli.mjs manifests
node tools/workflow-owned-extensions/cli.mjs acquire --consumer <native|mcp|review> --site <samedaydesk|ein-llc|neomorphic-io> --store <dir> --source <40-hex> --clock <ISO-UTC>
node tools/workflow-owned-extensions/cli.mjs run --consumer <native|mcp|review> --store <dir> --input <result.json> --task-id <id> --subject <id> --sequence <n> --clock <ISO-UTC>`;
}

function parseArgs(argv) {
  const out = { command: argv[0], select: [], consumer: "dify", consumerExplicit: false };
  if (out.command === "invoke") {
    for (let i = 1; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === "--help" || arg === "-h") out.help = true;
      else if (arg === "--tool") out.tool = optionValue(argv, ++i);
      else if (arg === "--params") out.paramsPath = optionValue(argv, ++i);
      else if (arg === "--consumer") {
        out.consumer = optionValue(argv, ++i);
        out.consumerExplicit = true;
      }
      else fail("unknown option");
    }
    if (!out.help) {
      if (!out.paramsPath) fail("invoke requires --params");
      const cliTool = out.tool;
      Object.assign(out, readBoundedJson(out.paramsPath, "--params"));
      if (cliTool) out.tool = cliTool;
    }
    return out;
  }
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
    else if (arg === "--horizon") out.horizonHours = horizonHours(optionValue(argv, ++i));
    else if (arg === "--store") out.store = optionValue(argv, ++i);
    else if (arg === "--version") out.version = optionValue(argv, ++i);
    else if (arg === "--consumer") {
      out.consumer = optionValue(argv, ++i);
      out.consumerExplicit = true;
    }
    else if (arg === "--tool") out.tool = optionValue(argv, ++i);
    else if (arg === "--site") out.site = optionValue(argv, ++i);
    else if (arg === "--source") out.source = optionValue(argv, ++i);
    else if (arg === "--publish") out.publish = true;
    else fail("unknown option");
  }
  if (out.optIn && out.optInWithdrawn) fail("opt-in and withdrawal conflict");
  if (out.command === "export" && !out.out && !out.help) fail("export requires --out");
  if (out.produced && out.command !== "decide-or-reuse" && out.command !== "run") fail("--produced is only valid for decide-or-reuse");
  if (out.command === "decide-or-reuse" && out.produced && out.decision) fail("decide-or-reuse accepts either --decision or --produced");
  if (out.command === "decide-or-reuse" && !out.decision && !out.produced && !out.help) {
    fail("decide-or-reuse requires --decision or --produced");
  }
  if (out.produced && out.command === "decide-or-reuse" && !out.out) fail("binding a decision requires --out");
  const lifecycle = ["register", "update", "remove", "status", "manifests", "acquire", "run"];
  const known = ["preview", "export", "decide-or-reuse", "invoke", ...lifecycle];
  if (out.command && !known.includes(out.command) && !out.help) {
    fail("command must be preview, export, decide-or-reuse, invoke, register, update, remove, status, manifests, acquire, or run");
  }
  if (["preview", "export", "decide-or-reuse", "run"].includes(out.command) && !out.input && !out.help) fail("requires --input");
  if (["register", "update", "remove", "status", "acquire", "run"].includes(out.command) && !out.store && !out.help) fail("requires --store");
  if (out.command === "update" && !out.version && !out.help) fail("update requires --version");
  if ((out.command === "acquire" || out.command === "run") && !out.consumerExplicit && !out.help) {
    fail("caller must name a consumer; no selection is made");
  }
  if (out.command === "acquire" && !out.help) {
    if (!out.site) fail("acquire requires --site");
    if (!out.source) fail("acquire requires --source");
    if (!out.clock) fail("acquire requires --clock");
  }
  if (["preview", "export", "decide-or-reuse", "run"].includes(out.command) && out.input) {
    out.inputValue = readBoundedJson(out.input, "--input");
  }
  if (out.produced) out.producedValue = readBoundedJson(out.produced, "--produced");
  if (out.decision) out.decisionValue = readBoundedJson(out.decision, "--decision");
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
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) fail("horizon must be a non-negative number of hours");
  return number;
}

function readBoundedJson(path, label = "--input") {
  let handle;
  try {
    handle = openSync(path, "r");
    const stat = fstatSync(handle);
    if (stat.size > INPUT_MAX_BYTES) throw new Error("too large");
    const buffer = readFileSync(handle);
    if (buffer.byteLength > INPUT_MAX_BYTES) throw new Error("too large");
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    fail(`cannot read ${label} as bounded JSON`);
  } finally {
    if (handle != null) closeSync(handle);
  }
}
