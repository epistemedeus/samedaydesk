import { createHash } from "node:crypto";
import crawl from "../src/data/sellerConformanceCrawl.json" with { type: "json" };

export const FEED_SCHEMA_VERSION = "samedaydesk.x402-verified-feed.v1";
export const FEED_QA = Object.freeze({
  owner: "Pilot Firstmate",
  label: "internal",
});

export const FEED_LIMITATIONS = Object.freeze([
  "This feed is build-time inspection evidence from the committed seller-conformance crawl and repair-brief registry.",
  "A verified badge means OpenAPI, the unpaid 402 output schema, and the CDP Bazaar row were present and agreed in that crawl. It is not a certificate or runtime monitor.",
  "POST routes were not transmitted. Missing Bazaar rows are incomplete discovery, not a payment-integrity failure.",
]);

export function sha256Stable(value) {
  const payload =
    value && typeof value === "object" && !Array.isArray(value)
      ? JSON.stringify(value, Object.keys(value).sort())
      : JSON.stringify(value);
  return createHash("sha256").update(payload).digest("hex");
}

export function formatAtomicUsdc(amount) {
  if (!amount || !/^[0-9]+$/.test(amount)) return null;
  const whole = amount.padStart(7, "0");
  const integer = whole.slice(0, -6).replace(/^0+(?=\d)/, "") || "0";
  const frac = whole.slice(-6).replace(/0+$/, "");
  return frac ? `${integer}.${frac} USDC` : `${integer} USDC`;
}

export function assignBadge(agreement, conflict) {
  if (agreement.openapi && agreement.unpaid402OutputSchema && agreement.cdpBazaarRow) {
    return "verified";
  }
  if (conflict) return "drift";
  return "unverified";
}

export function bazaarAgrees(route) {
  const row = route.cdpBazaar;
  if (!row) return { agrees: false, conflict: false };
  const amountMatch = row.amount === route.unpaid402.amount;
  const networkMatch = row.network === route.unpaid402.network;
  const keysMatch =
    JSON.stringify(row.outputExampleKeys) === JSON.stringify(route.outputExampleKeys);
  const agrees = amountMatch && networkMatch && keysMatch;
  return { agrees, conflict: !agrees };
}

export function routeFromCrawl(route) {
  const { agrees, conflict } = bazaarAgrees(route);
  const agreement = {
    openapi: route.openapiPresent,
    unpaid402OutputSchema: route.unpaid402OutputSchemaPresent,
    cdpBazaarRow: agrees,
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
    agreement,
    badge: assignBadge(agreement, conflict),
    registryStatus: route.registryStatus,
  };
}

function normalizeBriefDate(observedAt) {
  const match = String(observedAt).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function networkFromBriefPrice(livePrice) {
  if (!/base/i.test(livePrice)) return null;
  if (livePrice.includes("Polygon")) return "Base or Polygon";
  if (livePrice.includes("Solana")) return "Base or Solana";
  return "eip155:8453";
}

export function routeFromRepairBrief(brief) {
  const network = networkFromBriefPrice(brief.livePrice);
  const agreement = {
    openapi: true,
    unpaid402OutputSchema: false,
    cdpBazaarRow: false,
  };
  return {
    seller: brief.seller,
    route: brief.route,
    origin: brief.origin,
    method: brief.method,
    price: {
      amount: null,
      display: brief.livePrice,
      asset: "USDC",
      network,
      source: "repair_brief",
    },
    network,
    lastVerified: normalizeBriefDate(brief.observedAt),
    contractHash: sha256Stable({
      id: brief.id,
      observedContract: brief.observedContract,
    }),
    agreement,
    badge: assignBadge(agreement, true),
    registryStatus: "finding",
  };
}

export function generateVerifiedFeed(generatedAt = crawl.checkedAt) {
  const fromCrawl = crawl.routes.map(routeFromCrawl);
  const fromBriefs = (crawl.findings || []).map(routeFromRepairBrief);
  return {
    schemaVersion: FEED_SCHEMA_VERSION,
    generatedAt,
    qa: FEED_QA,
    limitations: FEED_LIMITATIONS,
    routes: [...fromCrawl, ...fromBriefs],
  };
}

export function greenRegistryRoutes() {
  return crawl.routes.filter((route) => route.registryStatus === "green");
}

export function feedIncludesEveryGreenRoute(feed) {
  const keys = new Set(feed.routes.map((route) => `${route.method} ${route.origin}${route.route}`));
  return greenRegistryRoutes().every((route) =>
    keys.has(`${route.method} ${route.origin}${route.route}`),
  );
}

export { crawl };
