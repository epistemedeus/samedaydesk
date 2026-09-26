#!/usr/bin/env node
/**
 * Fresh-consumer CLI for R2-EXCHANGE-02.
 *
 *   node src/cli.mjs compare <brief.json> <proposals.json>
 *   node src/cli.mjs demo
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compareProposalsToBrief, compareProposalsToRequirements } from "./compare.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const exchange01Fixtures = join(__dirname, "../../01/fixtures");

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function usage() {
  console.error(`Usage:
  node src/cli.mjs compare <brief.json> <proposals.json>
  node src/cli.mjs demo`);
  process.exit(2);
}

const [cmd, a, b] = process.argv.slice(2);
if (!cmd) usage();

try {
  if (cmd === "compare") {
    if (!a || !b) usage();
    const out = compareProposalsToBrief(loadJson(a), loadJson(b));
    console.log(JSON.stringify(out, null, 2));
  } else if (cmd === "demo") {
    const requirements = loadJson(join(exchange01Fixtures, "requirements.positive.json"));
    const proposals = loadJson(join(root, "fixtures/proposals.bundle.json"));
    const out = compareProposalsToRequirements(requirements, proposals, {
      clock: () => Date.parse("2026-09-10T13:00:00.000Z"),
    });
    console.log(
      JSON.stringify(
        {
          taskId: out.taskId,
          proposalCount: out.proposalCount,
          ranking: out.ranking,
          order: out.order,
          statuses: out.comparisons.map((c) => ({
            id: c.proposalId,
            status: c.status,
            missing: c.missingEvidence.length,
            conflicts: c.conflicts.length,
            artifactObjectiveComplete: c.artifactObjectiveComplete,
          })),
          consumerInstructions: out.consumerInstructions,
        },
        null,
        2,
      ),
    );
  } else {
    usage();
  }
} catch (err) {
  console.error(
    JSON.stringify({ error: err.code || "error", message: err.message, details: err.details || null }),
  );
  process.exit(1);
}
