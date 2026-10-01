#!/usr/bin/env node
// Cold contributor. Refuses database and owner credentials before importing the client.
// Usage:
//   node server/earned-work/ordinary-contributor.mjs \
//     --base-url URL --token-file FILE --task ID --evidence-file FILE [--mode submit|qualify|read]
import { readFileSync } from "node:fs";

const FORBIDDEN = [
  "DATABASE_URL",
  "EARNED_WORK_DATABASE_URL",
  "EARNED_WORK_OWNER_TOKEN",
  "EARNED_WORK_PAYOUT_KEY",
  "EARNED_WORK_PG_SCHEMA",
];

for (const key of FORBIDDEN) {
  if (process.env[key] != null && String(process.env[key]).trim() !== "") {
    console.error(`ordinary contributor refuses ${key}`);
    process.exit(1);
  }
}

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return "";
  return process.argv[index + 1];
}

const baseUrl = arg("--base-url");
const tokenFile = arg("--token-file");
const taskId = arg("--task");
const evidenceFile = arg("--evidence-file");
const mode = arg("--mode") || "submit";
if (!baseUrl || !tokenFile || !taskId || (mode === "submit" && !evidenceFile)) {
  console.error("usage: ordinary-contributor --base-url URL --token-file FILE --task ID --evidence-file FILE [--mode submit|qualify|read]");
  process.exit(2);
}
if (mode !== "submit" && mode !== "qualify" && mode !== "read") {
  console.error("mode must be submit, qualify, or read");
  process.exit(2);
}

const { runOrdinaryContributor } = await import("@neomorphic/earned-work-host/contributor");
const token = readFileSync(tokenFile, "utf8").trim();
const evidence = evidenceFile ? readFileSync(evidenceFile) : undefined;
const receipt = await runOrdinaryContributor({ baseUrl, token, taskId, mode, evidence });
process.stdout.write(`${JSON.stringify(receipt)}\n`);
process.exit(receipt.ok ? 0 : 3);
