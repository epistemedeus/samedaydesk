/**
 * End-to-end Scale journey: brief → evidence inspect/correct → capability select.
 * Uses shared handoff + existing boards; no parallel identity/payment stores.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createWorkBoard } from "../work-board/src/index.mjs";
import { createContractBackedTownSquare } from "../town-square/src/index.mjs";
import {
  createSeedCatalog,
  matchCapabilities,
  createLocalMarket,
  FIXTURE_NOW,
} from "../capability-market/src/index.mjs";
import { loadTaskMemoryContract } from "./task-memory.mjs";
import {
  briefFromWorkBoardDossier,
  evidencePacketFromObservation,
  selectionFromCapabilityMatch,
  composeScalePacket,
} from "./handoff.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function loadFixtureObservation(name) {
  const path = join(root, "inputs/pilot-task-memory-20260909/fixtures", name);
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Run the composed local journey and return the portable packet + stage results.
 */
export async function runScaleJourney({
  jobId = "job_demo_page_diff",
  outcome = "public_page_extract",
  inputs = { urls: ["https://neomorphic.io/"] },
  clock = () => "2026-09-09T15:00:00.000Z",
  nowMs = Date.parse(FIXTURE_NOW),
} = {}) {
  const work = createWorkBoard({ clock });
  const dossier = work.getJobDossier(jobId);
  const brief = briefFromWorkBoardDossier(dossier);

  const contract = await loadTaskMemoryContract();
  const town = createContractBackedTownSquare({
    parseObservation: contract.parseTaskObservation,
    assertLineage: contract.assertCorrectionLineage,
  });

  const inferred = loadFixtureObservation("observation-inferred-then-corrected.json");
  const correction = loadFixtureObservation("observation-correction-active.json");
  const evidence = evidencePacketFromObservation(inferred);
  const ingest = town.ingestObservations([inferred, correction], {
    trust: "supplied-unverified",
    source: { label: "pilot-task-memory-fixtures", version: "s11-compose" },
  });

  const machine = town.exportMachine({ limit: 20 });
  const observer = town.getObserverView({ changeLimit: 10 });

  const catalog = createSeedCatalog();
  const matched = matchCapabilities(catalog, { outcome, inputs }, { nowMs });
  const selection = selectionFromCapabilityMatch(matched, { requestedOutcome: outcome, inputs });

  let delivery = null;
  if (selection.ok && selection.capabilityId) {
    const market = createLocalMarket({ catalog, nowMs });
    delivery = await market.run(selection.capabilityId, inputs);
  }

  const packet = composeScalePacket({ brief, evidence, selection });

  return {
    brief,
    evidence,
    selection,
    ingestSummary: {
      accepted: ingest.accepted,
      deduplicated: ingest.deduplicated,
      openQuestions: town.listUnresolved().length,
      resolvedCount: observer.resolvedCount,
    },
    machineExport: {
      schema: machine.schema,
      changeCount: machine.changes.length,
      nextCursor: machine.nextCursor,
      unresolvedQuestionIds: machine.unresolvedQuestionIds,
    },
    delivery,
    packet,
  };
}
