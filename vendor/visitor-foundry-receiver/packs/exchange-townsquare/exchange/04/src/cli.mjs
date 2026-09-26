#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { admitArtifactSubmission } from "./admit.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) => JSON.parse(readFileSync(join(root, "fixtures", name), "utf8"));

const [cmd] = process.argv.slice(2);
if (cmd !== "demo") {
  console.error("Usage: node src/cli.mjs demo");
  process.exit(2);
}

const contract = load("contract.json");
const cases = [
  ["positive", "submission.positive.json"],
  ["missing", "submission.missing.json"],
  ["unsafe", "submission.unsafe.json"],
  ["unsupported", "submission.unsupported.json"],
  ["partial", "submission.partial.json"],
];

const out = {};
for (const [name, file] of cases) {
  const result = admitArtifactSubmission(contract, load(file), {
    clock: () => Date.parse("2026-09-10T15:00:00.000Z"),
  });
  out[name] = {
    status: result.status,
    summary: result.summary,
    issueKinds: [...new Set(result.issues.map((i) => i.kind))],
  };
}
console.log(JSON.stringify(out, null, 2));
