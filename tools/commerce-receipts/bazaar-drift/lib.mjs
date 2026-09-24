import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  atomicToDecimal,
  canonicalAmountPair,
  decimalToAtomic,
  findNumberMoney,
  isPlainObject,
} from "./money.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const PACK_DIR = here;
export const REPO_ROOT = join(here, "../../..");
export const FIXTURE_DIR = join(here, "fixtures");
export const DEFAULT_ORIGIN_PIN = join(FIXTURE_DIR, "pin-origin.json");
export const DEFAULT_BAZAAR_PIN = join(FIXTURE_DIR, "pin-bazaar.json");
export const DEFAULT_CATALOG = join(FIXTURE_DIR, "catalog.json");
export const DEFAULT_COLD_CASE = join(FIXTURE_DIR, "cases/cold-committed.json");
export const MANIFEST_PATH = join(FIXTURE_DIR, "manifest.json");

export const CASE_SCHEMA = "samedaydesk.bazaar-drift.case.v1";
export const RESULT_SCHEMA = "samedaydesk.commerce-receipt.bazaar-drift.result.v1";
export const SEEDED_FAILURE = "rematerialized-read";
export const SEEDED_FAILURE_ALIASES = Object.freeze(["rematerialized-read", "read-claimed-match"]);
export const SDS_ORIGIN = "https://agents.samedaydesk.com";
export const SDS_HOST = "agents.samedaydesk.com";
export const LIVE_NETWORK = "eip155:8453";
export const LIVE_ASSET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const LIVE_PAY_TO = "0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee";
export const AGENT402_READ_CONFLICT = Object.freeze({
  route: "/read",
  method: "GET",
  priceConflict: true,
});

export const REFUSED_FLAGS = Object.freeze([
  "live",
  "pay",
  "payment",
  "checkout",
  "publish",
  "registry",
  "refresh",
  "settle",
  "deploy",
  "write",
  "sku-write",
  "edit-prices",
  "rematerialize",
  "neo",
  "neo-kernel-vendor",
]);

export const FORBIDDEN_CASE_KEYS = Object.freeze([
  "__proto__",
  "prototype",
  "constructor",
  "checkout",
  "stripe",
  "wallet",
  "secret",
  "privateKey",
  "PAYMENT-SIGNATURE",
  "X-PAYMENT",
]);

const CASE_ID_RE = /^[a-z][a-z0-9_-]{2,95}$/;
const REPO_ORIGIN_TABLE = join(REPO_ROOT, "docs/lqdist1-distribution-audit/per-route-table.json");
const REPO_BAZAAR_MERCHANT = join(REPO_ROOT, "fixtures/presence/listings/bazaar-merchant.json");
const REPO_OBSERVATION = join(REPO_ROOT, "data/bazaar-tracker/observations.json");
const REPO_AGENT402 = join(REPO_ROOT, "docs/lqdist1-distribution-audit/evidence/agent402-seller-bounded.json");

function error(code, path, message) {
  return { code, path, message };
}

export function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function loadCatalog(catalogPath = DEFAULT_CATALOG) {
  const catalog = loadJson(catalogPath);
  if (!catalog?.designatedSeed?.id) throw new Error("catalog must declare designatedSeed");
  return catalog;
}

export function loadOriginPin(path = DEFAULT_ORIGIN_PIN) {
  return loadJson(path);
}

export function loadBazaarPin(path = DEFAULT_BAZAAR_PIN) {
  return loadJson(path);
}

export function listJsonFiles(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json") && name !== "manifest.json")
    .sort()
    .map((name) => join(dir, name));
}

export function normalizePath(path) {
  if (typeof path !== "string" || path.length === 0) return "";
  const trimmed = path.replace(/\/+$/, "");
  return trimmed.length === 0 ? "/" : trimmed;
}

export function pathFromResource(resource) {
  if (typeof resource !== "string" || resource.length === 0) return "";
  try {
    return normalizePath(new URL(resource).pathname);
  } catch {
    return resource.startsWith("/") ? normalizePath(resource) : "";
  }
}

