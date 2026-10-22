/**
 * Classify unpaid-402 fixtures with the shipped SDS observation parser.
 * Never pays, never sends PAYMENT-SIGNATURE, never live-probes.
 */
import {
  assertAllowlistedUrl,
  assertNoSecrets,
  buildCandidateCrawl,
  loadAllowlistedProbeUrls,
  observationFromFixture,
  observationFromPriorEvidence,
  parseUnpaid402Payload,
} from "../../../../client/scripts/verifiedFeedObservation.mjs";
import crawl from "../../../../client/src/data/sellerConformanceCrawl.json" with { type: "json" };
import { AS_OF_FIXTURE, AS_OF_STALE, EXTRACT_TERMS } from "./cite.mjs";

function bodyText(http) {
  if (!http || http.body == null) return "";
  if (typeof http.body === "string") return http.body;
  return JSON.stringify(http.body);
}

function failureCode(failure) {
  if (!failure) return "failed";
  const detail = String(failure.detail || "");
  if (
    detail === "missing_accepts" ||
    detail === "malformed_accept" ||
    detail === "body_not_json"
  ) {
    return detail;
  }
  if (failure.kind === "http_status") return detail || "http_status";
  return failure.kind;
}

function accept(code, message, extra = {}) {
  return {
    verdict: "accept",
    reject: false,
    code,
    message,
    reasons: extra.reasons || [code],
    product: extra.product || null,
    paymentSent: false,
  };
}

function reject(code, message, extra = {}) {
  return {
    verdict: "reject",
    reject: true,
    code,
    message,
    reasons: extra.reasons || [code],
    product: extra.product || null,
    paymentSent: false,
  };
}

function extractProbe() {
  const probes = loadAllowlistedProbeUrls();
  const probe = probes.find((row) => row.route === EXTRACT_TERMS.route && row.method === "GET");
  if (!probe) {
    throw new Error("allowlisted GET /extract probe missing from product manifest");
  }
  return probe;
}

function extractCrawlRow() {
  return (crawl.routes || []).find(
    (row) => row.route === EXTRACT_TERMS.route && row.method === EXTRACT_TERMS.method,
  );
}

function parseHttp(fixture) {
  const http = fixture.http || {};
  const parsed = parseUnpaid402Payload({
    status: http.status,
    headers: http.headers || {},
    bodyText: bodyText(http),
  });
  if (!parsed.ok) {
    return reject(failureCode(parsed.failure), "unpaid-402 payload is not a current live contract", {
      product: parsed,
      reasons: [parsed.failure.kind, parsed.failure.detail].filter(Boolean),
    });
  }
  const unpaid = parsed.observation?.unpaid402 || {};
  const termsMatch =
    unpaid.amount === EXTRACT_TERMS.amount &&
    unpaid.network === EXTRACT_TERMS.network &&
    unpaid.asset === EXTRACT_TERMS.asset &&
    unpaid.source === EXTRACT_TERMS.source;
  if (!termsMatch) {
    return reject("terms_mismatch", "402 accepts do not match committed GET /extract crawl terms", {
      product: parsed.observation,
      reasons: ["terms_mismatch", `amount_${unpaid.amount}`, `network_${unpaid.network}`],
    });
  }
  return accept("current_unpaid_402", "Valid unpaid 402 contract; pack does not pay.", {
    product: parsed.observation,
    reasons: ["current_unpaid_402", "live_unpaid_402"],
  });
}

function classifyObservation(fixture) {
  const probe = extractProbe();
  const asOf = fixture.asOf || AS_OF_FIXTURE;
  const obs = observationFromFixture(probe, asOf, fixture.observation || fixture);
  if (obs.status === "current" && obs.lastObservation?.unpaid402?.source === "live_unpaid_402") {
    const unpaid = obs.lastObservation.unpaid402;
    const termsMatch =
      unpaid.amount === EXTRACT_TERMS.amount &&
      unpaid.network === EXTRACT_TERMS.network &&
      unpaid.asset === EXTRACT_TERMS.asset;
    if (!termsMatch) {
      return reject("terms_mismatch", "current observation terms do not match crawl pin", {
        product: obs,
        reasons: ["terms_mismatch"],
      });
    }
    return accept("current_unpaid_402", "Fixture observation is current unpaid 402.", {
      product: obs,
      reasons: ["current_unpaid_402"],
    });
  }
  const code = obs.failure ? failureCode(obs.failure) : obs.status || "failed";
  return reject(code, `observation status ${obs.status} is not a current unpaid-402 claim`, {
    product: obs,
    reasons: [obs.status, obs.failure?.kind, obs.failure?.detail].filter(Boolean),
  });
}

