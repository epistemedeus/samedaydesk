#!/usr/bin/env node
import { HEAVY_PIN, EXAMPLES_TIP, QUOTA_RESET_UTC, S164_BRANCH } from "./constants.mjs";
import { runFirstUse, runCatalogOnlyFirstUse } from "./first-run.mjs";

const [cmd] = process.argv.slice(2);
function out(x) { console.log(JSON.stringify(x, null, 2)); }

if (!cmd || cmd === "help") {
  console.log(`BOT-S172/S173 Cap first-run (examples-only; S164 consumed)
  node src/cli.mjs demo
  node src/cli.mjs demo-catalog
  node src/cli.mjs status
Examples tip: ${EXAMPLES_TIP}
S164: ${S164_BRANCH} @ ${HEAVY_PIN}
Quota reset UTC: ${QUOTA_RESET_UTC}`);
  process.exit(cmd ? 0 : 2);
}
if (cmd === "status") {
  out({ examplesTip: EXAMPLES_TIP, s164Branch: S164_BRANCH, heavyPin: HEAVY_PIN, quotaResetUtc: QUOTA_RESET_UTC, scope: "examples-only", s164Rewrite: false });
  process.exit(0);
}
if (cmd === "demo") {
  const r = runFirstUse({ clock: () => Date.parse("2026-09-10T12:48:30.000Z") });
  out({
    firstUseStatus: r.firstUseStatus,
    accepted: r.accepted,
    readyForRelease: r.readyForRelease,
    honesty: r.honesty,
    stages: {
      envelope: r.stages.envelope.status,
      prereq: r.stages.prerequisites.readiness,
      evidence: r.stages.evidence.status,
      executionVerified: r.stages.evidence.executionVerified,
      partial: r.stages.partialResult.status,
    },
  });
  process.exit(0);
}
if (cmd === "demo-catalog") {
  const r = runCatalogOnlyFirstUse({ clock: () => Date.parse("2026-09-10T12:48:30.000Z") });
  out({
    firstUseStatus: r.firstUseStatus,
    prereq: r.stages.prerequisites.readiness,
    evidence: r.stages.evidence.status,
    executionVerified: r.stages.evidence.executionVerified,
    readyForRelease: r.readyForRelease,
  });
  process.exit(0);
}
console.error("unknown command");
process.exit(2);