export function opKey(method, route) {
  return `${String(method || "GET").toUpperCase()} ${normalizePath(route)}`;
}

export function hostOf(resource) {
  try {
    return new URL(resource).host.toLowerCase();
  } catch {
    return "";
  }
}

export function refusedFlag(argv) {
  for (const arg of argv) {
    const name = String(arg).replace(/^--/, "");
    if (REFUSED_FLAGS.includes(name)) return arg;
  }
  return null;
}

export function parseOpId(id) {
  const match = String(id || "").match(/^(GET|POST)\s+(\/\S*)$/);
  if (!match) return null;
  return { method: match[1], route: normalizePath(match[2]) };
}

export function honestyEnvelope() {
  return {
    paid: false,
    paymentSent: false,
    purchaseAuthority: false,
    rewriteAuthorized: false,
    liveSdsPricesUnchanged: true,
    rematerialized: false,
    catalogAbsenceIsDemand: false,
    lastCalledAtIsRemovalClock: false,
    cron: false,
    daemon: false,
    liveCdp: false,
    neoKernelVendor: false,
  };
}

export function naiveVerdict(input) {
  if (!isPlainObject(input)) return "reject";
  if (input.claims?.rematerialized === true) return "accept";
  if (Array.isArray(input.bazaarListings) && input.bazaarListings.length > 0) return "accept";
  if (input.claims?.statusClass === "unpaid") return "accept";
  if (isPlainObject(input.claims) && Object.keys(input.claims).length > 0) return "accept";
  return "reject";
}

function listingMoney(row, path) {
  const pair = canonicalAmountPair(row?.amount, row?.amountAtomic);
  if (!pair.ok) return { ...pair, path };
  return { ok: true, amount: pair.amount, amountAtomic: pair.amountAtomic, path };
}

export function loadRepoOriginOps(root = REPO_ROOT) {
  const path = join(root, "docs/lqdist1-distribution-audit/per-route-table.json");
  const doc = loadJson(path);
  const rows = Array.isArray(doc.rows) ? doc.rows : [];
  return rows.map((row, index) => {
    const parsed = parseOpId(row.id);
    if (!parsed) throw new Error(`origin table row ${index} has unparseable id ${row.id}`);
    const amount = row.openapiPriceUsd;
    const amountAtomic = decimalToAtomic(amount);
    return {
      method: parsed.method,
      route: parsed.route,
      operationId: row.operationId ?? null,
      amount,
      amountAtomic,
      class: row.class ?? null,
    };
  });
}

export function loadRepoBazaarListings(root = REPO_ROOT) {
  const path = join(root, "fixtures/presence/listings/bazaar-merchant.json");
  const doc = loadJson(path);
  const rows = [];
  for (const resource of doc.resources ?? []) {
    if (hostOf(resource.resource) !== SDS_HOST) continue;
    const accept = Array.isArray(resource.accepts) ? resource.accepts[0] : null;
    const amountAtomic = accept?.amount;
    const pair = canonicalAmountPair(null, amountAtomic);
    if (!pair.ok) throw new Error(`bazaar merchant ${resource.resource}: ${pair.message}`);
    const method = resource.extensions?.bazaar?.info?.input?.method ?? "GET";
    rows.push({
      resource: resource.resource,
      route: pathFromResource(resource.resource),
      method: String(method).toUpperCase(),
      amount: pair.amount,
      amountAtomic: pair.amountAtomic,
      lastUpdated: resource.lastUpdated ?? null,
    });
  }
  rows.sort((left, right) => left.route.localeCompare(right.route));
  return rows;
}

