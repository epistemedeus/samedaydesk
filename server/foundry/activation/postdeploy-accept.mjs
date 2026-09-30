#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { judge, requireFact } from "./classify.mjs";
import { observeOrigin } from "./observe.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  return process.argv[index + 1] || null;
}

function emit(result) {
  process.stdout.write(`${JSON.stringify({ ...result, productionActivate: "HOLD" })}\n`);
  process.exit(result.exitCode);
}

const fixture = argument("--fixture");
const origin = argument("--origin");
const requireName = argument("--require");

if (fixture && origin) {
  emit({ ok: false, exitCode: 2, code: "false_green_rejected", reason: "fixture_and_origin" });
}
if (!fixture && !origin) {
  emit({ ok: false, exitCode: 2, code: "false_green_rejected", reason: "observation_missing" });
}

let observation;
if (fixture) {
  observation = JSON.parse(await readFile(fixture, "utf8"));
} else {
  observation = await observeOrigin(origin);
}

if (requireName) emit(requireFact(observation, requireName));
emit(judge(observation));
