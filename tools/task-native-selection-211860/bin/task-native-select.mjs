#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { acquireSources } from "../src/acquire.mjs";
import { buildFeedback, compareEffort } from "../src/feedback.mjs";
import { executeSyntheticLoopback } from "../src/execute.mjs";
import { consumeQualified } from "../src/consume.mjs";
import { selectTask } from "../src/select.mjs";

function usage() {
  return [
    "task-native-select acquire --out <dir>",
    "task-native-select list --catalog <normalized.json>",
    "task-native-select select --catalog <normalized.json> --task <task.json> [--fresh <normalized.json>]",
    "task-native-select effort --catalog <normalized.json> --task <task.json>",
    "task-native-select execute-synthetic --catalog <normalized.json> --task <task.json> --body <body.json>",
    "task-native-select feedback --result <result.json> --opt-in [--accept] --out <file.json>",
    "task-native-select consume --catalog <normalized.json> --task <task.json> --input <input.json> --repo <checkout> [--fresh <normalized.json>]",
  ].join("\n");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function flag(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return null;
  return argv[index + 1] ?? "";
}

function has(argv, name) {
  return argv.includes(name);
}

function say(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function fail(message, code = 2) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

const [command, ...argv] = process.argv.slice(2);
if (!command || command === "--help" || command === "-h") {
  process.stdout.write(`${usage()}\n`);
  process.exit(command ? 0 : 2);
}

if (command === "acquire") {
  const out = flag(argv, "--out");
  if (!out) fail(usage());
  const acquired = await acquireSources({ outDir: out });
  say({ ok: acquired.ok, acquiredAt: acquired.coverage.acquiredAt, sources: acquired.coverage.sources.map((row) => ({
    id: row.id,
    status: row.status,
    bytes: row.bytes,
    contract: row.contract,
    sha256: row.sha256,
  })) });
  process.exit(acquired.ok ? 0 : 1);
}

if (command === "list") {
  const catalog = readJson(flag(argv, "--catalog") || "");
  const rows = (catalog.entries || []).map((entry) => ({
    id: entry.id,
    operationId: entry.operationId,
    method: entry.method,
    path: entry.path,
    summary: entry.summaryUntrusted || "",
  }));
  say({ schema: "samedaydesk.task-native-selection.list.v1", selected: null, rows });
  process.exit(0);
}

if (command === "select" || command === "effort") {
  const catalog = readJson(flag(argv, "--catalog") || "");
  const task = readJson(flag(argv, "--task") || "");
  const freshPath = flag(argv, "--fresh");
  const freshCatalog = freshPath ? readJson(freshPath) : null;
  if (command === "effort") {
    say(compareEffort({ catalog, task }));
    process.exit(0);
  }
  const result = selectTask({ catalog, task, freshCatalog });
  say(result);
  process.exit(result.stages.query.state === "accepted" ? 0 : 2);
}

if (command === "execute-synthetic") {
  const catalog = readJson(flag(argv, "--catalog") || "");
  const task = readJson(flag(argv, "--task") || "");
  const body = readJson(flag(argv, "--body") || "");
  const result = selectTask({ catalog, task });
  if (result.stages.selected.state !== "selected") {
    say(result);
    process.exit(2);
  }
  const entry = catalog.entries.find((item) => item.id === result.stages.selected.entryId);
  const executed = await executeSyntheticLoopback({ entry, body });
  result.stages.executed = executed;
  if (has(argv, "--accept")) {
    result.stages.usefulAcceptance = {
      state: "caller_opt_in",
      accepted: true,
      independentCustomer: false,
      ownerQa: true,
    };
  }
  say(result);
  process.exit(executed.contract?.ok ? 0 : 2);
}

if (command === "consume") {
  const catalog = readJson(flag(argv, "--catalog") || "");
  const task = readJson(flag(argv, "--task") || "");
  const callerInput = readJson(flag(argv, "--input") || "");
  const repo = flag(argv, "--repo");
  const freshPath = flag(argv, "--fresh");
  const freshCatalog = freshPath ? readJson(freshPath) : null;
  const journey = await consumeQualified({ catalog, task, callerInput, repoRoot: repo, freshCatalog });
  const out = flag(argv, "--out");
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(journey, null, 2)}\n`);
  }
  say(journey);
  process.exit(journey.outputValidation?.ok === true && journey.invocation?.state === "invoked" ? 0 : 2);
}

if (command === "feedback") {
  if (!has(argv, "--opt-in")) fail("feedback_opt_in_required");
  const result = readJson(flag(argv, "--result") || "");
  const out = flag(argv, "--out");
  if (!out) fail(usage());
  const document = buildFeedback({ result, optIn: true, accept: has(argv, "--accept") });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);
  say({ send: false, out, accepted: document.receipt.accepted });
  process.exit(0);
}

fail(usage());