export function loadRepoSdsObservation(root = REPO_ROOT) {
  const path = join(root, "data/bazaar-tracker/observations.json");
  const doc = loadJson(path);
  const seller = doc?.sources?.["cdp-discovery"]?.sellers?.samedaydesk;
  if (!seller) throw new Error("SDS seller missing from bazaar-tracker observations");
  const routes = Object.entries(seller.routes ?? {}).map(([resource, fields]) => ({
    resource,
    route: pathFromResource(resource),
    digest: fields?.digest ?? null,
  }));
  routes.sort((left, right) => left.route.localeCompare(right.route));
  return {
    observedAt: doc.observedAt ?? null,
    schema: doc.schema ?? null,
    rowCount: seller.rowCount ?? routes.length,
    partial: Boolean(seller.partial),
    routes,
  };
}

export function loadRepoAgent402ReadConflict(root = REPO_ROOT) {
  const path = join(root, "docs/lqdist1-distribution-audit/evidence/agent402-seller-bounded.json");
  if (!existsSync(path)) return null;
  const doc = loadJson(path);
  const tool = (doc.tools ?? []).find((row) => row.route === "/read" && row.method === "GET");
  if (!tool) return { present: false, priceConflict: false };
  return {
    present: true,
    priceConflict: tool.priceConflict === true,
    route: tool.route,
    method: tool.method,
  };
}

export function crossCheckPins(originPin, bazaarPin, { root = REPO_ROOT } = {}) {
  const errors = [];
  const repoOps = loadRepoOriginOps(root);
  const pinOps = new Map((originPin.operations ?? []).map((op) => [opKey(op.method, op.route), op]));
  if (repoOps.length !== (originPin.operations ?? []).length) {
    errors.push(error("pin_repo_mismatch", "$.origin.operations", `pin ${originPin.operations.length} vs repo ${repoOps.length}`));
  }
  for (const op of repoOps) {
    const pin = pinOps.get(opKey(op.method, op.route));
    if (!pin) {
      errors.push(error("pin_repo_mismatch", `origin:${opKey(op.method, op.route)}`, "missing from pin"));
      continue;
    }
    if (pin.amount !== op.amount || pin.amountAtomic !== op.amountAtomic) {
      errors.push(error("pin_repo_mismatch", `origin:${opKey(op.method, op.route)}.amount`, `${pin.amount}/${pin.amountAtomic} vs repo ${op.amount}/${op.amountAtomic}`));
    }
  }

  const repoListings = loadRepoBazaarListings(root);
  const pinListings = new Map((bazaarPin.listings ?? []).map((row) => [row.route, row]));
  if (repoListings.length !== (bazaarPin.listings ?? []).length) {
    errors.push(error("pin_repo_mismatch", "$.bazaar.listings", `pin ${bazaarPin.listings.length} vs repo ${repoListings.length}`));
  }
  for (const row of repoListings) {
    const pin = pinListings.get(row.route);
    if (!pin) {
      errors.push(error("pin_repo_mismatch", `bazaar:${row.route}`, "missing from pin"));
      continue;
    }
    if (pin.amountAtomic !== row.amountAtomic) {
      errors.push(error("pin_repo_mismatch", `bazaar:${row.route}.amountAtomic`, `${pin.amountAtomic} vs repo ${row.amountAtomic}`));
    }
  }

  const observation = loadRepoSdsObservation(root);
  if (observation.rowCount !== bazaarPin.observationRowCount) {
    errors.push(error("pin_repo_mismatch", "$.bazaar.observationRowCount", `${bazaarPin.observationRowCount} vs observation ${observation.rowCount}`));
  }
  const observedRoutes = new Set(observation.routes.map((row) => row.route));
  for (const row of bazaarPin.listings ?? []) {
    const host = hostOf(row.resource);
    if (host && host !== SDS_HOST) {
      errors.push(
        error("foreign_origin", `bazaar:${row.route}`, `listing host ${host} is not ${SDS_HOST}`),
      );
    }
    if (!observedRoutes.has(row.route)) {
      errors.push(error("pin_repo_mismatch", `observation:${row.route}`, "not in committed SDS observation"));
    }
    const observed = observation.routes.find((item) => item.route === row.route);
    if (observed && row.digest && observed.digest !== row.digest) {
      errors.push(error("pin_repo_mismatch", `observation:${row.route}.digest`, "digest does not match committed observation"));
    }
  }

  const agent402 = loadRepoAgent402ReadConflict(root);
  if (!agent402?.priceConflict) {
    errors.push(error("pin_repo_mismatch", "agent402:/read", "committed Agent402 snapshot must still record priceConflict on GET /read"));
  }

  return {
    ok: errors.length === 0,
    errors,
    repo: {
      originOpCount: repoOps.length,
      bazaarListingCount: repoListings.length,
      observationRowCount: observation.rowCount,
      agent402ReadConflict: agent402,
      originTable: relativeIfPossible(REPO_ORIGIN_TABLE),
      bazaarMerchant: relativeIfPossible(REPO_BAZAAR_MERCHANT),
      observation: relativeIfPossible(REPO_OBSERVATION),
      agent402: relativeIfPossible(REPO_AGENT402),
    },
  };
}

