import { readFileSync, existsSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const PACK_ROOT = join(here, "..");
export const REPO_ROOT = join(PACK_ROOT, "../../..");

export const SDS_ORIGIN = "https://agents.samedaydesk.com";
export const SDS_HOST = "agents.samedaydesk.com";
export const SDS_SELLER_ID = "samedaydesk";
export const CDP_DISCOVERY_SOURCE = "cdp-discovery";
export const WELLKNOWN_PATH = "/.well-known/x402.json";

export const DEFAULT_WELLKNOWN_ARTIFACT = join(REPO_ROOT, "fixtures/presence/catalog/x402.json");
export const DEFAULT_TRACKER_ARTIFACT = join(REPO_ROOT, "data/bazaar-tracker/observations.json");
export const COMPACT_WELLKNOWN = join(PACK_ROOT, "fixtures/wellknown-ops.json");
export const COMPACT_TRACKER = join(PACK_ROOT, "fixtures/tracker-sds.json");

export const EXPECTED_WELLKNOWN_COUNT = 23;
export const EXPECTED_TRACKER_COUNT = 8;
export const EXPECTED_TRACKER_PATHS = Object.freeze([
  "/deep-audit",
  "/defi/morpho-position",
  "/enrich",
  "/extract",
  "/read",
  "/scan",
  "/schemaforge",
  "/wallet-enrich",
]);
export const REQUIRED_WELLKNOWN_ONLY = Object.freeze([
  { method: "GET", path: "/commerce/settlement-proof" },
  { method: "POST", path: "/security/wallet-policy-conformance" },
]);

export const PAYMENT_STOP_PATHS = Object.freeze([
  "/api/checkout",
  "/api/stripe/webhook",
  "/checkout",
  "/mcp?cs=",
]);
export const FORBIDDEN_HEADERS = Object.freeze([
  "PAYMENT-SIGNATURE",
  "X-PAYMENT",
  "stripe-signature",
]);
export const FORBIDDEN_OUTPUT_FIELDS = Object.freeze([
  "payTo",
  "amount",
  "maxAmountRequired",
  "asset",
  "network",
  "facilitator",
]);
export const FORBIDDEN_INVENTED_FIELDS = Object.freeze([
  "loyaltyPoints",
  "throughBlock",
  "buyerEmail",
  "npsScore",
  "tipAmount",
  "uniqueVisitors",
]);

export const SEEDED = Object.freeze({
  "claim-match": { id: "claim-match", code: "CLAIM_ALIGNED" },
  "absence-as-demand": { id: "absence-as-demand", code: "ABSENCE_IS_NOT_DEMAND" },
  "ghost-tracker": { id: "ghost-tracker", code: "GHOST_TRACKER_ROUTE" },
  live: { id: "live", code: "LIVE_REFUSE" },
  "payment-signature": { id: "payment-signature", code: "PAYMENT_HEADER_REFUSE" },
});

export function normalizePath(path) {
  if (typeof path !== "string" || path.length === 0) return "";
  const cut = path.split("?")[0].split("#")[0];
  const trimmed = cut.replace(/\/+$/, "");
  if (trimmed.length === 0) return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function pathFromResource(resource) {
  if (typeof resource !== "string" || resource.length === 0) return "";
  try {
    return normalizePath(new URL(resource).pathname);
  } catch {
    return resource.startsWith("/") ? normalizePath(resource) : "";
  }
}

export function resourceFromPath(path, origin = SDS_ORIGIN) {
  return `${origin.replace(/\/$/, "")}${normalizePath(path)}`;
}

export function opKey(method, path) {
  return `${String(method || "GET").toUpperCase()} ${normalizePath(path)}`;
}

export function hostOf(urlLike) {
  try {
    return new URL(urlLike).host.toLowerCase();
  } catch {
    return "";
  }
}

export function resolvePath(path, cwd = process.cwd()) {
  if (!path) return null;
  if (isAbsolute(path)) return path;
  const fromCwd = join(cwd, path);
  if (existsSync(fromCwd)) return fromCwd;
  const fromPack = join(PACK_ROOT, path);
  if (existsSync(fromPack)) return fromPack;
  const fromRepo = join(REPO_ROOT, path);
  if (existsSync(fromRepo)) return fromRepo;
  return fromCwd;
}

export function loadJson(path) {
  const full = resolvePath(path);
  if (!full || !existsSync(full)) {
    throw new Error(`json not found: ${path}`);
  }
  return JSON.parse(readFileSync(full, "utf8"));
}

function stripQuery(urlLike) {
  if (!urlLike) return null;
  try {
    const url = new URL(urlLike);
    url.search = "";
    url.hash = "";
    return url.href.replace(/\/$/, "") === `${url.protocol}//${url.host}`
      ? url.href
      : url.href.replace(/\/$/, "");
  } catch {
    return urlLike.split("?")[0];
  }
}

function pushOp(into, seen, { method, path, resource }) {
  const normalizedPath = normalizePath(path || pathFromResource(resource));
  const normalizedMethod = String(method || "GET").toUpperCase();
  if (!normalizedPath) return;
  const key = `${normalizedMethod}\t${normalizedPath}`;
  if (seen.has(key)) return;
  seen.add(key);
  into.push({
    method: normalizedMethod,
    path: normalizedPath,
    resource: stripQuery(resource) || resourceFromPath(normalizedPath),
  });
}

export function opsFromWellKnown(doc) {
  const ops = [];
  const seen = new Set();

  if (Array.isArray(doc?.ops)) {
    for (const row of doc.ops) {
      pushOp(ops, seen, {
        method: row.method,
        path: row.path,
        resource: row.resource,
      });
    }
    return sortOps(ops);
  }

  if (Array.isArray(doc?.operations)) {
    for (const row of doc.operations) {
      pushOp(ops, seen, {
        method: row.method,
        path: row.path || pathFromResource(row.resource || row.url),
        resource: row.resource || row.url || resourceFromPath(row.path),
      });
    }
    return sortOps(ops);
  }

  if (Array.isArray(doc?.items)) {
    for (const item of doc.items) {
      const method = item?.request?.method || "GET";
      const path = item?.resource?.routeTemplate || pathFromResource(item?.request?.url || item?.resource?.url);
      const resource = item?.request?.url || item?.resource?.url || resourceFromPath(path);
      pushOp(ops, seen, { method, path, resource });
    }
    return sortOps(ops);
  }

  if (Array.isArray(doc?.resources)) {
    for (const row of doc.resources) {
      const url = typeof row === "string" ? row : row?.url || row?.resource;
      pushOp(ops, seen, {
        method: row?.method || "GET",
        path: pathFromResource(url),
        resource: url,
      });
    }
    return sortOps(ops);
  }

  throw new Error("well-known document has no items, resources, ops, or operations");
}

export function routesFromTracker(doc, sellerId = SDS_SELLER_ID) {
  if (Array.isArray(doc?.routes)) {
    return doc.routes
      .map((row) => ({
        route: row.route || row.resource,
        path: normalizePath(row.path || pathFromResource(row.route || row.resource)),
        digest: row.digest ?? null,
      }))
      .filter((row) => row.path)
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  const seller = doc?.sources?.[CDP_DISCOVERY_SOURCE]?.sellers?.[sellerId];
  if (seller) {
    return Object.keys(seller.routes || {})
      .sort()
      .map((route) => ({
        route,
        path: pathFromResource(route),
        digest: seller.routes[route]?.digest ?? null,
      }))
      .filter((row) => row.path);
  }

  if (Array.isArray(doc?.resources)) {
    return doc.resources
      .map((row) => (typeof row === "string" ? row : row?.resource || row?.url))
      .filter((route) => hostOf(route) === SDS_HOST)
      .map((route) => ({
        route,
        path: pathFromResource(route),
        digest: null,
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  throw new Error(`tracker document missing SDS seller ${sellerId}`);
}

function sortOps(ops) {
  return [...ops].sort((left, right) => opKey(left.method, left.path).localeCompare(opKey(right.method, right.path)));
}

export function loadWellKnown(path = DEFAULT_WELLKNOWN_ARTIFACT) {
  const full = resolvePath(path) || path;
  const doc = loadJson(full);
  return {
    path: full,
    source: relativeToRepo(full),
    x402Version: doc?.x402Version ?? null,
    lastUpdated: doc?.lastUpdated ?? null,
    ops: opsFromWellKnown(doc),
  };
}

export function loadTracker(path = DEFAULT_TRACKER_ARTIFACT) {
  const full = resolvePath(path) || path;
  const doc = loadJson(full);
  const seller = doc?.sources?.[CDP_DISCOVERY_SOURCE]?.sellers?.[SDS_SELLER_ID];
  return {
    path: full,
    source: relativeToRepo(full),
    observedAt: doc?.observedAt ?? doc?.observedAt ?? null,
    captureSource: doc?.captureSource ?? null,
    schema: doc?.schema ?? null,
    sellerId: SDS_SELLER_ID,
    partial: Boolean(seller?.partial),
    routes: routesFromTracker(doc),
  };
}

export function relativeToRepo(path) {
  const full = String(path);
  if (full.startsWith(REPO_ROOT)) return full.slice(REPO_ROOT.length).replace(/^\//, "");
  if (full.startsWith(PACK_ROOT)) {
    return `tools/verify-sds/wellknown-ops-diff/${full.slice(PACK_ROOT.length).replace(/^\//, "")}`;
  }
  return full;
}

export function outputTouchesForbidden(value) {
  const hits = [];
  walk(value, "", hits);
  return hits;
}

function walk(value, path, hits) {
  if (value == null) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, path ? `${path}.${index}` : String(index), hits));
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const next = path ? `${path}.${key}` : key;
    if (FORBIDDEN_OUTPUT_FIELDS.includes(key)) hits.push({ field: next, kind: key });
    walk(child, next, hits);
  }
}
