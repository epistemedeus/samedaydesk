// Received facts this path starts from. It does not re-enroll AGL, install c606,
// or relabel an older merchant pin as the installed merchant.

export const JOURNEY_SCHEMA = "samedaydesk.task-repeat-use.journey.v1";
export const COVERAGE_SCHEMA = "samedaydesk.task-repeat-use.coverage.v1";

export const AGL_ROOT = Object.freeze({
  id: "AGL-ROOT15599",
  pr: 377,
  head: "f168ee158428d7e5bcc086f011ec3bca05e550db",
  merge: "ba18ed20e139d950bdd470a5d4bad6b2541c3a31",
  combinedSource: "c60641e8ff2b94dd704307e57f5b6fe789ba0df7",
  predecessor: "9f6c0c4e396dd7677f334400eed93e3445fad600",
  enrollmentPath: "docs/receiving/h155030-sds-consumer-composition-20261106/ENROLLMENT.json",
  proposalPath: "docs/receiving/h155030-sds-consumer-composition-20261106/PROPOSAL.md",
  combinedResultPath: "docs/receiving/h155060-sds-combined-release-qualification-20261106/RESULT.md",
  installedAtThatReceiving: false,
});

// Operating STATE at pilot 9a85c34. This path does not call Railway.
export const INSTALLED_MERCHANT = Object.freeze({
  id: "9fba328c",
  railway: "9a8c2f97",
  runtime: "1.23.55",
  paidMpp: "off",
  rail: "x402",
  source: "pilot overview/STATE.md@9a85c34af020feebaac5e653987f190ab0ab0d5c",
  calledByThisPath: false,
});

// Older in-tree pins. They stay distinct from the installed merchant.
export const MACHINE_ENTRY_MERCHANT_PIN = "ef46e2b5213b9436e5cc4339a159c8ae837db880";
export const RECIPE_MERCHANT_PIN = "f9dd59aeeb200881bc1313ed846ba002e7081258";

export const ACCEPTED_WORK_RAIL = "9bb30906";
export const PUBLIC_PREFIX = "/api/neomorphic-contributor-journey";
export const PUBLIC_ACCEPTED_WORK = `${PUBLIC_PREFIX}/v1/market/accepted-work`;

export const RECIPE_ID = "verification-reconcile";
export const RECIPE_VERSION = "samedaydesk.recurring-job-recipe-result.v1";
// Later consumer clock for the retained portable decision.
export const CLOCK = "2026-11-06T12:00:00.000Z";
// The public prior is 2026-09-08T12:00:00.000Z. A 168-hour horizon only yields a
// useful unchanged/changed body inside that window. This is the same instant
// the merged AGL verification fixture uses.
export const RECIPE_CLOCK = "2026-09-09T08:00:00.000Z";
export const HORIZON_HOURS = 168;
export const TASK_ID = "walletless-public-verify";
export const SUBJECT = "example-domain-observation";