function escapesRepo(candidate) {
  const rel = relative(REPO_ROOT, candidate);
  return rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}

/**
 * Relative CLI paths are repository paths, not the caller's cwd.
 * Absolute paths are used as given. A relative path whose resolved
 * location escapes the repository is rejected. There is no cwd fallback.
 */
export function resolveReadable(filePath) {
  if (typeof filePath !== "string" || filePath.length === 0) {
    const err = new Error("missing path");
    err.code = "ENOENT";
    throw err;
  }
  if (isAbsolute(filePath)) return filePath;
  const candidate = resolve(REPO_ROOT, filePath);
  if (escapesRepo(candidate)) {
    const err = new Error(`relative path escapes the repository: ${filePath}`);
    err.code = "PATH_OUTSIDE_REPO";
    throw err;
  }
  return candidate;
}

function relativeIfPossible(absPath) {
  let abs = absPath;
  if (!isAbsolute(absPath)) {
    try {
      abs = resolveReadable(absPath);
    } catch {
      return absPath;
    }
  }
  const rel = relative(REPO_ROOT, abs);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return abs;
  return rel;
}

export function diffBazaarToOrigin(bazaarPin, originPin) {
  const originByRoute = new Map();
  for (const op of originPin.operations ?? []) {
    const route = normalizePath(op.route);
    if (!originByRoute.has(route)) originByRoute.set(route, []);
    originByRoute.get(route).push(op);
  }
  const listings = bazaarPin.listings ?? [];
  const trackedAndLive = [];
  const priceConflicts = [];
  const trackedNotInOrigin = [];

  for (const listing of listings) {
    const route = normalizePath(listing.route || pathFromResource(listing.resource));
    const method = String(listing.method || "GET").toUpperCase();
    const originOps = originByRoute.get(route) ?? [];
    const origin = originOps.find((op) => op.method === method) ?? originOps[0] ?? null;
    if (!origin) {
      trackedNotInOrigin.push({
        method,
        route,
        resource: listing.resource,
        class: "tracked-not-in-origin",
        buyerDemand: false,
        reason: "catalog_absence_is_not_demand",
      });
      continue;
    }
    const bazaarMoney = listingMoney(listing, `bazaar:${route}`);
    const originMoney = listingMoney(origin, `origin:${route}`);
    const row = {
      method,
      route,
      resource: listing.resource ?? `${SDS_ORIGIN}${route}`,
      class: "tracked-and-live",
      originAmount: originMoney.ok ? originMoney.amount : null,
      originAtomic: originMoney.ok ? originMoney.amountAtomic : null,
      bazaarAmount: bazaarMoney.ok ? bazaarMoney.amount : null,
      bazaarAtomic: bazaarMoney.ok ? bazaarMoney.amountAtomic : null,
      lastUpdated: listing.lastUpdated ?? null,
      digest: listing.digest ?? null,
    };
    trackedAndLive.push(row);
    if (bazaarMoney.ok && originMoney.ok && bazaarMoney.amountAtomic !== originMoney.amountAtomic) {
      priceConflicts.push({
        ...row,
        class: "price-conflict",
        code: "amount_drift",
        rematerialized: false,
      });
    }
  }

  const trackedPaths = new Set(listings.map((row) => normalizePath(row.route || pathFromResource(row.resource))));
  const liveUntracked = [];
  for (const op of originPin.operations ?? []) {
    if (trackedPaths.has(normalizePath(op.route))) continue;
    liveUntracked.push({
      method: op.method,
      route: normalizePath(op.route),
      class: "live-untracked",
      buyerDemand: false,
      reason: "catalog_absence_is_not_demand",
      originAmount: op.amount,
      originAtomic: op.amountAtomic,
    });
  }

  liveUntracked.sort((left, right) => opKey(left.method, left.route).localeCompare(opKey(right.method, right.route)));
  trackedAndLive.sort((left, right) => opKey(left.method, left.route).localeCompare(opKey(right.method, right.route)));
  priceConflicts.sort((left, right) => opKey(left.method, left.route).localeCompare(opKey(right.method, right.route)));

  return {
    bazaarSdsRouteCount: listings.length,
    originPaidOpCount: (originPin.operations ?? []).length,
    trackedAndLiveCount: trackedAndLive.length,
    liveUntrackedOpCount: liveUntracked.length,
    liveUntrackedPathCount: new Set(liveUntracked.map((row) => row.route)).size,
    trackedNotInOriginCount: trackedNotInOrigin.length,
    trackedAndLive,
    liveUntracked,
    trackedNotInOrigin,
    priceConflicts,
  };
}

