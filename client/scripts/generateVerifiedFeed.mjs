import crawl from "../src/data/sellerConformanceCrawl.json" with { type: "json" };

export const FEED_SCHEMA_VERSION = "samedaydesk.x402-verified-feed.v1";
export const SAMEDAYDESK_SELLER = "SameDayDesk";
export const SAMEDAYDESK_ORIGIN = "https://agents.samedaydesk.com";
export const BAZAAR_FRESHNESS_MS = 7 * 24 * 60 * 60 * 1000;
export const FEED_QA = Object.freeze({
  owner: "Pilot Firstmate",
  label: "internal",
});

export const FEED_LIMITATIONS = Object.freeze([
  "This feed is build-time inspection evidence from the committed SameDayDesk seller-conformance crawl.",
  "A verified badge requires a current live unpaid 402 contract, an observed OpenAPI operation, and a matching CDP Bazaar row observed no more than seven days before this crawl.",
  "Routes without a live verification time and contract hash are excluded. Missing or stale Bazaar evidence is unverified, not a payment-integrity failure.",
]);

export function formatAtomicUsdc(amount) {
  if (!amount || !/^[0-9]+$/.test(amount)) return null;
  const whole = amount.padStart(7, "0");
  const integer = whole.slice(0, -6).replace(/^0+(?=\d)/, "") || "0";
  const frac = whole.slice(-6).replace(/0+$/, "");
  return frac ? `${integer}.${frac} USDC` : `${integer} USDC`;
}

function parseTimestamp(value) {
  if (typeof value !== "string" || value.length < 20) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function hasLiveContractEvidence(route, asOf = crawl.checkedAt) {
  const observedAt = parseTimestamp(route?.lastVerified);
  const cutoff = parseTimestamp(asOf);
  return Boolean(
    route &&
      route.seller === SAMEDAYDESK_SELLER &&
      route.origin === SAMEDAYDESK_ORIGIN &&
      (route.method === "GET" || route.method === "POST") &&
      typeof route.route === "string" &&
      /^\/(?!\/)/.test(route.route) &&
      observedAt !== null &&
      cutoff !== null &&
      route.lastVerified === asOf &&
      typeof route.contractHash === "string" &&
      /^[a-f0-9]{64}$/.test(route.contractHash) &&
      route.unpaid402?.source === "live_unpaid_402" &&
      typeof route.unpaid402.amount === "string" &&
      /^[0-9]+$/.test(route.unpaid402.amount) &&
      typeof route.unpaid402.asset === "string" &&
      route.unpaid402.asset.length > 0 &&
      typeof route.unpaid402.network === "string" &&
      route.unpaid402.network.length > 0 &&
      isStringArray(route.outputExampleKeys),
  );
}

export function assignBadge(agreement, conflict) {
  if (
    agreement.openapi &&
    agreement.unpaid402OutputSchema &&
    agreement.cdpBazaarRow &&
    agreement.cdpBazaarFresh
  ) {
    return "verified";
  }
  if (conflict) return "drift";
  return "unverified";
}

export function bazaarAgrees(route, asOf = crawl.checkedAt) {
  const row = route?.cdpBazaar;
  if (!row) {
    return { agrees: false, conflict: false, fresh: false, observedAt: null };
  }

  const observedAtMs = parseTimestamp(row.lastUpdated);
  const asOfMs = parseTimestamp(asOf);
  const fresh =
    observedAtMs !== null &&
    asOfMs !== null &&
    observedAtMs <= asOfMs &&
    asOfMs - observedAtMs <= BAZAAR_FRESHNESS_MS;
  const resourceMatch = row.resource === `${route.origin}${route.route}`;
  const sellerMatch = row.serviceName === SAMEDAYDESK_SELLER;
  const amountMatch = row.amount === route.unpaid402?.amount;
  const networkMatch = row.network === route.unpaid402?.network;
  const outputMatch =
    row.outputType === "json" &&
    isStringArray(row.outputExampleKeys) &&
    JSON.stringify(row.outputExampleKeys) === JSON.stringify(route.outputExampleKeys);
  const agrees = resourceMatch && sellerMatch && amountMatch && networkMatch && outputMatch;

  return {
    agrees,
    conflict: !agrees,
    fresh,
    observedAt: observedAtMs === null ? null : row.lastUpdated,
  };
}

export function routeFromCrawl(route, asOf = crawl.checkedAt) {
  if (!hasLiveContractEvidence(route, asOf)) return null;
  const { agrees, conflict, fresh, observedAt } = bazaarAgrees(route, asOf);
  const agreement = {
    openapi: route.openapiPresent === true,
    unpaid402OutputSchema: route.unpaid402OutputSchemaPresent === true,
    cdpBazaarRow: agrees,
    cdpBazaarFresh: fresh,
  };
  return {
    seller: route.seller,
    route: route.route,
    origin: route.origin,
    method: route.method,
    price: {
      amount: route.unpaid402.amount,
      display: formatAtomicUsdc(route.unpaid402.amount) || "unpaid terms not in crawl",
      asset: route.unpaid402.asset,
      network: route.unpaid402.network,
      source: route.unpaid402.source,
    },
    network: route.unpaid402.network,
    lastVerified: route.lastVerified,
    contractHash: route.contractHash,
    bazaarObservedAt: observedAt,
    agreement,
    badge: assignBadge(agreement, conflict),
    registryStatus: route.registryStatus,
  };
}

export function generateVerifiedFeed(generatedAt = crawl.checkedAt, source = crawl) {
  const routes = (source.routes || [])
    .map((route) => routeFromCrawl(route, generatedAt))
    .filter((route) => route !== null);
  return {
    schemaVersion: FEED_SCHEMA_VERSION,
    generatedAt,
    qa: FEED_QA,
    limitations: FEED_LIMITATIONS,
    routes,
  };
}

export function feedContainsOnlyCurrentEvidence(feed, asOf = feed?.generatedAt) {
  if (!feed || !Array.isArray(feed.routes)) return false;
  const sourceByKey = new Map(
    crawl.routes.map((route) => [`${route.method} ${route.origin}${route.route}`, route]),
  );
  return feed.routes.every((row) => {
    const source = sourceByKey.get(`${row.method} ${row.origin}${row.route}`);
    return Boolean(source && hasLiveContractEvidence(source, asOf));
  });
}

export function feedMatchesCurrentCrawl(feed) {
  if (!feed || typeof feed.generatedAt !== "string") return false;
  return JSON.stringify(feed) === JSON.stringify(generateVerifiedFeed(feed.generatedAt));
}

export function verifiedRowsHaveCompleteEvidence(feed) {
  if (!feed || !Array.isArray(feed.routes)) return false;
  return feed.routes
    .filter((row) => row.badge === "verified")
    .every(
      (row) =>
        row.price.source === "live_unpaid_402" &&
        row.agreement.openapi === true &&
        row.agreement.unpaid402OutputSchema === true &&
        row.agreement.cdpBazaarRow === true &&
        row.agreement.cdpBazaarFresh === true &&
        parseTimestamp(row.bazaarObservedAt) !== null,
    );
}

export { crawl };
