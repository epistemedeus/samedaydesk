/**
 * Shared loader for the accepted Pilot task-memory contract.
 * Town-square, work-board handoff, and capability selection reuse this —
 * not three observation schemas.
 */

import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const contractDist = join(root, "inputs/pilot-task-memory-20260909/dist");

let cached = null;

export async function loadTaskMemoryContract() {
  if (cached) return cached;
  const validate = await import(pathToFileURL(join(contractDist, "validate.js")).href);
  const types = await import(pathToFileURL(join(contractDist, "types.js")).href);
  const cursor = await import(pathToFileURL(join(contractDist, "cursor.js")).href);
  cached = {
    parseTaskObservation: validate.parseTaskObservation,
    assertCorrectionLineage: validate.assertCorrectionLineage,
    observationAsCorrespondenceText: validate.observationAsCorrespondenceText,
    parseMaterialChangePage: validate.parseMaterialChangePage,
    OBSERVATION_SCHEMA: types.OBSERVATION_SCHEMA,
    encodeMaterialCursor: cursor.encodeMaterialCursor,
    decodeMaterialCursor: cursor.decodeMaterialCursor,
    pageAfterCursor: cursor.pageAfterCursor,
  };
  return cached;
}

export async function loadTaskMemoryContractSync() {
  return loadTaskMemoryContract();
}
