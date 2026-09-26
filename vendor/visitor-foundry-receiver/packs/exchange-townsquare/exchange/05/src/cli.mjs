#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCorrectionRequest, recheckAfterAmend, exchange01 } from "./correct.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const f01 = join(__dirname, "../../01/fixtures");
const load = (p) => JSON.parse(readFileSync(p, "utf8"));

if (process.argv[2] !== "demo") {
  console.error("Usage: node src/cli.mjs demo");
  process.exit(2);
}

const requirements = load(join(f01, "requirements.positive.json"));
const brief = exchange01.buildAcceptanceBrief(requirements);
const bad = load(join(f01, "artifact.partial.json"));
const good = load(join(f01, "artifact.positive.json"));
const first = buildCorrectionRequest(
  { brief, artifact: bad },
  { clock: () => Date.parse("2026-09-10T16:00:00.000Z") },
);
const second = recheckAfterAmend(brief, good, { clock: () => Date.parse("2026-09-10T16:01:00.000Z") });

console.log(JSON.stringify({
  afterPartial: {
    status: first.status,
    restartTask: first.restartTask,
    failed: first.objectiveSummary.failed,
    passed: first.objectiveSummary.passed,
    amendCriterionIds: first.amendItems.map((a) => a.criterionId),
    retained: first.acceptedParts.map((a) => a.criterionId).slice(0, 5),
  },
  afterFix: {
    status: second.request.status,
    failed: second.request.objectiveSummary.failed,
    restartTask: second.request.restartTask,
  },
}, null, 2));
