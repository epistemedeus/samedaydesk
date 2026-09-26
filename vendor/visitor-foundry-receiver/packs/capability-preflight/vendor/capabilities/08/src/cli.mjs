#!/usr/bin/env node
/**
 * Fresh-consumer CLI for R2-CAPABILITIES-08 (install-to-first-result walkthrough).
 *
 *   node src/cli.mjs demo
 *   node src/cli.mjs run <input.json>
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInstallFirstResultWalkthrough } from "./walkthrough.mjs";
import { WALKTHROUGH_STATUS } from "./constants.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function usage() {
  console.error(`Usage:
  node src/cli.mjs demo
  node src/cli.mjs run <input.json>`);
  process.exit(2);
}

const [cmd, a] = process.argv.slice(2);
if (!cmd) usage();

const FIXED_CLOCK = () => Date.parse("2026-09-10T19:00:00.000Z");

try {
  if (cmd === "demo") {
    const input = {
      taskId: "cap08-demo-install-first-result",
      requirements: loadJson(join(root, "fixtures/requirements.json")),
      costInput: loadJson(join(root, "fixtures/cost-input.json")),
      artifact: loadJson(join(root, "fixtures/artifact.good.json")),
      discovery: { capabilityId: "extract_batch_json" },
      prerequisites: {
        prerequisites: ["node20", "offline_fixtures"],
      },
    };
    const result = await runInstallFirstResultWalkthrough(input, {
      clock: FIXED_CLOCK,
    });
    console.log(JSON.stringify(result, null, 2));
    if (
      result.status === WALKTHROUGH_STATUS.FAILED ||
      result.status === WALKTHROUGH_STATUS.REJECTED
    ) {
      process.exit(1);
    }
  } else if (cmd === "run") {
    if (!a) usage();
    const result = await runInstallFirstResultWalkthrough(loadJson(a));
    console.log(JSON.stringify(result, null, 2));
    if (
      result.status === WALKTHROUGH_STATUS.FAILED ||
      result.status === WALKTHROUGH_STATUS.REJECTED
    ) {
      process.exit(1);
    }
  } else {
    usage();
  }
} catch (err) {
  console.error(
    JSON.stringify({
      error: err.code || "error",
      message: err.message,
      details: err.details || null,
    }),
  );
  process.exit(1);
}
