/** S180 capability-consumer kit — pins and honesty vocabulary. */

export const SCHEMA = "pilot.r2.capabilities.consumer_kit_s180.v1";
export const NEXT_STEP_SCHEMA = "pilot.r2.capabilities.next_step_manifest.v1";
export const TRUST_SCHEMA = "pilot.r2.capabilities.trust_lane.v1";

/** Exact S164 Heavy tip this kit consumes (Cap02/03/06). */
export const HEAVY_PIN = "8a6716482b2f240078f7b17a3cf5547f1d122302";
export const HEAVY_BRANCH = "codex/s164-capability-chat-final-20260910";

/** Exact Bot / examples / journey tips reused (interfaces finished here, not rewritten). */
export const FIRST_RUN_TIP = "de2061337100c177f0f123b970431e4e9b9a9e10";
export const EXAMPLES_TIP = "72feb5bbbb1722c3ad349ccbc420a9ebc6555e22";
export const JOURNEY_TIP = "d3e6febd284e24e547ac2249b4adba96a058e746";

export const KIT_BRANCH = "codex/s180-capability-consumer-kit-20260910";

/** Relative imports from kit/src/ (sibling Cap packages + Heavy). */
export const IMPORT_PATHS = Object.freeze({
  heavy: "../vendor/s138-capability-evidence/src/index.mjs",
  cap01: "../vendor/capabilities/01/src/index.mjs",
  cap04: "../vendor/capabilities/04/src/index.mjs",
  cap05: "../vendor/capabilities/05/src/index.mjs",
  cap07: "../vendor/capabilities/07/src/index.mjs",
  cap08: "../vendor/capabilities/08/src/index.mjs",
  firstRun: "../vendor/capabilities/first-run-s172/src/index.mjs",
  journey: "../vendor/capabilities/journey-s162/src/index.mjs",
  examples: "../vendor/capabilities/examples-s170/src/index.mjs",
});

/** Trust / evidence lanes — never collapse into one boolean. */
export const TRUST_LANE = Object.freeze({
  ADVERTISED: "advertised",
  CONTENT_BOUND: "content_bound",
  EXECUTED: "executed",
  ACCEPTED: "accepted",
  UNKNOWN: "unknown",
});

/** Cost lanes — estimates ≠ spend. */
export const COST_LANE = Object.freeze({
  CURRENCY_ESTIMATE: "currency_estimate",
  PRICE_ESTIMATE: "price_estimate",
  ACTUAL_SPEND: "actual_spend",
  UNKNOWN: "unknown",
});

export const MUTATION_BOUNDARY =
  "Feature-branch only. No public release, payment, deploy, provider reset, or overage. Finishes Cap01–08 interfaces; does not rewrite S176/S177/S178 modules.";

export const HONESTY_NOTES = Object.freeze([
  "Missing evidence is unknown — never default true/false or wildcard.",
  "content_bound means verified digests of supplied bytes + TAP shape; executionVerified is always false.",
  "Local probes run only when explicitly invoked (--probe / probe:true); no silent model/paid/network calls.",
  "Currency/price estimates are not actual spend.",
  "readyForRelease stays false; TAP/#pass does not prove execution against claimed revision.",
  "Objective local tasks may run automatically when evidence supports them; no arbitrary human-approval gate.",
]);
