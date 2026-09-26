#!/usr/bin/env node
/**
 * Fresh-consumer CLI for R2-EXCHANGE-03.
 *
 *   node src/cli.mjs demo
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  acceptRevision,
  attachDeliverable,
  createAgreementFromRequirements,
  inspectAgainstBrief,
} from "./agreement.mjs";
import { exchange01 } from "./agreement.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const f01 = join(__dirname, "../../01/fixtures");

function load(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const [cmd] = process.argv.slice(2);
if (cmd !== "demo") {
  console.error("Usage: node src/cli.mjs demo");
  process.exit(2);
}

const requirements = load(join(f01, "requirements.positive.json"));
const proposal = load(join(root, "fixtures/proposal.json"));
const artifact = load(join(f01, "artifact.positive.json"));
const revisedRequirements = load(join(root, "fixtures/requirements.revised.json"));

const { brief, agreement: bound } = createAgreementFromRequirements(requirements, proposal, {
  clock: () => Date.parse("2026-09-10T14:00:00.000Z"),
});
const withDeliverable = attachDeliverable(bound, artifact, {
  clock: () => Date.parse("2026-09-10T14:01:00.000Z"),
});
const revisedBrief = exchange01.buildAcceptanceBrief(revisedRequirements, {
  clock: () => Date.parse("2026-09-10T14:02:00.000Z"),
});
const drifted = inspectAgainstBrief(withDeliverable, revisedBrief, {
  clock: () => Date.parse("2026-09-10T14:03:00.000Z"),
});
let silentError = null;
try {
  acceptRevision(drifted, revisedBrief, { explicit: false });
} catch (err) {
  silentError = { code: err.code, message: err.message };
}
const rebound = acceptRevision(drifted, revisedBrief, {
  explicit: true,
  clock: () => Date.parse("2026-09-10T14:04:00.000Z"),
});

console.log(
  JSON.stringify(
    {
      boundRevision: bound.boundRevision.sha256,
      afterDeliverable: withDeliverable.status,
      objectiveComplete: withDeliverable.deliverable.objectiveComplete,
      afterInspect: drifted.status,
      scopeChanged: drifted.scopeChange?.scopeDiff?.changed ?? null,
      silentAcceptRejected: silentError,
      afterExplicitAccept: rebound.status,
      newRevision: rebound.boundRevision.sha256,
      revisionsDiffer: bound.boundRevision.sha256 !== rebound.boundRevision.sha256,
    },
    null,
    2,
  ),
);
