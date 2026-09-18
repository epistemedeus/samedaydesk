import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { IN_TREE, PIN } from "./pin.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const PACK_ROOT = join(here, "..");
export const REPO_ROOT = join(here, "../../../..");

export const ATOMIC_RE = /^[1-9][0-9]{0,20}$/;
export const DISPLAY_RE = /^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/;

export function repoPath(rel, root = REPO_ROOT) {
  return join(root, rel);
}

export function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function atomicToDisplay(atomic, decimals = PIN.decimals) {
  if (typeof atomic !== "string" || !ATOMIC_RE.test(atomic)) return null;
  const n = BigInt(atomic);
  const scale = 10n ** BigInt(decimals);
  const whole = n / scale;
  const frac = n % scale;
  if (frac === 0n) return String(whole);
  return `${whole}.${frac.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}

export function displayToAtomic(display, decimals = PIN.decimals) {
  if (typeof display !== "string" || !DISPLAY_RE.test(display)) return null;
  const [wholeRaw, fracRaw = ""] = display.split(".");
  const frac = fracRaw.padEnd(decimals, "0");
  if (frac.length > decimals) return null;
  const atomic = `${wholeRaw}${frac}`.replace(/^0+(?=\d)/, "");
  if (!ATOMIC_RE.test(atomic)) return null;
  return atomic;
}

export function routeKey(method, route) {
  return `${String(method || "GET").toUpperCase()} ${route}`;
}

export function pathOf(urlLike) {
  if (!urlLike) return null;
  try {
    const url = new URL(urlLike, `${PIN.origin}/`);
    const path = url.pathname.replace(/\/$/, "") || "/";
    return path.startsWith("/") ? path : `/${path}`;
  } catch {
    const raw = String(urlLike).split("?")[0];
    return raw.startsWith("/") ? raw.replace(/\/$/, "") || "/" : null;
  }
}

export function hostOf(urlLike) {
  try {
    return new URL(urlLike).host.toLowerCase();
  } catch {
    return "";
  }
}

export function loadCatalog(root = REPO_ROOT) {
  const filePath = repoPath(IN_TREE.catalog, root);
  if (!existsSync(filePath)) {
    throw new Error(`missing in-tree catalog ${IN_TREE.catalog}`);
  }
  const raw = loadJson(filePath);
  return { filePath, rel: IN_TREE.catalog, raw };
}

export function loadOpenApi(root = REPO_ROOT) {
  const filePath = repoPath(IN_TREE.openapi, root);
  if (!existsSync(filePath)) {
    throw new Error(`missing in-tree OpenAPI ${IN_TREE.openapi}`);
  }
  return { filePath, rel: IN_TREE.openapi, raw: loadJson(filePath) };
}

export function loadBazaar(root = REPO_ROOT) {
  const filePath = repoPath(IN_TREE.bazaar, root);
  if (!existsSync(filePath)) {
    throw new Error(`missing in-tree bazaar ${IN_TREE.bazaar}`);
  }
  return { filePath, rel: IN_TREE.bazaar, raw: loadJson(filePath) };
}

export function rowsFromX402(manifest) {
  if (!manifest || !Array.isArray(manifest.items)) {
    throw new Error("x402 catalog must have items[]");
  }
  const rows = [];
  for (const item of manifest.items) {
    const accept = Array.isArray(item.accepts) && item.accepts[0] ? item.accepts[0] : null;
    if (!accept) {
      throw new Error("x402 item missing accepts[0]");
    }
    const route = item.resource?.routeTemplate || pathOf(item.request?.url);
    const method = String(item.request?.method || "GET").toUpperCase();
    rows.push({
      route,
      method,
      resource: item.resource?.url || null,
      requestUrl: item.request?.url || null,
      amountAtomic: String(accept.amount),
      amountDisplayUsd: atomicToDisplay(String(accept.amount)),
      network: accept.network || null,
      asset: accept.asset || null,
      payTo: accept.payTo || null,
      scheme: accept.scheme || null,
      maxTimeoutSeconds: accept.maxTimeoutSeconds ?? null,
      extra: accept.extra || null,
      extraName: accept.extra?.name || null,
    });
  }
  return rows;
}

export function uniqueAmountsFromRows(rows) {
  const counts = new Map();
  for (const row of rows) {
    const prev = counts.get(row.amountAtomic) || { amountAtomic: row.amountAtomic, amountDisplayUsd: row.amountDisplayUsd, routeCount: 0 };
    prev.routeCount += 1;
    counts.set(row.amountAtomic, prev);
  }
  return [...counts.values()].sort((a, b) => BigInt(a.amountAtomic) < BigInt(b.amountAtomic) ? -1 : 1);
}

function protocolBlock(protocols, key) {
  if (!Array.isArray(protocols)) return null;
  for (const entry of protocols) {
    if (entry && typeof entry === "object" && entry[key]) return entry[key];
  }
  return null;
}

export function paidOperationsFromOpenApi(openapi) {
  const operations = [];
  for (const [path, methods] of Object.entries(openapi?.paths || {})) {
    if (!methods || typeof methods !== "object") continue;
    for (const [method, op] of Object.entries(methods)) {
      if (!op || typeof op !== "object") continue;
      const payment = op["x-payment-info"];
      if (!payment) continue;
      const x402 = protocolBlock(payment.protocols, "x402");
      operations.push({
        method: String(method).toUpperCase(),
        route: path,
        displayAmount: payment.price?.amount != null ? String(payment.price.amount) : null,
        currency: payment.price?.currency || null,
        asset: x402?.asset || null,
        network: x402?.network || null,
        scheme: x402?.scheme || null,
        has402Response: Boolean(op.responses && Object.hasOwn(op.responses, "402")),
      });
    }
  }
  return operations;
}

export function listingsFromBazaar(bazaar) {
  const resources = Array.isArray(bazaar?.resources) ? bazaar.resources : [];
  return resources.map((item, index) => {
    const accept = Array.isArray(item.accepts) && item.accepts[0] ? item.accepts[0] : {};
    const resource = item.resource || "";
    return {
      index,
      resource,
      host: hostOf(resource),
      route: pathOf(resource),
      method: String(item.extensions?.bazaar?.info?.input?.method || "GET").toUpperCase(),
      amountAtomic: accept.amount != null ? String(accept.amount) : null,
      network: accept.network || null,
      asset: accept.asset || null,
      payTo: accept.payTo || null,
      scheme: accept.scheme || null,
      lastUpdated: item.lastUpdated || null,
    };
  });
}

export function indexRows(rows) {
  const byKey = new Map();
  for (const row of rows) {
    byKey.set(routeKey(row.method, row.route), row);
  }
  return byKey;
}
