/** S185 product schemas — composition only; parsers live in vendor/. */

export const INPUT_SCHEMA = "pilot.s185.distribution_repair_input.v1";
export const RESULT_SCHEMA = "pilot.s185.distribution_repair_result.v1";
export const NEXT_RUN_SCHEMA = "pilot.s185.distribution_repair_next_run.v1";
export const FEED_SCHEMA = "pilot.nl.record.dist_repair_feed.v1";
export const JOIN_SCHEMA = "pilot.nl.distribution.join_record_result.v1";
export const PACKAGE_ID = "distribution-repair";
export const SESSION = "s185";

export const PINS = Object.freeze({
  nl06: "76c0732b241beaa569f05a7394fdbf49604ffb66",
  dist08: "ea000772cdbd6d5df7174369dcef9aa2270e5723",
  firstUse: "ea2938cfa68dadbe20a9d5ec096f315e59f4cdbe",
  record04: "0e703bd4682894df4e1d25c61b594cac49f2463c",
  record04ExportBase: "8b8e44376e9414f540483a526b048beb9e4dc370",
  record05: "a7e2cd7a2223e2aa7e7e09eebf3695aba4731205",
  baseHead: "2b80f38a4e5ec5f080d1764de7c539af63190012",
  s176Frozen: "f3d55e54a7b3c548943312443f9f066652d83980",
});

export const STATUS = Object.freeze({
  DIAGNOSED: "diagnosed",
  PARTIAL: "partial",
  MISMATCH: "mismatch",
  UNKNOWN: "unknown",
  INCOMPLETE_CATALOG: "incomplete_catalog",
  MISSING_RECORD: "missing_record",
  MALFORMED: "malformed",
});

export const PROVIDERS = Object.freeze(["grexal", "agensi"]);
export const SOURCE_TAGS = Object.freeze(["grexal", "agensi", "catalog", "manual"]);

export const SCOPE_NOTE =
  "Owner repair guidance from caller-supplied discovery/listing snapshots and a baseline+current route pair. Incomplete captures cannot prove global removal. Diagnosis is not proof of lost customers or revenue. Not a production acquisition claim.";

export const MUTATION_BOUNDARY =
  "Isolated feature-branch source/tests only. Root owns merge, publication, listing mutations, and paid actions. No CloudAgent. No paid invoke. No Grexal/Agensi login mutations.";

export const INPUT_SCHEMA_DOC = Object.freeze({
  schema: INPUT_SCHEMA,
  required: ["identity"],
  identity: {
    provider: "grexal|agensi (required for a join; never inferred as universal Grexal)",
    jobRef: "caller job namespace (required with provider unless sharedEvidenceId set)",
    sharedEvidenceId: "optional shared evidence namespace",
    sourceTag: "catalog|grexal|agensi|manual",
  },
  discovery: {
    captureStatus: "ok|partial|unavailable|failed",
    catalogComplete: "boolean; false → incomplete_catalog (cannot prove global unlisting)",
    listing: { url: "string", agentId: "string", listingStatus: "string", freeVsPriced: "string" },
    acquisitionEvidence: "optional DIST-04 shaped events; otherwise derived from identity (labeled, not live traffic)",
    identity: "optional override; unrelated sources must not join",
  },
  record: {
    routeRegressionInput: "x402.r2.record.route_regression_input.v1 { baseline, current }",
    feed: "optional already-built pilot.nl.record.dist_repair_feed.v1",
    identity: "optional override vs discovery identity",
  },
  clock: "optional ISO-8601; tests freeze this",
  notes: [
    "Identity is provider / jobRef / sharedEvidenceId — never a filename.",
    "Missing required identity → unknown/partial; do not default to Grexal.",
    "Missing record pair/feed → missing_record.",
    "This package is free offline diagnosis; priced execution is not invoked.",
  ],
});
