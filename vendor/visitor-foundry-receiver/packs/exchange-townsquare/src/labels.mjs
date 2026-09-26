/**
 * Honesty labels for the Exchange × TownSquare pack (S181).
 * Local gate pass is never customer adoption or external completion.
 */
export const PACKAGE_ID = "R2-EXCHANGE-TOWNSQUARE-S181";

export const COMPOSED_SCHEMA = "neomorphic.r2.exchange_townsquare.composed_journey.v1";
export const SUPPLIED_INPUT_SCHEMA = "neomorphic.r2.exchange_townsquare.supplied_input.v1";
export const SUPPLIED_JOURNEY_SCHEMA = "neomorphic.r2.exchange_townsquare.supplied_journey.v1";

export const PROVENANCE = Object.freeze({
  FIXTURE_DEMO: "fixture_demo",
  SUPPLIED_LOCAL: "supplied_local",
  EXTERNAL_DISCOVERY: "external_discovery",
});

export const COMPLETION_LABEL = Object.freeze({
  FIXTURE_DEMO: "fixture_demo",
  LOCAL_RUN_OK: "local_run_ok",
  SUPPLIED_LOCAL: "supplied_local",
});

/** Never emit. Kept so tests can assert the S177 mislabel is gone. */
export const FORBIDDEN_COMPLETION_LABEL = "actual_completion";

export const SOURCE_KIND = Object.freeze({
  STRUCTURED_TASK: "structured_task",
  TOWNSQUARE_SYNTHETIC_CONVERSATION: "townsquare_synthetic_conversation",
});

export const SUPPLIED_REASON = Object.freeze({
  REQUIREMENTS_MISSING: "requirements_missing",
  CRITERIA_UNRESOLVED: "criteria_unresolved",
  PROPOSALS_MISSING: "proposals_missing",
  ARTIFACT_MISSING: "artifact_missing",
  TOWNSQUARE_KIT_SYNTHETIC_ONLY: "townsquare_kit_synthetic_only",
  SOURCE_TASK_MISMATCH: "source_task_mismatch",
  EXTERNAL_DISCOVERY_RESERVED: "external_discovery_reserved",
  FIXTURE_DEMO_NOT_ALLOWED_ON_RUN: "fixture_demo_not_allowed_on_run",
  INVALID_INPUT: "invalid_input",
  INVALID_PROVENANCE: "invalid_provenance",
  UNKNOWN_SOURCE_KIND: "unknown_source_kind",
  MALFORMED_REQUESTER_DECISION: "malformed_requester_decision",
});

/** S166 intake stays separate — cite only. */
export const S166_INTAKE_CONTRACT_REF = Object.freeze({
  productHead: "2a65a2d7a5a59c5e9a4743e9770f11db9e88e0f5",
  packPath: "packs/external-job-intake",
  schemaHint: "pilot.s42.external_job.v1",
  note: "Cross-lab contract reference only. Do not duplicate intake adapters here.",
});

/** Demo/test deterministic clock. Real run/import defaults to Date.now() unless injected. */
export const DEMO_CLOCK_ISO = "2026-09-10T18:00:00.000Z";
export const DEMO_CLOCK_MS = Date.parse(DEMO_CLOCK_ISO);
export const demoClock = () => DEMO_CLOCK_MS;

export const TOWNSQUARE_SYNTHETIC_LIMIT =
  "TownSquare kit remains synthetic (conversation.demo:true) only. This adapter links source identity; it does not extract exchange requirements, proposals, or artifacts from arbitrary conversation.";