function collectClaimErrors(input, diff, catalog) {
  const errors = [];
  const claims = isPlainObject(input.claims) ? input.claims : {};

  if (claims.rematerialized === true || (Array.isArray(claims.rematerializedRoutes) && claims.rematerializedRoutes.length > 0)) {
    const routes = Array.isArray(claims.rematerializedRoutes) && claims.rematerializedRoutes.length
      ? claims.rematerializedRoutes
      : ["/read"];
    for (const route of routes) {
      const conflict = diff.priceConflicts.find((row) => row.route === normalizePath(route));
      errors.push(
        error(
          "rematerialized_claim",
          `$.claims.rematerialized`,
          conflict
            ? `GET ${conflict.route} is still Bazaar ${conflict.bazaarAmount} vs origin ${conflict.originAmount}; rematerialization was not observed`
            : "this unpaid pack cannot prove rematerialization without a refused live CDP fetch",
        ),
      );
    }
  }

  if (
    claims.rewriteOrigin === true
    || claims.editLivePrices === true
    || claims.rewriteAuthorized === true
    || (Array.isArray(claims.proposedPrices) && claims.proposedPrices.length > 0)
  ) {
    errors.push(error("edit_live_prices", "$.claims.rewriteOrigin", "origin catalog amounts are recorded, not rewritten"));
  }

  if (Array.isArray(input.originOperations) && input.originOperations.length > 0) {
    errors.push(error("edit_live_prices", "$.originOperations", "caller origin overlays are not catalog writes"));
  }

  if (claims.treatAbsenceAsDemand === true || claims.catalogAbsenceIsDemand === true) {
    errors.push(error("treat_absence_as_demand", "$.claims.treatAbsenceAsDemand", "catalog absence is not buyer demand"));
  }
  const demandRows = Array.isArray(claims.demandRoutes) ? claims.demandRoutes : [];
  const untracked = new Set(diff.liveUntracked.map((row) => opKey(row.method, row.route)));
  for (const row of demandRows) {
    if (row?.buyerDemand !== true && row?.demand !== true) continue;
    const key = opKey(row.method || "GET", row.route);
    if (untracked.has(key) || !diff.trackedAndLive.some((item) => opKey(item.method, item.route) === key)) {
      errors.push(error("treat_absence_as_demand", `$.claims.demandRoutes:${key}`, "untracked or absent catalog rows are not demand"));
    }
  }

  if (claims.lastCalledAtIsRemovalClock === true || Array.isArray(claims.removeBecauseLastCalledAt)) {
    errors.push(
      error(
        "last_called_at_is_not_a_clock",
        "$.claims.lastCalledAtIsRemovalClock",
        "quality.lastCalledAt is not a removal clock; age is observation.observedAt",
      ),
    );
  }

  if (claims.purchaseAuthority === true || claims.purchaseAuthorized === true) {
    errors.push(error("purchase_authority", "$.claims.purchaseAuthority", "purchaseAuthority stays false"));
  }
  if (claims.paid === true || claims.charged === true || claims.paymentSent === true) {
    errors.push(error("paid_as_unpaid", "$.claims", "paid evidence cannot be labeled an unpaid bazaar-drift receipt"));
  }
  if (Object.hasOwn(input, "settlement") && input.settlement != null) {
    errors.push(error("paid_as_unpaid", "$.settlement", "settlement cannot be labeled unpaid bazaar-drift"));
  }

  const floatHits = findNumberMoney(input);
  for (const hit of floatHits) {
    errors.push(error("float_money", hit.path, `IEEE-754 number ${hit.value} is not money`));
  }

  if (Array.isArray(input.bazaarListings)) {
    for (let i = 0; i < input.bazaarListings.length; i += 1) {
      const row = input.bazaarListings[i];
      if (typeof row?.amount === "number" || typeof row?.amountAtomic === "number") {
        errors.push(error("float_money", `$.bazaarListings[${i}].amount`, "money must be a decimal string"));
      }
    }
  }

  for (const required of catalog.requiredLiveUntracked ?? []) {
    const found = diff.liveUntracked.some(
      (row) => row.method === required.method && row.route === normalizePath(required.route),
    );
    if (!found) {
      errors.push(
        error(
          "expected_live_untracked",
          `liveUntracked:${opKey(required.method, required.route)}`,
          "required live-untracked origin op missing from the pin diff",
        ),
      );
    }
  }

  if (catalog.expectedBazaarRouteCount != null && diff.bazaarSdsRouteCount !== catalog.expectedBazaarRouteCount) {
    errors.push(error("sds_row_count", "$.bazaarSdsRouteCount", `expected ${catalog.expectedBazaarRouteCount}, got ${diff.bazaarSdsRouteCount}`));
  }
  if (catalog.expectedOriginOpCount != null && diff.originPaidOpCount !== catalog.expectedOriginOpCount) {
    errors.push(error("origin_op_count", "$.originPaidOpCount", `expected ${catalog.expectedOriginOpCount}, got ${diff.originPaidOpCount}`));
  }

  return errors;
}

