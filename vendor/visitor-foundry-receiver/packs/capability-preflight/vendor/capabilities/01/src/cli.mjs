#!/usr/bin/env node
/**
 * Fresh-consumer CLI for R2-CAPABILITIES-01.
 *
 *   node src/cli.mjs envelope <input.json>
 *   node src/cli.mjs demo
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTaskRequirementsEnvelope } from "./envelope.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function usage() {
  console.error(`Usage:
  node src/cli.mjs envelope <input.json>
  node src/cli.mjs demo`);
  process.exit(2);
}

const [cmd, a] = process.argv.slice(2);
if (!cmd) usage();

try {
  if (cmd === "envelope") {
    if (!a) usage();
    const envelope = buildTaskRequirementsEnvelope(loadJson(a));
    console.log(JSON.stringify(envelope, null, 2));
    process.exit(envelope.status === "rejected" ? 1 : 0);
  } else if (cmd === "demo") {
    const positive = loadJson(join(root, "fixtures/requirements.positive.json"));
    const partial = loadJson(join(root, "fixtures/input.partial.json"));
    const withCap = loadJson(join(root, "fixtures/input.with-capability.json"));
    const posEnv = buildTaskRequirementsEnvelope(positive, {
      clock: () => Date.parse("2026-09-10T12:30:00.000Z"),
    });
    const partialEnv = buildTaskRequirementsEnvelope(partial, {
      clock: () => Date.parse("2026-09-10T12:30:00.000Z"),
    });
    const capEnv = buildTaskRequirementsEnvelope(withCap, {
      clock: () => Date.parse("2026-09-10T12:30:00.000Z"),
    });
    console.log(
      JSON.stringify(
        {
          positive: {
            status: posEnv.status,
            requiredInputCount: posEnv.requiredInputs.length,
            objectiveCheckCount: posEnv.outputConstraints?.objectiveChecks?.length ?? 0,
            subjectiveUnresolved: posEnv.acceptableEvidence?.subjectiveUnresolved?.map((s) => s.id) ?? [],
            missingInputs: posEnv.missingInputs.map((m) => m.id),
            requirementsRef: posEnv.requirementsRef,
          },
          partial: {
            status: partialEnv.status,
            missingInputs: partialEnv.missingInputs.map((m) => m.id),
            outputConstraints: partialEnv.outputConstraints,
          },
          withCapability: {
            status: capEnv.status,
            capabilityContract: capEnv.capabilityContract,
            requiredInputIds: capEnv.requiredInputs.map((i) => i.id),
            missingInputs: capEnv.missingInputs.map((m) => m.id),
          },
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
    JSON.stringify({
      error: err.code || "error",
      message: err.message,
      details: err.details || null,
    }),
  );
  process.exit(1);
}
