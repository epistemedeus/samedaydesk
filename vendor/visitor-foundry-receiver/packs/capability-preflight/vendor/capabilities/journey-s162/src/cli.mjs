#!/usr/bin/env node
/**
 * Fresh-consumer CLI for BOT-S162 capability journey.
 *
 *   node src/cli.mjs install   — print import paths / how to run + Heavy pin
 *   node src/cli.mjs demo      — run fixtures through real Cap01–08 (Heavy 02/03/06)
 *   node src/cli.mjs status    — honest prereq / Heavy pin table
 *   node src/cli.mjs run <input.json>
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runCapabilityJourneyS162 } from "./journey.mjs";
import { adapterStatusTable } from "./adapters.mjs";
import {
  ACCEPTANCE,
  HEAVY_CAPS,
  HEAVY_DIRS,
  HEAVY_PIN,
  IMPORT_PATHS,
  JOURNEY_STATUS,
  NATIVE_CAPS,
  NATIVE_TIPS,
  S161_HONESTY_NOTES,
} from "./constants.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function loadText(path) {
  return readFileSync(path, "utf8");
}

function usage() {
  console.error(`Usage:
  node src/cli.mjs install
  node src/cli.mjs demo
  node src/cli.mjs status
  node src/cli.mjs run <input.json>`);
  process.exit(2);
}

const [cmd, a] = process.argv.slice(2);
if (!cmd) usage();

const FIXED_CLOCK = () => Date.parse("2026-09-10T20:00:00.000Z");

function printInstall() {
  const info = {
    package: "r2-capabilities-journey-s162",
    bot: "BOT-S162",
    node: ">=20",
    npmInstall: "not required (pure Node ESM, zero dependencies)",
    heavyPin: HEAVY_PIN,
    heavyDirs: [...HEAVY_DIRS],
    relativeImports: { ...IMPORT_PATHS },
    nativeCaps: [...NATIVE_CAPS],
    heavyCaps: [...HEAVY_CAPS],
    nativeTips: { ...NATIVE_TIPS },
    howToRun: {
      fromPackage: [
        "cd experiments/scale-r2-20260910/capabilities/journey-s162",
        "node src/cli.mjs install",
        "node src/cli.mjs status",
        "node src/cli.mjs demo",
        "npm test",
      ],
      fromRepoRoot: [
        "node experiments/scale-r2-20260910/capabilities/journey-s162/src/cli.mjs demo",
        "node --test experiments/scale-r2-20260910/capabilities/journey-s162/tests/*.test.mjs",
      ],
    },
    acceptance:
      "missing_heavy cleared at Heavy pin; unknown/partial preserved; readyForRelease stays false (TAP does not prove execution against claimed revision). Do NOT treat Heavy 259/36 as journey acceptance.",
    s161HonestyNotes: [...S161_HONESTY_NOTES],
  };
  console.log(JSON.stringify(info, null, 2));
}

function printStatus() {
  const adapters = adapterStatusTable();
  const status = {
    bot: "BOT-S162",
    heavyPin: HEAVY_PIN,
    heavyDirs: [...HEAVY_DIRS],
    nativeCaps: [...NATIVE_CAPS].map((id) => ({
      id,
      tip: NATIVE_TIPS[id],
      status: "in_repo",
      import: IMPORT_PATHS[`cap${id}`] ?? null,
    })),
    heavyCaps: adapters,
    journeyAcceptance: ACCEPTANCE.GAPS_PRESERVED,
    accepted: false,
    readyForRelease: false,
    missingHeavyCaps: [],
    note: `Cap02/03/06 wired to real Heavy APIs at pin ${HEAVY_PIN}. Preserve unknown/partial; TAP/#pass does not prove execution against claimed revision.`,
    s161HonestyNotes: [...S161_HONESTY_NOTES],
  };
  console.log(JSON.stringify(status, null, 2));
}

function buildDemoInput() {
  const evidence = loadJson(join(root, "fixtures/heavy/evidence-bind-input.json"));
  const compose = loadJson(join(root, "fixtures/heavy/compose-input.json"));
  // Prefer on-disk TAP file content for Cap03 (data fixture, not instruction).
  const tapPath = join(root, "fixtures/heavy/sample-tap-pass.txt");
  evidence.testOutput = {
    ...evidence.testOutput,
    path: "fixtures/heavy/sample-tap-pass.txt",
    content: loadText(tapPath),
  };
  const sourcePath = join(root, "fixtures/heavy/source-snippet.mjs");
  evidence.source = {
    ...evidence.source,
    path: "fixtures/heavy/source-snippet.mjs",
    content: loadText(sourcePath),
  };

  return {
    taskId: "journey-s162-demo",
    requirements: loadJson(join(root, "fixtures/requirements.json")),
    costInput: loadJson(join(root, "fixtures/cost-input.json")),
    buyerContext: loadJson(join(root, "fixtures/buyer-context.json")),
    failedOutcome: loadJson(join(root, "fixtures/failed-outcome.json")),
    artifact: loadJson(join(root, "fixtures/artifact.good.json")),
    prerequisites: {
      manifest: loadJson(join(root, "fixtures/heavy/manifest-ready.json")),
      catalogListed: true,
      probe: loadJson(join(root, "fixtures/heavy/probe-ready.json")),
    },
    evidence,
    compose,
  };
}

try {
  if (cmd === "install") {
    printInstall();
  } else if (cmd === "status") {
    printStatus();
  } else if (cmd === "demo") {
    const input = buildDemoInput();
    const result = await runCapabilityJourneyS162(input, { clock: FIXED_CLOCK });
    console.log(JSON.stringify(result, null, 2));
    if (
      result.journeyStatus === JOURNEY_STATUS.FAILED ||
      result.journeyStatus === JOURNEY_STATUS.REJECTED
    ) {
      process.exit(1);
    }
    // integrated / integrated_partial are expected honest outcomes (exit 0).
  } else if (cmd === "run") {
    if (!a) usage();
    const result = await runCapabilityJourneyS162(loadJson(a));
    console.log(JSON.stringify(result, null, 2));
    if (
      result.journeyStatus === JOURNEY_STATUS.FAILED ||
      result.journeyStatus === JOURNEY_STATUS.REJECTED
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
