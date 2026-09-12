#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { COMPOSITION_SHA, observedCompositionSha } from "../../src/m01.mjs";
import { loadAcceptCases, PACK_ROOT } from "../src/load-cases.mjs";
import { runAcceptCase, simulateMissingOutput } from "../src/run-case.mjs";

function usage() {
  return `h04 accept-pack — cold-caller cases on M01 four engines (${COMPOSITION_SHA})

Commands:
  list
  run [--id ID]
  delivery-negative   Run a succeeding lockfile case then delete a promised file; must fail delivery

cwd: experiments/wave5-heavy/h04
  node accept-pack/bin/accept.mjs list
  node accept-pack/bin/accept.mjs run
`;
}

function emit(obj, code = 0) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
  process.exit(code);
}

const cmd = process.argv[2] || "help";
const idFlagIndex = process.argv.indexOf("--id");
const onlyId = idFlagIndex >= 0 ? process.argv[idFlagIndex + 1] : null;

if (cmd === "help" || cmd === "--help") {
  process.stdout.write(usage());
  process.exit(0);
}

if (cmd === "list") {
  const { cases, errors } = loadAcceptCases();
  emit({
    ok: true,
    compositionSha: COMPOSITION_SHA,
    observedSha: observedCompositionSha(),
    count: cases.length,
    lockfilePublic: cases.filter((c) => c.pack === "lockfile-public").length,
    ids: cases.map((c) => ({ id: c.id, engineId: c.engineId || c.m01EngineId, pack: c.pack })),
    errors,
  });
}

if (cmd === "run") {
  const { cases, errors } = loadAcceptCases();
  const selected = onlyId ? cases.filter((c) => c.id === onlyId) : cases;
  const runs = [];
  for (const c of selected) {
    runs.push(await runAcceptCase(c));
  }
  const summary = {
    ok: true,
    command: "run",
    compositionSha: COMPOSITION_SHA,
    observedSha: observedCompositionSha(),
    count: runs.length,
    loadErrors: errors,
    deliveryFails: runs.filter((r) => r.delivery?.pass === false).length,
    refused: runs.filter((r) => r.delivery?.kind === "refused").length,
    analysis: runs.filter((r) => r.delivery?.kind === "analysis").length,
    runs,
  };
  mkdirSync(join(PACK_ROOT, "runs"), { recursive: true });
  writeFileSync(join(PACK_ROOT, "runs", "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  emit(summary);
}

if (cmd === "delivery-negative") {
  const { cases } = loadAcceptCases();
  const lock = cases.find((c) => c.id === "h04-pub-lock-01") || cases.find((c) => (c.engineId || "lockfile-pin-delta") === "lockfile-pin-delta" && c.pack === "lockfile-public");
  if (!lock) emit({ ok: false, error: "no lockfile public case for delivery-negative" }, 2);
  const ran = await runAcceptCase(lock);
  const sim = simulateMissingOutput(join(PACK_ROOT, "runs", lock.id, "out"), ran.engineId);
  const after = {
    ...ran.delivery,
    kind: sim.deliveryMustFail ? "incomplete-delivery" : ran.delivery.kind,
    pass: sim.deliveryMustFail ? false : ran.delivery.pass,
    missing: sim.missing,
  };
  const result = {
    ok: after.pass === false && after.kind === "incomplete-delivery",
    command: "delivery-negative",
    compositionSha: COMPOSITION_SHA,
    caseId: lock.id,
    before: ran.delivery,
    simulated: sim,
    after,
    note: "Missing promised pin-delta.json must fail delivery. M01 engines were not patched.",
  };
  mkdirSync(join(PACK_ROOT, "runs", "delivery-negative"), { recursive: true });
  writeFileSync(join(PACK_ROOT, "runs", "delivery-negative", "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  emit(result, result.ok ? 0 : 1);
}

process.stderr.write(`unknown command ${cmd}\n`);
process.stdout.write(usage());
process.exit(2);
