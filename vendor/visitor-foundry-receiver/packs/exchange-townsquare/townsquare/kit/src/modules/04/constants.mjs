/** R2-TOWNSQUARE-04 — Task subscription pull filters (no polling daemon). */

export const PACKAGE_ID = "R2-TOWNSQUARE-04";
export const SCHEMA =
  "neomorphic.r2.townsquare.task_subscription_query.v1";

export const QUERY_STATUS = Object.freeze({
  READY: "ready",
  PARTIAL: "partial",
  REJECTED: "rejected",
});

export const ERROR_CODES = Object.freeze({
  INVALID_INPUT: "invalid_input",
  INVALID_CURSOR: "invalid_cursor",
  FORBIDDEN_CLAIM: "forbidden_claim",
  MISSING_REQUIREMENT: "missing_requirement",
});

/** Same forbidden invented demand/revenue fields as Townsquare-01..03 / Exchange. */
export const FORBIDDEN_FIELDS = Object.freeze([
  "buyerCount",
  "revenue",
  "earnedUsd",
  "earnedUsdc",
  "rankingScore",
  "reputation",
  "escrowBalance",
  "claimAuthority",
]);

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export const REUSE_FROM = Object.freeze({
  townSquareListLatestChanges:
    "scripts/scale-lab/town-square listLatestChanges / cursor+page idea (taskId filter only)",
  notEquivalentTo: Object.freeze([
    "town-square listLatestChanges (no capability/deadline/unread filters)",
    "R2-TOWNSQUARE-01",
    "R2-TOWNSQUARE-02",
    "R2-TOWNSQUARE-03",
    "any polling daemon / setInterval feed",
  ]),
});

export const CONSUMER_INSTRUCTIONS =
  "Pull a finite page of task updates matching subscription filters (capability overlap, deadline window, unread revision, optional taskIds). AND across provided filters; omit = no constraint. Updates with null/missing taskDeadline are excluded when a deadline filter is set. Pure pull — no timers, no daemon. pollingDaemon is always false. execute is always false. Do not invent buyers/revenue.";

export const ID_MAX = 128;
export const TEXT_MAX = 4000;
