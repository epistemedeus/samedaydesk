import { readFileSync } from "node:fs";
import { ASSET, NETWORK, PAY_TO, SCHEME } from "./pin.mjs";
import { COMMITTED_BUYER_CATALOG, COMMITTED_OBSERVATIONS, COMMITTED_X402 } from "./root.mjs";

export function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function loadCommittedX402(path = COMMITTED_X402) {
  return loadJson(path);
}

export function findCatalogItem(doc, routeTemplate) {
  const items = Array.isArray(doc?.items) ? doc.items : [];
  return items.find((item) => item?.resource?.routeTemplate === routeTemplate) || null;
}

export function originPathname(value) {
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/\/+$/, "") || "";
    return `${url.origin}${path}`;
  } catch {
    return "";
  }
}

export function offerFromCatalogItem(item) {
  if (!item || typeof item !== "object") return null;
  const accept = Array.isArray(item.accepts) ? item.accepts[0] : null;
  if (!accept) return null;
  const resourceUrl = item.resource?.url || item.request?.url || "";
  return {
    source: "committed-x402-catalog",
    routeTemplate: item.resource?.routeTemplate || null,
    resourceUrl,
    originPathname: originPathname(resourceUrl) || originPathname(item.request?.url || ""),
    method: item.request?.method || "GET",
    x402Version: 2,
    scheme: accept.scheme,
    network: accept.network,
    asset: accept.asset,
    amount: accept.amount == null ? null : String(accept.amount),
    payTo: accept.payTo,
    extra: accept.extra ?? null,
  };
}

export function loadCatalogOffer(routeTemplate, path = COMMITTED_X402) {
  const item = findCatalogItem(loadCommittedX402(path), routeTemplate);
  return offerFromCatalogItem(item);
}

export function assertSdsPin(offer) {
  const errors = [];
  if (!offer) {
    errors.push("catalog_offer_missing");
    return errors;
  }
  if (offer.scheme !== SCHEME) errors.push(`scheme_pin:${offer.scheme}`);
  if (offer.network !== NETWORK) errors.push(`network_pin:${offer.network}`);
  if (offer.asset !== ASSET) errors.push(`asset_pin:${offer.asset}`);
  if (offer.payTo !== PAY_TO) errors.push(`payTo_pin:${offer.payTo}`);
  if (typeof offer.amount !== "string" || !/^[1-9][0-9]*$/.test(offer.amount)) {
    errors.push(`amount_not_atomic_string:${offer.amount}`);
  }
  return errors;
}

export function loadBuyerCatalog(path = COMMITTED_BUYER_CATALOG) {
  return loadJson(path);
}

export function loadExtractDigest(path = COMMITTED_OBSERVATIONS) {
  const obs = loadJson(path);
  return (
    obs?.sources?.["cdp-discovery"]?.sellers?.samedaydesk?.routes?.[
      "https://agents.samedaydesk.com/extract"
    ]?.digest ?? null
  );
}
