/** S04 capability-market constants. No custody, ranking score, or pay-to-broadcast. */

import {
  CONTACT_EMAIL as SHARED_CONTACT,
  CORRESPONDENCE_PATH as SHARED_CORRESPONDENCE,
  LAB_API,
  LAB_PATHS,
} from "../../shared/paths.mjs";

export const SCHEMA = "neomorphic.capability-market.v1";
export const DISCLOSURE_SCHEMA = "neomorphic.capability-disclosure.v1";
export const JOURNEY_SCHEMA = "neomorphic.capability-journey.v1";
export const PAGE_PATH = LAB_PATHS.capabilities;
export const API_PATH = LAB_API.capabilities;
export const CORRESPONDENCE_PATH = SHARED_CORRESPONDENCE;
export const CONTACT_EMAIL = SHARED_CONTACT;

export const LAYERS = Object.freeze({
  ADVERTISED: "advertised",
  RUNNABLE: "runnable",
  EVIDENCE: "evidence",
});

export const SELLER_CLASS = Object.freeze({
  OPERATOR: "operator",
  FIXTURE_DEMO: "fixture_demo",
});

export const PRICE_SOURCE = Object.freeze({
  SAMEDAYDESK_BATCH_QUOTE: "samedaydesk.extract-batch.quote",
  SAMEDAYDESK_OFFER_SURFACE: "samedaydesk.offer-surface",
  NEOMORPHIC_SERVICE: "neomorphic.service.record",
  NEOMORPHIC_LAB_TRIAL: "neomorphic.private-trial-request.v1",
  FIXTURE_DEMO: "fixture.demo.not-a-live-offer",
});

export const ROUTE_KIND = Object.freeze({
  EXTERNAL_COMPLETION: "external_completion_link",
  LOCAL_LAB: "local_lab",
  CORRESPONDENCE: "correspondence",
  FIXTURE_DEMO: "fixture_demo",
});

export const MATCH_REFUSAL = Object.freeze({
  MALFORMED_CAPABILITY: "malformed_capability",
  DECEPTIVE_CAPABILITY: "deceptive_capability",
  STALE_PRICE: "stale_price",
  INCOMPATIBLE_INPUT: "incompatible_input",
  NO_RESULT: "no_result",
  UNSAFE_URL: "unsafe_url",
});

/** Clock used for freshness; fixture clock is explicit, not wall-clock authority. */
export const CLOCK_DOMAIN_FIXTURE = "fixture";
export const CLOCK_DOMAIN_OBSERVED = "observed";

export const FORBIDDEN_FIELDS = Object.freeze([
  "reviews",
  "rating",
  "rankScore",
  "universalRank",
  "payToBroadcast",
  "escrow",
  "custody",
  "reputationScore",
]);
