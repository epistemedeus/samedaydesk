/** R14-01 SDS listing-repair verifier — useful-jobs 1.4.7 owner-repair actions oracle. */

export const PACKAGE_ID = "R14-01-SDS-LISTING-REPAIR-VERIFIER";
export const VERDICT_SCHEMA = "sds.listing_repair_verifier.verdict.v1";
export const SOURCE_SCHEMA = "sds.listing_repair.source_observation.v1";
export const PACKET_SCHEMA = "s233.useful-application.artifact.v1";
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
  GLOBAL_UNLIST_CLAIM: "global_unlist_claim",
  SOURCE_OBSERVED_AT_MISMATCH: "source_observed_at_mismatch",
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
  cli: "node bin/useful-jobs.mjs run listing-repair-packet --input …",
  exampleCli: "node bin/useful-jobs.mjs run listing-repair-packet --example",
  guide: "https://samedaydesk.com/for-agents/useful-jobs",
  purchaseAuthority: false,
  neoPort: {
    repo: "epistemedeus/neomorphic-io",
    pr: 51,
    commit: "dbf5bac12dd11c766a772ff479779ac318667391",
    note: "Adapted from packs/listing-repair-verifier; bind to 1.4.7 actions not corrections[]",
  },
  packetSchema: PACKET_SCHEMA,
  outputs: Object.freeze(["repair-packet.json", "repair-packet.md"]),
});

export const DEMO_CLOCK_ISO = "2026-09-11T12:00:00.000Z";
export const STALE_OBSERVED_AT_ISO = "2026-09-01T00:00:00.000Z";
export const PACKET_AS_OF_ISO = "2026-09-11T12:00:00.000Z";
export const STALE_AS_OF_ISO = "2026-09-11T18:00:00.000Z";

export const OK_LISTING_URL = "https://example.test/listing/operator-alpha";
export const OK_SOURCE_FILE = "fixtures/ok/ok-source.json";

export const HONESTY_PACK_NOTES = Object.freeze([
  "Independent oracle over useful-jobs 1.4.7 listing-repair-packet outputs; does not run the SDS engine.",
  "1.4.7 packets use owner-repair actions[], not 1.0.0 corrections[].",
  "SAMPLE / --example packets cannot pass as accepted_correction.",
  "Evidence, suggestion, and publish stay separate. The verifier never publishes a catalog.",
  "ok:true is local_run_ok — never a sale or actual_completion.",
  "purchaseAuthority is always false.",
]);
