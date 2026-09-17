/** R14-07: bind listing-repair oracle to real useful-jobs 1.4.7 repair-packet.json. */

export const PACKAGE_ID = "R14-07-SDS-LISTING-REPAIR-BIND";
export const VERDICT_SCHEMA = "sds.listing_repair_verifier.verdict.v1";
export const SOURCE_SCHEMA = "sds.listing_repair.source_observation.v1";
export const BIND_SCHEMA = "sds.listing_repair.bind.v1";
export const PACKET_SCHEMA = "s233.useful-application.artifact.v1";
export const LISTING_INPUT_SCHEMA = "pilot.s185.distribution_repair_input.v1";
export const APP_ID = "listing-repair-packet";

export const FORBIDDEN_COMPLETION_LABEL = "actual_completion";

export const COMPLETION_LABEL = Object.freeze({
  FIXTURE_DEMO: "fixture_demo",
  LOCAL_RUN_OK: "local_run_ok",
});

export const LANE = Object.freeze({
  EVIDENCE: "evidence",
  SUGGESTION: "suggestion",
  PUBLISH: "publish",
  ACCEPTED_CORRECTION: "accepted_correction",
});

export const REASON = Object.freeze({
  MISSING_SOURCE_OBSERVATION: "missing_source_observation",
  SOURCE_LOCATOR_MISMATCH: "source_locator_mismatch",
  SOURCE_DIGEST_MISMATCH: "source_digest_mismatch",
  STALE_OBSERVED_AT: "stale_observed_at",
  STALE_SOURCE_DIGEST: "stale_source_digest",
  FABRICATED_SAMPLE: "fabricated_sample",
  INVENTED_FIELD: "invented_field",
  FALSE_CORRECTION: "false_correction",
  CORRECTION_FROM_MISMATCH: "correction_from_mismatch",
  MISMATCH_NOT_CORRECTION: "mismatch_not_correction",
  MISSING_OWNER_ACTIONS: "missing_owner_actions",
  LEGACY_CORRECTIONS_SHAPE: "legacy_corrections_shape",
  INVALID_ACTION_KIND: "invalid_action_kind",
  ROUTE_REF_MISSING: "route_ref_missing",
  FALSE_ACTIONABLE: "false_actionable",
  PUBLISH_ATTEMPTED: "publish_attempted",
  LIVE_SDS_WRITE: "live_sds_write",
  FORBIDDEN_COMPLETION_LABEL: "forbidden_completion_label",
  PURCHASE_AUTHORITY_CLAIMED: "purchase_authority_claimed",
  MARKET_FACT_CLAIM: "market_fact_claim",
  NOT_147_ENVELOPE: "not_1_4_7_envelope",
  KIT_PIN_MISMATCH: "kit_pin_mismatch",
});

export const SAMPLE_LABELS = Object.freeze(["SAMPLE", "explicit-example", "sample"]);

export const OWNER_ACTION_KINDS = Object.freeze([
  "owner-repair",
  "resolve-unknown",
  "review-diagnosis",
  "complete-capture",
  "fix-identity-or-source-join",
]);

/** Pins for useful-jobs 1.4.7 listing-repair-packet (not 1.0.0 corrections[]). */
export const PINS = Object.freeze({
  usefulJobs: "1.4.7",
  archiveBytes: 5255824,
  archiveSha256: "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec",
  kitPath: "client/public/kit/useful-jobs-1.4.7.tar.gz",
  forAgentsPath: "client/public/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz",
  job: APP_ID,
  sut: "apps/listing-repair-packet",
  cliSha256: "4ccda94e10e857109377a99b52050b07ad177bb05e85ff24f0ed1d8b158ece56",
  boundarySha256: "12010bf92ef4e2836f824ffa5d3291ee2fa0e61d6a526378c71472a23b6b275e",
  cli: "node bin/useful-jobs.mjs run listing-repair-packet --input …",
  exampleCli: "node bin/useful-jobs.mjs run listing-repair-packet --example",
  mismatchInput: "samples/listing/mismatch.json",
  exampleInput: "samples/listing/caller-alpha.json",
  outputs: Object.freeze(["repair-packet.json", "repair-packet.md"]),
  packetSchema: PACKET_SCHEMA,
  purchaseAuthority: false,
  republishKit: false,
});

export const HONESTY_PACK_NOTES = Object.freeze([
  "R14-07 binds the oracle to shipped useful-jobs 1.4.7 repair-packet.json (owner-repair actions[] + source digest).",
  "Does not invent 1.0.0 corrections[] or packet.sourceObservation on engine output.",
  "SAMPLE / --example packets cannot pass as accepted_correction.",
  "samples/listing/mismatch.json cannot be accepted_correction.",
  "Mutated listing snapshot digest vs bind is stale_source_digest.",
  "Evidence, suggestion, and publish stay separate. The verifier never publishes a catalog.",
  "purchaseAuthority is always false. Kit bytes stay e2e9b44e…69dec; this pack does not republish 1.4.7.",
]);
