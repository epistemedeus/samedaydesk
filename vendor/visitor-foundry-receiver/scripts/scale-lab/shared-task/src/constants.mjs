/**
 * S20 shared-task workspace constants.
 * Uses the accepted correspondence service — no second protocol or store.
 */

import {
  CONTACT_EMAIL,
  CORRESPONDENCE_PATH,
  LAB_PATHS,
  TASK_SQUARE_PATH,
} from "../../shared/paths.mjs";
import { EVENT_KINDS } from "../../shared/correspondence-kinds.mjs";

export const SCHEMA = "neomorphic.shared-task.v1";
export const PAGE_PATH = "/lab/shared-task/";
export const MODE_LOCAL = "local-demo";
export const MODE_SHARED = "shared";

export { CONTACT_EMAIL, CORRESPONDENCE_PATH, EVENT_KINDS, LAB_PATHS, TASK_SQUARE_PATH };

export const LIMITS = Object.freeze({
  titleMax: 120,
  summaryMax: 2000,
  textMax: 8000,
  pageDefault: 25,
  pageMax: 100,
});

export const ERROR_CODES = Object.freeze({
  not_configured: "not_configured",
  unauthorized: "unauthorized",
  forbidden: "forbidden",
  conflict: "conflict",
  version_conflict: "version_conflict",
  idempotency_conflict: "idempotency_conflict",
  invalid_cursor: "invalid_cursor",
  invalid_input: "invalid_input",
  bounded_input: "bounded_input",
});
