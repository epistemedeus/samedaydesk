#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { composeDelivery, recoverDelivery, showDelivery } from "./src/deliver.mjs";
import { readJson } from "./src/json.mjs";
import { packDelivery } from "./src/pack.mjs";
import { retainCapture } from "./src/retain.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.command) {
  process.stdout.write(`${usage()}\n`);
  process.exit(args.help ? 0 : 2);
}

if (args.command === "deliver") {
  const request = readRequired(args.request);
  const result = composeDelivery(request, { store: args.store });
  if (result.ok && args.out) writeFileSync(args.out, `${JSON.stringify(result.public, null, 2)}\n`);
  emit(result.ok ? result.public : result, result.ok);
}

if (args.command === "retain") {
  const body = readRequired(args.capture);
  const capture = body.capture || body;
  const result = retainCapture({
    store: args.store,
    capture,
    clock: args.clock,
    actor: args.actor ? { actorId: args.actor, party: "owned_test" } : body.actor,
    replace: args.replace === true,
  });
  emit(result.ok ? { ok: true, duplicateEffect: result.duplicateEffect, digest: result.retained?.digest, captureId: result.retained?.capture?.captureId } : result, result.ok);
}

if (args.command === "recover") {
  const result = recoverDelivery(args.store, { previous: args.previous === true });
  emit(result, result.ok);
}

if (args.command === "show") {
  const result = showDelivery(args.store);
  emit(result.ok ? result.public : result, result.ok);
}

if (args.command === "pack") {
  const result = packDelivery({ out: args.out });
  emit(result, result.ok);
}

emit({ ok: false, reason: "command_refused" }, false);

function readRequired(path) {
  if (!path) fail("path_required");
  const read = readJson(path);
  if (!read.ok) fail(read.reason, read.message);
  return read.value;
}

function emit(value, ok) {
  const stream = ok ? process.stdout : process.stderr;
  stream.write(`${JSON.stringify(value, null, 2)}\n`);
  process.exit(ok ? 0 : 1);
}

function fail(reason, message) {
  emit({ ok: false, reason, message: message || null }, false);
}

function usage() {
  return `Composed machine delivery.
Retains one capture, derives decisions, selects a fitting existing workflow extension, and prepares bounded work only when a useful change asks for it.
The task-repeat, recurring-decision, workflow-owned, and two-sided commands stay available directly.

node tools/composed-machine-delivery/cli.mjs deliver --request <request.json> --store <dir> [--out <public.json>]
node tools/composed-machine-delivery/cli.mjs retain --capture <capture.json> --store <dir> --clock <ISO-UTC> [--replace]
node tools/composed-machine-delivery/cli.mjs recover --store <dir> [--previous]
node tools/composed-machine-delivery/cli.mjs show --store <dir>
node tools/composed-machine-delivery/cli.mjs pack --out <composed-machine-delivery.tar.gz>`;
}

function parseArgs(argv) {
  const out = {};
  if (argv[0] && !argv[0].startsWith("-")) out.command = argv[0];
  for (let i = out.command ? 1 : 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--replace") out.replace = true;
    else if (arg === "--previous") out.previous = true;
    else if (arg === "--request") out.request = need(argv, ++i);
    else if (arg === "--store") out.store = need(argv, ++i);
    else if (arg === "--out") out.out = need(argv, ++i);
    else if (arg === "--capture") out.capture = need(argv, ++i);
    else if (arg === "--clock") out.clock = need(argv, ++i);
    else if (arg === "--actor") out.actor = need(argv, ++i);
    else fail("unknown_option", arg);
  }
  if (out.command === "deliver" && !out.help && (!out.request || !out.store)) fail("deliver_requires_request_and_store");
  if ((out.command === "retain" || out.command === "recover" || out.command === "show") && !out.help && !out.store) {
    fail("store_required");
  }
  if (out.command === "retain" && !out.help && (!out.capture || !out.clock)) fail("retain_requires_capture_and_clock");
  if (out.command === "pack" && !out.help && !out.out) fail("pack_requires_out");
  return out;
}

function need(argv, index) {
  const value = argv[index];
  if (value == null || value.startsWith("--")) fail("option_requires_value");
  return value;
}