function validateCaseShape(input) {
  const errors = [];
  if (!isPlainObject(input)) {
    return [error("invalid_shape", "$", "case must be a plain object")];
  }
  for (const key of Object.getOwnPropertyNames(input)) {
    if (FORBIDDEN_CASE_KEYS.includes(key)) {
      errors.push(error("forbidden_field", `$.${key}`, `${key} is refused`));
    }
  }
  if (input.schema !== CASE_SCHEMA) {
    errors.push(error("unknown_schema_version", "$.schema", "unsupported case schema"));
  }
  if (typeof input.caseId !== "string" || !CASE_ID_RE.test(input.caseId)) {
    errors.push(error("invalid_shape", "$.caseId", "invalid caseId"));
  }
  return errors;
}

function readConflictReceipt(conflict) {
  if (!conflict) return null;
  return {
    schemaVersion: "samedaydesk.commerce-receipt.bazaar-drift.v1",
    receiptId: "bazaar-drift-read-hold",
    kind: "bazaar_price_conflict",
    statusClass: "unpaid",
    origin: SDS_ORIGIN,
    resource: conflict.resource,
    route: conflict.route,
    method: conflict.method,
    charged: false,
    paymentSent: false,
    completeness: "sampled",
    authorityClass: "independently_reconciled",
    decision: "hold",
    originAmount: conflict.originAmount,
    originAtomic: conflict.originAtomic,
    bazaarAmount: conflict.bazaarAmount,
    bazaarAtomic: conflict.bazaarAtomic,
    lastUpdated: conflict.lastUpdated ?? null,
    rematerialized: false,
    joinKeys: ["resource", "amount", "pay_to"],
    prohibitedInferences: [
      "rematerialized_without_new_observation",
      "bazaar_amount_is_origin_price",
      "catalog_absence_is_demand",
      "last_called_at_is_removal_clock",
      "rewrite_origin_to_match_bazaar",
      "paid_as_unpaid",
    ],
  };
}

