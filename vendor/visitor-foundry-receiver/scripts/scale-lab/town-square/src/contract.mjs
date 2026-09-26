/**
 * Bridge to the accepted Pilot task-memory contract.
 * Reuses the Scale shared loader — town square does not invent a second schema.
 */

export {
  loadTaskMemoryContract,
  loadTaskMemoryContractSync,
} from "../../shared/task-memory.mjs";