function classifyPrior(fixture) {
  const source = extractCrawlRow();
  if (!source) return reject("missing_crawl", "GET /extract missing from seller-conformance crawl");
  const asOf = fixture.asOf || AS_OF_STALE;
  const row = fixture.crawlOverride ? { ...source, ...fixture.crawlOverride } : source;
  const obs = observationFromPriorEvidence(row, asOf);
  if (obs.status === "current") {
    return accept("current_unpaid_402", "Prior evidence timestamp still matches asOf.", {
      product: obs,
      reasons: ["current_unpaid_402", "prior_crawl_evidence"],
    });
  }
  return reject(obs.status || "stale", `prior unpaid-402 evidence is ${obs.status}; cannot keep a current claim`, {
    product: obs,
    reasons: [obs.status, "no_current_claim"],
  });
}

function classifyCandidateCrawl(fixture) {
  const source = extractCrawlRow();
  if (!source) return reject("missing_crawl", "GET /extract missing from seller-conformance crawl");
  const asOf = fixture.asOf || AS_OF_STALE;
  const obs = observationFromPriorEvidence(source, asOf);
  const candidate = buildCandidateCrawl(crawl, [obs], asOf);
  const extract = (candidate.routes || []).find((row) => row.route === EXTRACT_TERMS.route);
  const keptCurrent =
    extract &&
    extract.lastVerified != null &&
    extract.unpaid402?.source === "live_unpaid_402";
  if (keptCurrent) {
    return accept("stale_kept_as_current", "Candidate crawl copied stale lastVerified into a current claim.", {
      product: { obs, extract },
      reasons: ["stale_kept_as_current"],
    });
  }
  return reject("stale_current_claim", "Stale/unrechecked unpaid-402 cannot keep lastVerified on the candidate crawl.", {
    product: {
      observationStatus: obs.status,
      lastVerified: extract?.lastVerified ?? null,
      unpaid402Source: extract?.unpaid402?.source ?? null,
    },
    reasons: ["stale_current_claim", obs.status, "lastVerified_null"],
  });
}

function classifyAllowlist(fixture) {
  const probes = loadAllowlistedProbeUrls();
  try {
    assertAllowlistedUrl(fixture.exampleUrl, probes);
    return accept("allowlisted", "URL is an exact SameDayDesk unpaid-402 example.", {
      product: { exampleUrl: fixture.exampleUrl },
      reasons: ["allowlisted"],
    });
  } catch (error) {
    return reject("ssrf_blocked", error.message, {
      product: { exampleUrl: fixture.exampleUrl, error: error.message },
      reasons: ["ssrf_blocked"],
    });
  }
}

function classifySecrets(fixture) {
  try {
    assertNoSecrets(fixture.material ?? fixture.http ?? fixture);
    return accept("no_secrets", "No payment-signature or credential material.", {
      product: { scanned: true },
      reasons: ["no_secrets"],
    });
  } catch (error) {
    return reject("secret_material", error.message, {
      product: { error: error.message },
      reasons: ["secret_material", "payment_header_refuse"],
    });
  }
}

export function classifyUnpaid402(fixture) {
  const evaluate = fixture?.evaluate || "parse-payload";
  if (evaluate === "parse-payload") return parseHttp(fixture);
  if (evaluate === "observation-fixture") return classifyObservation(fixture);
  if (evaluate === "prior-evidence") return classifyPrior(fixture);
  if (evaluate === "candidate-crawl") return classifyCandidateCrawl(fixture);
  if (evaluate === "allowlist") return classifyAllowlist(fixture);
  if (evaluate === "secrets") return classifySecrets(fixture);
  return reject("unknown_evaluate", `unknown evaluate ${evaluate}`);
}

export { failureCode, EXTRACT_TERMS, crawl };
