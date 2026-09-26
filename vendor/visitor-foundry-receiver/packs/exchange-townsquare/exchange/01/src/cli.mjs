#!/usr/bin/env node
/**
 * Fresh-consumer CLI for R2-EXCHANGE-01.
 *
 *   node src/cli.mjs brief <requirements.json>
 *   node src/cli.mjs check <brief.json> <artifact.json>
 *   node src/cli.mjs demo
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAcceptanceBrief } from "./brief.mjs";
import { runAcceptanceChecks } from "./run-checks.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function usage() {
  console.error(`Usage:
  node src/cli.mjs brief <requirements.json>
  node src/cli.mjs check <brief.json> <artifact.json>
  node src/cli.mjs demo`);
  process.exit(2);
}

const [cmd, a, b] = process.argv.slice(2);
if (!cmd) usage();

try {
  if (cmd === "brief") {
    if (!a) usage();
    const brief = buildAcceptanceBrief(loadJson(a));
    console.log(JSON.stringify(brief, null, 2));
  } else if (cmd === "check") {
    if (!a || !b) usage();
    const result = runAcceptanceChecks(loadJson(a), loadJson(b));
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.objective.complete ? 0 : 1);
  } else if (cmd === "demo") {
    const requirements = loadJson(join(root, "fixtures/requirements.positive.json"));
    const artifactOk = loadJson(join(root, "fixtures/artifact.positive.json"));
    const artifactBad = loadJson(join(root, "fixtures/artifact.negative.json"));
    const brief = buildAcceptanceBrief(requirements);
    const pos = runAcceptanceChecks(brief, artifactOk);
    const neg = runAcceptanceChecks(brief, artifactBad);
    console.log(
      JSON.stringify(
        {
          briefStatus: brief.status,
          objectiveCheckCount: brief.objectiveChecks.length,
          unresolvedSubjective: brief.unresolvedSubjective,
          positiveObjectiveComplete: pos.objective.complete,
          negativeObjectiveComplete: neg.objective.complete,
          overallAcceptedClaim: pos.overall.accepted,
          consumerInstructions: brief.consumerInstructions,
        },
        null,
        2,
      ),
    );
  } else {
    usage();
  }
} catch (err) {
  console.error(JSON.stringify({ error: err.code || "error", message: err.message, details: err.details || null }));
  process.exit(1);
}
