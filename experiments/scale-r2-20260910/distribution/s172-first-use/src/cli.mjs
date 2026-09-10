#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { adaptFirstUseResponse } from "./adapter.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function load(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

function usage() {
  console.error(`Usage:
  node src/cli.mjs adapt <attempt.json>
  node src/cli.mjs demo`);
  process.exit(2);
}

const [cmd, a] = process.argv.slice(2);
if (!cmd) usage();

if (cmd === "adapt") {
  if (!a) usage();
  const out = adaptFirstUseResponse(load(a));
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.outcome === "success" ? 0 : 1);
}

if (cmd === "demo") {
  const ok = adaptFirstUseResponse(load(join(root, "fixtures/attempt.success-discovery.json")));
  const bad = adaptFirstUseResponse(load(join(root, "fixtures/attempt.failure-discovery.json")));
  console.log(
    JSON.stringify(
      {
        successOutcome: ok.outcome,
        successNextAction: ok.nextAction,
        successArtifactType: ok.artifact?.type,
        failureOutcome: bad.outcome,
        failureCaptureStatus: bad.artifact?.captureStatus,
        failureNextAction: bad.nextAction,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

usage();
