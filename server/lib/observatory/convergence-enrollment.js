/**
 * Explicit enrollment for the convergence route.
 * Totals and resource rows are response data. This file names the source
 * contract: which bridge ids the Neomorphic catalog already consumes, which
 * discovery operation may be read, and which owned resource is compared.
 * The historical capture pin is a content hash. The bytes are optional input.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const CONVERGENCE_SCHEMA = "pilot.observatory-convergence.v1";

export const CLIENT_NAMED_SOURCE_IDS = Object.freeze([
  "moltjobs",
  "x402stats",
  "smithery_mcp",
]);

export const DISCOVERY = Object.freeze({
  sourceId: "cdp_x402_discovery_resources",
  method: "GET",
  origin: "https://api.cdp.coinbase.com",
  pathname: "/platform/v2/x402/discovery/resources",
  documentUrl: "https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/list-x402-resources",
  operationId: "listX402DiscoveryResources",
  type: "http",
  firstPage: Object.freeze({ limit: 20, offset: 0 }),
  maxPages: 2,
  callCounter: "l30DaysTotalCalls",
  payerCounter: "l30DaysUniquePayers",
  paidAuthority: false,
});

export function historicalPin() {
  try {
    const file = join(dirname(fileURLToPath(import.meta.url)), "historical-capture.json");
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    if (!parsed || typeof parsed.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(parsed.sha256)) return null;
    return { sha256: parsed.sha256, required: false };
  } catch {
    return null;
  }
}

export const OWNED_RESOURCES = Object.freeze([
  Object.freeze({
    resource: "https://agents.samedaydesk.com/extract",
    offeringId: "samedaydesk-extract",
    method: null,
    compatibleTask: null,
  }),
]);

export function discoveryPageUrl(page) {
  const limit = page && Number.isInteger(page.limit) ? page.limit : null;
  const offset = page && Number.isInteger(page.offset) ? page.offset : null;
  if (limit == null || offset == null || limit < 0 || offset < 0) {
    throw new Error("discovery_page_invalid");
  }
  const url = new URL(DISCOVERY.pathname, DISCOVERY.origin);
  url.searchParams.set("type", DISCOVERY.type);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  if (url.origin !== DISCOVERY.origin || url.pathname !== DISCOVERY.pathname) {
    throw new Error("discovery_url_escaped");
  }
  return url.toString();
}

export function splitBridgeEnrollment(liveSourceIds) {
  const live = Array.isArray(liveSourceIds) ? liveSourceIds.filter((id) => typeof id === "string") : [];
  return {
    enrolled: CLIENT_NAMED_SOURCE_IDS.filter((id) => live.includes(id)),
    presentNotEnrolled: live.filter((id) => !CLIENT_NAMED_SOURCE_IDS.includes(id)),
    allowedMissing: CLIENT_NAMED_SOURCE_IDS.filter((id) => !live.includes(id)),
  };
}
