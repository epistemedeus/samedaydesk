/**
 * Shared path constants for Scale S02/S03/S04 composition.
 * One correspondence desk and one task-square importer; no parallel payment rails.
 */

export const CORRESPONDENCE_PATH = "/correspondence/";
export const CONTACT_EMAIL = "contact@neomorphic.io";
export const TASK_SQUARE_PATH = "/labs/task-square/";
export const TASK_MEMORY_PREFIX = "inputs/pilot-task-memory-20260909";

export const LAB_PATHS = Object.freeze({
  workBoard: "/lab/work-board/",
  townSquare: "/lab/town-square/",
  capabilities: "/lab/capabilities/",
  hub: "/lab/",
});

export const LAB_API = Object.freeze({
  capabilities: "/api/lab/capabilities.json",
});
