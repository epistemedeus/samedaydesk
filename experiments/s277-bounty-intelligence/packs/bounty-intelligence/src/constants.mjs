export const SCHEMA_RECORD = "s277.bounty-intelligence.record.v1";
export const SCHEMA_REPORT = "s277.bounty-intelligence.report.v1";
export const SCHEMA_EVENT = "s277.bounty-intelligence.event.v1";
export const SCHEMA_INTEROP = "s277.bounty-intelligence.interop.v0";
export const SCHEMA_POLICY = "s277.bounty-intelligence.rank-policy.v1";

export const TEST_NOW = "2026-09-11T15:00:00.000Z";

export const USER_AGENT =
  "s277-bounty-intelligence/0.1 (keyless public read; bounded; no crawl; no claim)";

export const ADAPTERS = {
  MOLTJOBS: "moltjobs",
  FRANTIC: "frantic",
  GITHUB: "github-issues",
  NEOMORPHIC: "neomorphic-schedule",
  MOLTBOOK: "moltbook",
};

export const VENDOR_ADAPTERS = {
  moltjobs: "moltjobs_forum_list",
  frantic: "frantic_board",
  "github-issues": "github_issue_comment",
  "neomorphic-schedule": null,
  moltbook: null,
};

export const LIFECYCLE_EVENTS = [
  "discovery",
  "claim",
  "submit",
  "accept",
  "pay",
  "repeat",
];

export const FUNDING = {
  UNFUNDED: "unfunded",
  RESERVED: "reserved",
  RELEASED: "released",
  UNKNOWN: "unknown",
};

export const CLAIM_STATE = {
  CLAIMABLE_WITH_PREREQS: "claimable_with_prereqs",
  NOT_CLAIMABLE: "not_claimable",
  UNKNOWN: "unknown",
};

export const DATA_LABELS = ["fixture", "synthetic-edge", "live-capture", "derived"];

export const DEFAULT_POLICY = Object.freeze({
  schema: SCHEMA_POLICY,
  effortHours: "0",
  hourlyCostAmount: "25",
  hourlyCostAsset: "USD",
  assumedFeeBps: "0",
  fundingConfidenceReserved: "0.7",
  claimConfidenceIdentity: "0.5",
  claimConfidenceEligibility: "0.4",
  staleAfterSeconds: 604800,
  includeForumRewards: false,
  includeLabSchedule: false,
  includeUnfunded: false,
  maxUncertainty: "1",
  netReturnWeight: "1",
  uncertaintyWeight: "0.2",
  treatUsdcAsUsd: true,
});

export const MOLTJOBS_LIST_URL = "https://api.moltjobs.io/v1/jobs";
export const MOLTJOBS_STATS_URL = "https://api.moltjobs.io/v1/stats";
export const FRANTIC_BOARD_URL = "https://gofrantic.com/v1/board";
export const NEOMORPHIC_BOUNTIES_URL = "https://neomorphic.io/api/bounties.json";
export const MOLTBOOK_LIST_URL = "https://api.moltbook.com/v1/jobs?limit=5";

export const AUTH_BOUNDARIES = {
  moltjobs:
    "GET /v1/jobs is keyless list discovery. GET /v1/jobs/{id} requires auth (401 without credentials observed). This pack never bids, claims, or pays.",
  frantic:
    "POST /v1/claims requires identity (agent_kid, agent_token, verified_email_or_runx_github_identity, and eligibility). Intake uses GET /v1/board only and never claims, bids, or pays.",
  "github-issues":
    "Public GitHub API without credentials; private repos unsupported. Issue/PR prose is not a trusted price or funding field.",
  "neomorphic-schedule":
    "Lab schedule at /api/bounties.json. A listed item is not a job offer, purchase order, or promise of payment beyond its stated consideration.",
  moltbook: "api.moltbook.com is NXDOMAIN (verified 2026-09-11). No listings invented.",
};
