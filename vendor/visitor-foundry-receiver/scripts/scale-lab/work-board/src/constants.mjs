/**
 * S02 work/bounty board constants.
 * Reuses the shared correspondence event vocabulary (single store of kinds).
 * No custody, escrow, hosted awards, or payment rail.
 */

import { EVENT_KINDS as SHARED_EVENT_KINDS } from "../../shared/correspondence-kinds.mjs";
import { CONTACT_EMAIL as SHARED_CONTACT, CORRESPONDENCE_PATH as SHARED_CORRESPONDENCE } from "../../shared/paths.mjs";

export const SCHEMA = "neomorphic.work-board.v1";
export const SCHEMA_HINT = SCHEMA;
export const ADAPTER_MODE_LOCAL_DEMO = "local-demo";
export const CLOCK_DOMAIN_FIXTURE = "fixture-wall";
export const CONTACT_EMAIL = SHARED_CONTACT;
export const CORRESPONDENCE_PATH = SHARED_CORRESPONDENCE;

/** Correspondence-aligned event kinds used on the board ledger. */
export const EVENT_KINDS = SHARED_EVENT_KINDS;

/** How the opportunity is funded. Unfunded demos must stay labelled. */
export const FUNDING_CLASS = Object.freeze({
  demonstration: "demonstration",
  sponsored: "sponsored",
  external: "external",
});

export const JOB_STATUS = Object.freeze({
  open: "open",
  proposed: "proposed",
  in_review: "in_review",
  completed: "completed",
  corrected: "corrected",
  closed: "closed",
});

export const PROPOSAL_STATUS = Object.freeze({
  submitted: "submitted",
  superseded: "superseded",
  rejected: "rejected",
  accepted: "accepted",
});

export const ERROR_CODES = Object.freeze({
  unknown_job: "unknown_job",
  stale_version: "stale_version",
  conflict: "conflict",
  missing_artifact: "missing_artifact",
  invalid_artifact: "invalid_artifact",
  invalid_input: "invalid_input",
  duplicate_agent_proposal: "duplicate_agent_proposal",
  unsupported_funding: "unsupported_funding",
});
