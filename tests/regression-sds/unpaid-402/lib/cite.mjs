/** Cite-only pins for SDS unpaid-402. Write boundary is this pack. */

export const FEATURE = "unpaid-402";
export const WRITE_BOUNDARY = "tests/regression-sds/unpaid-402/**";

export const BOUNDARY = Object.freeze({
  paymentSent: false,
  stripeOrX402: false,
  toolsCalled: false,
  liveProbe: false,
  write: WRITE_BOUNDARY,
});

/** Crawl pin for GET /extract (client/src/data/sellerConformanceCrawl.json). */
export const EXTRACT_TERMS = Object.freeze({
  amount: "5000",
  network: "eip155:8453",
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  source: "live_unpaid_402",
  route: "/extract",
  method: "GET",
  origin: "https://agents.samedaydesk.com",
  exampleUrl: "https://agents.samedaydesk.com/extract?url=https%3A%2F%2Fexample.com",
});

export const AS_OF_FIXTURE = "2026-09-03T12:00:00.000Z";
export const AS_OF_STALE = "2026-09-17T12:00:00.000Z";

export const COMMITTED_EXTRACT_CURRENT =
  "fixtures/verified-feed/observations/extract-current.json";

export const PRODUCT = Object.freeze({
  parse: "client/scripts/verifiedFeedObservation.mjs#parseUnpaid402Payload",
  observe: "client/scripts/verifiedFeedObservation.mjs#observationFromFixture",
  prior: "client/scripts/verifiedFeedObservation.mjs#observationFromPriorEvidence",
  crawl: "client/scripts/verifiedFeedObservation.mjs#buildCandidateCrawl",
  allowlist: "client/scripts/verifiedFeedObservation.mjs#assertAllowlistedUrl",
  secrets: "client/scripts/verifiedFeedObservation.mjs#assertNoSecrets",
});
