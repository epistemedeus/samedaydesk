#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runConversationToTask } from "./pipeline.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function load(p) { return JSON.parse(readFileSync(p, "utf8")); }
function usage() {
  console.error("Usage:\n  node src/cli.mjs run <conversation.json>\n  node src/cli.mjs demo");
  process.exit(2);
}

const [cmd, a] = process.argv.slice(2);
if (!cmd) usage();
try {
  if (cmd === "run") {
    if (!a) usage();
    const out = runConversationToTask(load(a));
    console.log(JSON.stringify(out, null, 2));
  } else if (cmd === "demo") {
    const out = runConversationToTask(load(join(root, "fixtures/conversation.positive.json")));
    mkdirSync(join(root, "demo-out"), { recursive: true });
    writeFileSync(join(root, "demo-out/task.json"), JSON.stringify(out, null, 2));
    console.log(JSON.stringify({
      status: out.status,
      packageId: out.packageId,
      fabricatedUsers: out.fabricatedUsers,
      execute: out.execute,
      taskId: out.task.id,
      capabilityIds: out.task.capabilityIds,
      proposedActionCount: out.task.proposedActions.length,
      stages: out.stages,
      wrote: "demo-out/task.json",
    }, null, 2));
  } else usage();
} catch (err) {
  console.error(JSON.stringify({ error: err.code || "error", message: err.message }));
  process.exit(1);
}
