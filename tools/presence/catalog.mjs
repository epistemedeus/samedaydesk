import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_ORIGIN = "https://agents.samedaydesk.com";
export const OPENAPI_PATH = "/openapi.json";
export const X402_PATH = "/.well-known/x402.json";
export const MCP_PATH = "/mcp";

export const DEFAULT_FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/presence",
);

export function openApiUrl(origin = DEFAULT_ORIGIN) {
  return new URL(OPENAPI_PATH, `${origin.replace(/\/$/, "")}/`).href;
}

export function x402Url(origin = DEFAULT_ORIGIN) {
  return new URL(X402_PATH, `${origin.replace(/\/$/, "")}/`).href;
}

export function mcpUrl(origin = DEFAULT_ORIGIN) {
  return new URL(MCP_PATH, `${origin.replace(/\/$/, "")}/`).href;
}

export function loadJsonFile(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function originFromOpenApi(openapi) {
  const listed = openapi?.servers?.[0]?.url;
  if (!listed) return DEFAULT_ORIGIN;
  return String(listed).replace(/\/$/, "");
}

function protocolBlock(protocols, key) {
  if (!Array.isArray(protocols)) return null;
  for (const entry of protocols) {
    if (entry && typeof entry === "object" && entry[key]) return entry[key];
  }
  return null;
}

export function paidOperationsFromOpenApi(openapi) {
  const origin = originFromOpenApi(openapi);
  const operations = [];
  for (const [path, methods] of Object.entries(openapi?.paths || {})) {
    if (!methods || typeof methods !== "object") continue;
    for (const [method, op] of Object.entries(methods)) {
      if (!op || typeof op !== "object") continue;
      const payment = op["x-payment-info"];
      if (!payment) continue;
      const x402 = protocolBlock(payment.protocols, "x402");
      const mpp = protocolBlock(payment.protocols, "mpp");
      operations.push({
        method: String(method).toUpperCase(),
        path,
        operationId: op.operationId || null,
        summary: op.summary || "",
        origin,
        priceUsd: payment.price?.amount ?? null,
        priceCurrency: payment.price?.currency ?? null,
        asset: x402?.asset || mpp?.currency || null,
        network: x402?.network || mpp?.network || null,
        scheme: x402?.scheme || null,
        x402: x402 || null,
        mpp: mpp || null,
        protocols: payment.protocols || [],
      });
    }
  }
  return {
    origin,
    version: openapi?.info?.version || null,
    title: openapi?.info?.title || null,
    description: openapi?.info?.description || "",
    serviceInfo: openapi?.["x-service-info"] || null,
    operations,
  };
}

export function itemsFromX402(manifest) {
  const items = [];
  for (const item of manifest?.items || []) {
    const accept = Array.isArray(item.accepts) && item.accepts[0] ? item.accepts[0] : {};
    const method = String(item.request?.method || "GET").toUpperCase();
    const path = item.resource?.routeTemplate || pathOf(item.request?.url);
    items.push({
      method,
      path,
      resourceUrl: item.request?.url || null,
      exampleUrl: item.resource?.url || null,
      description: item.resource?.description || "",
      serviceName: item.resource?.serviceName || null,
      mimeType: item.resource?.mimeType || null,
      tags: item.resource?.tags || [],
      iconUrl: item.resource?.iconUrl || null,
      accepts: item.accepts || [],
      amount: accept.amount ?? null,
      asset: accept.asset ?? null,
      network: accept.network ?? null,
      payTo: accept.payTo ?? null,
      scheme: accept.scheme ?? null,
      extra: accept.extra ?? null,
      facilitator: accept.facilitator ?? accept.extra?.facilitator ?? null,
      raw: item,
    });
  }
  return {
    x402Version: manifest?.x402Version ?? null,
    lastUpdated: manifest?.lastUpdated ?? null,
    items,
  };
}

export function pathOf(urlLike) {
  if (!urlLike) return null;
  try {
    const url = new URL(urlLike, DEFAULT_ORIGIN);
    const path = url.pathname.replace(/\/$/, "") || "/";
    return path.startsWith("/") ? path : `/${path}`;
  } catch {
    const raw = String(urlLike);
    const cut = raw.split("?")[0];
    return cut.startsWith("/") ? cut.replace(/\/$/, "") || "/" : null;
  }
}

export function hostOf(urlLike) {
  try {
    return new URL(urlLike).host.toLowerCase();
  } catch {
    return "";
  }
}

export function routeKey(method, path) {
  return `${String(method || "GET").toUpperCase()} ${path}`;
}

export function unique(values) {
  return [...new Set(values.filter((value) => value != null && value !== ""))];
}

export function mergeSellerCatalog(openapi, manifest) {
  const fromOpenApi = paidOperationsFromOpenApi(openapi);
  const fromManifest = itemsFromX402(manifest);
  const byRoute = new Map();
  for (const op of fromOpenApi.operations) {
    byRoute.set(routeKey(op.method, op.path), { openapi: op, manifest: null });
  }
  for (const item of fromManifest.items) {
    const key = routeKey(item.method, item.path);
    const existing = byRoute.get(key) || { openapi: null, manifest: null };
    existing.manifest = item;
    byRoute.set(key, existing);
  }

  const routes = [...byRoute.entries()]
    .map(([id, pair]) => {
      const openapiOp = pair.openapi;
      const manifestItem = pair.manifest;
      return {
        id,
        method: manifestItem?.method || openapiOp?.method,
        path: manifestItem?.path || openapiOp?.path,
        operationId: openapiOp?.operationId || null,
        summary: openapiOp?.summary || "",
        description: manifestItem?.description || openapiOp?.summary || "",
        origin: fromOpenApi.origin,
        resourceUrl: manifestItem?.resourceUrl || `${fromOpenApi.origin}${openapiOp?.path || ""}`,
        exampleUrl: manifestItem?.exampleUrl || null,
        priceUsd: openapiOp?.priceUsd ?? null,
        priceCurrency: openapiOp?.priceCurrency ?? null,
        amount: manifestItem?.amount ?? null,
        asset: manifestItem?.asset || openapiOp?.asset || null,
        network: manifestItem?.network || openapiOp?.network || null,
        payTo: manifestItem?.payTo || null,
        scheme: manifestItem?.scheme || openapiOp?.scheme || null,
        facilitator: manifestItem?.facilitator || null,
        accepts: manifestItem?.accepts || [],
        protocols: openapiOp?.protocols || [],
        mpp: openapiOp?.mpp || null,
        x402: openapiOp?.x402 || null,
        serviceName: manifestItem?.serviceName || null,
        iconUrl: manifestItem?.iconUrl || null,
        tags: manifestItem?.tags || [],
        mimeType: manifestItem?.mimeType || null,
        rawManifest: manifestItem?.raw || null,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const discoveryRoutes = routes.filter((route) => route.rawManifest);
  return {
    origin: fromOpenApi.origin,
    host: hostOf(fromOpenApi.origin),
    openapiVersion: fromOpenApi.version,
    title: fromOpenApi.title,
    description: fromOpenApi.description,
    serviceInfo: fromOpenApi.serviceInfo,
    x402Version: fromManifest.x402Version,
    lastUpdated: fromManifest.lastUpdated,
    payTo: unique(discoveryRoutes.map((route) => route.payTo)),
    asset: unique(discoveryRoutes.map((route) => route.asset)),
    network: unique(discoveryRoutes.map((route) => route.network)),
    paidOperationCount: fromOpenApi.operations.length,
    discoveryItemCount: fromManifest.items.length,
    routes,
    discoveryRoutes,
    operations: fromOpenApi.operations,
  };
}

export function catalogByPath(catalog) {
  const map = new Map();
  for (const route of catalog.discoveryRoutes) {
    if (!map.has(route.path)) map.set(route.path, route);
  }
  return map;
}