export function evaluateCase(input, {
  catalog = loadCatalog(),
  originPin = loadOriginPin(),
  bazaarPin = loadBazaarPin(),
  crossCheck = true,
} = {}) {
  const honesty = honestyEnvelope();
  const shapeErrors = validateCaseShape(input);
  const naive = naiveVerdict(input);
  const check = crossCheck ? crossCheckPins(originPin, bazaarPin) : { ok: true, errors: [], repo: null };
  const diff = diffBazaarToOrigin(bazaarPin, originPin);
  const claimErrors = isPlainObject(input) ? collectClaimErrors(input, diff, catalog) : [];
  const errors = [...shapeErrors, ...check.errors, ...claimErrors];
  const unique = [];
  const seen = new Set();
  for (const item of errors) {
    const key = `${item.code}|${item.path}|${item.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  const readConflict = diff.priceConflicts.find((row) => row.route === "/read") ?? null;
  const codes = unique.map((item) => item.code);
  const rejected = unique.length > 0;
  const decision = rejected ? "reject" : "hold";
  const code = rejected
    ? codes[0]
    : readConflict
      ? "bazaar_price_conflict"
      : "match";

  return {
    ok: !rejected,
    schema: RESULT_SCHEMA,
    caseId: isPlainObject(input) ? input.caseId ?? null : null,
    command: null,
    decision,
    status: decision,
    code,
    message: rejected
      ? unique[0].message
      : readConflict
        ? `GET /read still Bazaar ${readConflict.bazaarAmount} vs origin ${readConflict.originAmount}; listing was not rematerialized`
        : "Bazaar SDS listings match recorded origin amounts",
    reasons: unique.map((item) => item.code),
    errors: unique,
    naiveVerdict: naive,
    honestVerdict: rejected ? "reject" : "accept",
    codes,
    ...honesty,
    observedAt: originPin.observedAt ?? bazaarPin.observationObservedAt ?? null,
    bazaarObservedAt: bazaarPin.observationObservedAt ?? null,
    originObservedAt: originPin.observedAt ?? null,
    openapiVersion: originPin.openapiVersion ?? null,
    bazaarSdsRouteCount: diff.bazaarSdsRouteCount,
    originPaidOpCount: diff.originPaidOpCount,
    trackedAndLiveCount: diff.trackedAndLiveCount,
    liveUntrackedOpCount: diff.liveUntrackedOpCount,
    liveUntrackedPathCount: diff.liveUntrackedPathCount,
    priceConflictCount: diff.priceConflicts.length,
    priceConflicts: diff.priceConflicts,
    liveUntracked: diff.liveUntracked.map((row) => ({
      method: row.method,
      route: row.route,
      buyerDemand: false,
    })),
    trackedAndLive: diff.trackedAndLive.map((row) => ({
      method: row.method,
      route: row.route,
      originAmount: row.originAmount,
      bazaarAmount: row.bazaarAmount,
    })),
    agent402: check.repo?.agent402ReadConflict ?? AGENT402_READ_CONFLICT,
    artifacts: check.repo,
    receipt: readConflictReceipt(readConflict),
    prohibitedInferences: catalog.requiredProhibitedInferences,
  };
}

export function evaluateCold(options = {}) {
  const catalog = options.catalog ?? loadCatalog();
  const originPin = options.originPin ?? loadOriginPin();
  const bazaarPin = options.bazaarPin ?? loadBazaarPin();
  const input = options.input ?? loadJson(DEFAULT_COLD_CASE);
  const result = evaluateCase(input, { catalog, originPin, bazaarPin, crossCheck: options.crossCheck !== false });
  return { ...result, command: "cold" };
}

export function designatedSeedPath(catalog = loadCatalog()) {
  return join(FIXTURE_DIR, catalog.designatedSeed.file);
}

export function evaluateSeededFailure(catalog = loadCatalog()) {
  const seed = catalog.designatedSeed;
  if (!seed || seed.id !== SEEDED_FAILURE) {
    return {
      ok: false,
      caught: false,
      error: { code: "SEED_MISS", message: "catalog designatedSeed.id must be rematerialized-read" },
    };
  }
  const filePath = designatedSeedPath(catalog);
  const shown = relativeIfPossible(filePath);
  const input = loadJson(filePath);
  const result = evaluateCase(input, { catalog });
  const caught =
    result.naiveVerdict === "accept"
    && result.honestVerdict === "reject"
    && result.codes.includes(seed.code)
    && result.liveSdsPricesUnchanged === true
    && result.rematerialized === false
    && result.paid === false;
  if (!caught) {
    return {
      ok: false,
      caught: false,
      filePath: shown,
      result,
      error: {
        code: result.ok ? "SEED_ACCEPTED" : "SEED_MISS",
        message: result.ok
          ? "seeded rematerialized-read was accepted"
          : `seeded rematerialized-read not caught on ${seed.id}`,
      },
    };
  }
  return {
    ok: false,
    caught: true,
    filePath: shown,
    result,
    error: {
      code: "SEED_REJECT",
      message: `seeded rematerialized-read caught on ${seed.id}: GET /read is still Bazaar 0.05 vs origin 0.005`,
    },
  };
}

export function evaluateFile(filePath, options = {}) {
  let input;
  let resolved = filePath;
  try {
    resolved = resolveReadable(filePath);
    input = loadJson(resolved);
  } catch (cause) {
    const escaped = cause.code === "PATH_OUTSIDE_REPO";
    const code = escaped ? "PATH_OUTSIDE_REPO" : "invalid_json";
    return {
      ok: false,
      filePath: escaped ? filePath : relativeIfPossible(resolved),
      schema: RESULT_SCHEMA,
      decision: "reject",
      code,
      message: cause.message,
      naiveVerdict: "reject",
      honestVerdict: "reject",
      codes: [code],
      errors: [error(code, "$", cause.message)],
      ...honestyEnvelope(),
    };
  }
  return { ...evaluateCase(input, options), filePath: relativeIfPossible(resolved) };
}

export function runSuite(catalog = loadCatalog()) {
  const manifest = loadJson(MANIFEST_PATH);
  const results = [];
  for (const [name, spec] of Object.entries(manifest)) {
    const filePath = join(FIXTURE_DIR, spec.file);
    const result = evaluateFile(filePath, { catalog });
    let matched;
    if (spec.expect === "hold") {
      matched = result.ok === true && result.decision === "hold" && result.code === "bazaar_price_conflict";
    } else {
      matched = result.ok === false && result.codes.includes(spec.code);
    }
    results.push({
      name,
      filePath: relativeIfPossible(filePath),
      expect: spec.expect,
      expectedCode: spec.code ?? null,
      ok: matched,
      decision: result.decision,
      codes: result.codes,
      errors: result.errors,
    });
  }
  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;
  return { ok: failed === 0, passed, failed, total: results.length, results };
}

export { atomicToDecimal, decimalToAtomic };
