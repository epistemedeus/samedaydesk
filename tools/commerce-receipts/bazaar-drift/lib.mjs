import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../../..");

function displayRepoPath(filePath) {
  const resolved = resolve(filePath);
  if (resolved === ROOT || resolved.startsWith(`${ROOT}/`)) {
    return resolved.slice(ROOT.length + 1) || ".";
  }
  return filePath;
}

export const SCHEMA = "samedaydesk.commerce-receipts.bazaar-drift.v1";
export const CASE_SCHEMA = "samedaydesk.commerce-receipts.bazaar-drift.case.v1";
export const ORIGIN = "https://agents.samedaydesk.com";
export const SEEDED_FAILURE = "read-claimed-match";
export const EXPECTED_BAZAAR_COUNT = 8;
export const EXPECTED_BAZAAR_PATHS = Object.freeze([
  "/deep-audit",
  "/defi/morpho-position",
  "/enrich",
  "/extract",
  "/read",
  "/scan",
  "/schemaforge",
  "/wallet-enrich",
]);
export const EXPECTED_READ_DRIFT = Object.freeze({
  path: "/read",
  bazaarAmount: "50000",
  receiptAmount: "5000",
});
export const EXPECTED_RECEIPT_ONLY = Object.freeze(["/commerce/settlement-proof"]);
export const PIN_PAYTO = "0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee";
export const PIN_ASSET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const PIN_NETWORK = "eip155:8453";
export const ATOMIC_RE = /^(0|[1-9][0-9]*)$/;
export const PAYMENT_HEADER_RE = /^(PAYMENT-SIGNATURE|X-PAYMENT|PAYMENT-RESPONSE)$/i;
export const REFUSED_FLAGS = Object.freeze([
  "live",
  "pay",
  "payment",
  "checkout",
  "publish",
  "registry",
  "refresh",
  "settle",
  "neo",
  "neo-kernel-vendor",
]);
export const FORBIDDEN_COMPACT_KEYS = Object.freeze([
  "payTo",
  "amount",
  "asset",
  "network",
  "description",
  "maxAmountRequired",
  "lastCalledAt",
  "quality",
]);
export const INVENTED_FIELDS = Object.freeze([
  "loyaltyPoints",
  "throughBlock",
  "buyerEmail",
  "npsScore",
  "tipAmount",
  "uniqueVisitors",
]);

export const DEFAULT_CATALOG = join(here, "fixtures/catalog.json");
export const DEFAULT_PIN = join(here, "fixtures/pin.json");
export const DEFAULT_LISTINGS = join(here, "fixtures/bazaar/sds-listings.json");
export const DEFAULT_RECEIPTS = join(here, "fixtures/receipts/sds-unpaid.json");
export const VALID_DIR = join(here, "fixtures/valid");
export const INVALID_DIR = join(here, "fixtures/invalid");
export const INVALID_MANIFEST = join(INVALID_DIR, "manifest.json");

function error(code, path, message) {
  return { code, path, message };
}

export function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function loadCatalog(catalogPath = DEFAULT_CATALOG) {
  return loadJson(catalogPath);
}

export function refusedFlag(argv) {
  for (const arg of argv) {
    const name = String(arg).replace(/^--/, "");
    if (REFUSED_FLAGS.includes(name)) return arg;
  }
  return null;
}

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function codesFrom(result) {
  return (result?.errors ?? []).map((item) => item.code);
}

function ownKeys(value) {
  if (!value || typeof value !== "object") return [];
  return Object.getOwnPropertyNames(value);
}

function objectKeyPaths(value, prefix = "") {
  const out = [];
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      out.push(...objectKeyPaths(item, prefix ? `${prefix}.${index}` : String(index)));
    });
    return out;
  }
  for (const key of ownKeys(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    out.push(path);
    out.push(...objectKeyPaths(value[key], path));
  }
  return out;
}

export function joinKey(value) {
  if (typeof value === "string" && value.startsWith("/")) {
    return `${ORIGIN}${value.replace(/\/+$/, "") || ""}`;
  }
  if (typeof value === "string" && /^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const path = url.pathname.replace(/\/+$/, "") || "";
      return `${url.origin}${path}`;
    } catch {
      return "";
    }
  }
  if (isPlainObject(value)) {
    if (typeof value.resource === "string") return joinKey(value.resource);
    if (typeof value.route === "string") return joinKey(value.route);
    if (typeof value.path === "string") return joinKey(value.path);
  }
  return "";
}

export function pathOf(key) {
  if (!key) return "";
  try {
    return new URL(key).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return key.startsWith("/") ? key : "";
  }
}

export function firstAccept(record) {
  const accepts = record?.accepts;
  if (!Array.isArray(accepts) || accepts.length === 0) return null;
  return accepts[0] && typeof accepts[0] === "object" ? accepts[0] : null;
}

export function parseAtomic(value, path, errors) {
  if (typeof value === "number") {
    errors.push(error("float_money", path, "amount must be an integer string, not a JS number"));
    return null;
  }
  if (typeof value !== "string" || !ATOMIC_RE.test(value)) {
    errors.push(error("noncanonical_money", path, "amount must be a non-negative integer string"));
    return null;
  }
  return BigInt(value);
}

export function stableStringify(value) {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function digestValue(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function routeContentDigest(row) {
  return digestValue({
    description: row?.description ?? null,
    accepts: row?.accepts ?? [],
    extensions: row?.extensions ?? null,
  });
}

export function compactRoute(row) {
  return {
    route: joinKey(row) || row?.resource || null,
    seller: row?.seller ?? null,
    sellerId: row?.sellerId ?? null,
    source: "cdp-discovery",
    digest: routeContentDigest(row),
  };
}

export function compactForbiddenHits(value) {
  const hits = [];
  for (const path of objectKeyPaths(value)) {
    const leaf = path.split(".").pop();
    if (FORBIDDEN_COMPACT_KEYS.includes(leaf)) hits.push(path);
  }
  return hits;
}

function inventedHits(value) {
  return INVENTED_FIELDS.filter((name) => objectKeyPaths(value).some((path) => path.split(".").pop() === name));
}

function paymentHeaderHits(record) {
  const headers = record?.request?.headers ?? record?.headers ?? {};
  return Object.keys(headers).filter((name) => PAYMENT_HEADER_RE.test(name));
}

export function naivePairVerdict(listing, receipt) {
  if (receipt && receipt.statusClass === "unpaid") return "accept";
  if (!receipt && listing) return "accept";
  return "reject";
}

function paidErrors(receipt) {
  const errors = [];
  if (!receipt) return errors;
  if (receipt.charged === true) {
    errors.push(error("paid_as_unpaid", "$.receipt.charged", "charged true cannot be an unpaid receipt"));
  }
  if (receipt.paymentSent === true) {
    errors.push(error("paid_as_unpaid", "$.receipt.paymentSent", "paymentSent true cannot be an unpaid receipt"));
  }
  if (receipt.httpStatus === 200) {
    errors.push(error("paid_as_unpaid", "$.receipt.httpStatus", "HTTP 200 cannot be an unpaid 402 receipt"));
  }
  if (receipt.settlement && typeof receipt.settlement === "object") {
    const tx = typeof receipt.settlement.transaction === "string" ? receipt.settlement.transaction : "";
    errors.push(
      error(
        "paid_as_unpaid",
        "$.receipt.settlement",
        tx
          ? `settlement object cannot be labeled unpaid (${tx})`
          : "settlement object cannot be labeled unpaid",
      ),
    );
  }
  if (receipt.offerReceipt?.receipt) {
    errors.push(error("paid_as_unpaid", "$.receipt.offerReceipt.receipt", "offer receipt body is settlement"));
  }
  for (const name of paymentHeaderHits(receipt)) {
    errors.push(error("paid_as_unpaid", `$.receipt.request.headers.${name}`, "payment header cannot be unpaid"));
  }
  return errors;
}

export function comparePair(listing, receipt, { claims = {}, compactObservation = null } = {}) {
  const errors = [];
  const listingKey = listing ? joinKey(listing) : "";
  const receiptKey = receipt ? joinKey(receipt) : "";
  const key = listingKey || receiptKey;
  const path = pathOf(key);
  let className = "in-both";
  if (listing && !receipt) className = "bazaar-only";
  if (!listing && receipt) className = "receipt-only";
  if (!listing && !receipt) className = "empty";

  errors.push(...paidErrors(receipt));

  const invented = inventedHits({ listing, receipt, claims, compactObservation });
  for (const name of invented) {
    errors.push(error("invented_field", `$.${name}`, `invented field ${name} is not on the live schema`));
  }

  if (claims.catalogPresenceIsDemand === true) {
    errors.push(
      error(
        "catalog_presence_is_demand",
        "$.claims.catalogPresenceIsDemand",
        "a Bazaar listing is not independent buyer demand",
      ),
    );
  }
  if (claims.treatAbsenceAsDemand === true && className !== "in-both") {
    errors.push(
      error(
        "absence_as_demand",
        "$.claims.treatAbsenceAsDemand",
        "catalog absence is not buyer demand",
      ),
    );
  }

  const compactHits = compactForbiddenHits(compactObservation);
  if (compactHits.some((item) => item.split(".").pop() === "payTo") || JSON.stringify(compactObservation || {}).includes("payTo")) {
    errors.push(error("payto_in_compact", "$.compactObservation.payTo", "compact observations must not store payTo"));
  }
  const otherCompact = compactHits.filter((item) => item.split(".").pop() !== "payTo");
  if (otherCompact.length) {
    errors.push(
      error(
        "payment_terms_in_compact",
        `$.compactObservation.${otherCompact[0]}`,
        "compact observations stay digest-only",
      ),
    );
  }

  const listingAccept = firstAccept(listing);
  const receiptAccept = firstAccept(receipt);
  let bazaarAmount = null;
  let receiptAmount = null;
  if (listingAccept && Object.hasOwn(listingAccept, "amount")) {
    bazaarAmount = listingAccept.amount;
    parseAtomic(bazaarAmount, "$.listing.accepts[0].amount", errors);
  }
  if (receiptAccept && Object.hasOwn(receiptAccept, "amount")) {
    receiptAmount = receiptAccept.amount;
    parseAtomic(receiptAmount, "$.receipt.accepts[0].amount", errors);
  }

  const floatHit = errors.some((item) => item.code === "float_money");
  let amountMatch = null;
  if (className === "in-both" && !floatHit && typeof bazaarAmount === "string" && typeof receiptAmount === "string") {
    const left = parseAtomic(bazaarAmount, "$.listing.accepts[0].amount", []);
    const right = parseAtomic(receiptAmount, "$.receipt.accepts[0].amount", []);
    if (left !== null && right !== null) {
      amountMatch = left === right;
      if (!amountMatch) {
        errors.push(
          error(
            "amount_drift",
            "$.listing.accepts[0].amount",
            `bazaar amount ${bazaarAmount} drifted from unpaid receipt ${receiptAmount}`,
          ),
        );
      }
    }
  }

  if (className === "in-both" && listingAccept && receiptAccept) {
    if (listingAccept.scheme && receiptAccept.scheme && listingAccept.scheme !== receiptAccept.scheme) {
      errors.push(error("scheme_drift", "$.listing.accepts[0].scheme", "scheme drifted"));
    }
    if (listingAccept.network && receiptAccept.network && listingAccept.network !== receiptAccept.network) {
      errors.push(error("network_drift", "$.listing.accepts[0].network", "network drifted"));
    }
    if (
      listingAccept.asset &&
      receiptAccept.asset &&
      String(listingAccept.asset).toLowerCase() !== String(receiptAccept.asset).toLowerCase()
    ) {
      errors.push(error("asset_drift", "$.listing.accepts[0].asset", "asset drifted"));
    }
  }

  const drifted = errors.some((item) => item.code === "amount_drift");
  if (claims.match === true && drifted) {
    errors.push(error("claim_match", "$.claims.match", "cannot claim match when bazaar amount drifted from the unpaid receipt"));
  }

  const naive = naivePairVerdict(listing, receipt);
  const policyCodes = new Set(errors.map((item) => item.code));
  const honestReject = policyCodes.size > 0;
  return {
    schema: SCHEMA,
    joinKey: key || null,
    path: path || null,
    class: className,
    buyerDemand: false,
    catalogAbsenceIsDemand: false,
    bazaarAmount: bazaarAmount === null ? null : String(bazaarAmount),
    receiptAmount: receiptAmount === null ? null : String(receiptAmount),
    amountMatch,
    aligned: className === "in-both" && amountMatch === true && !honestReject,
    naiveVerdict: naive,
    honestVerdict: honestReject ? "reject" : "accept",
    compactObservation: listing ? compactRoute(listing) : null,
    errors,
  };
}

export function evaluateCase(caseDoc) {
  if (!isPlainObject(caseDoc)) {
    return {
      ok: false,
      schema: CASE_SCHEMA,
      id: null,
      naiveVerdict: "reject",
      honestVerdict: "reject",
      errors: [error("invalid_shape", "$", "case must be a plain object")],
    };
  }
  const listing = caseDoc.listing === null ? null : caseDoc.listing ?? null;
  const receipt = caseDoc.receipt === null ? null : caseDoc.receipt ?? null;
  const claims = isPlainObject(caseDoc.claims) ? caseDoc.claims : {};
  const compared = comparePair(listing, receipt, {
    claims,
    compactObservation: caseDoc.compactObservation ?? null,
  });
  const ok = compared.honestVerdict === "accept";
  return {
    ...compared,
    ok,
    schema: CASE_SCHEMA,
    id: caseDoc.id ?? null,
    paid: false,
    live: false,
    network: false,
    neo: false,
    published: false,
  };
}

export function resolvePath(filePath) {
  return isAbsolute(filePath) ? filePath : resolve(filePath);
}

export function evaluateFile(filePath) {
  const resolved = resolvePath(filePath);
  let doc;
  try {
    doc = loadJson(resolved);
  } catch (cause) {
    return {
      ok: false,
      filePath: resolved,
      schema: CASE_SCHEMA,
      naiveVerdict: "reject",
      honestVerdict: "reject",
      errors: [error("invalid_json", resolved, cause.message)],
    };
  }
  const result = evaluateCase(doc);
  return { ...result, filePath: resolved };
}

function listJsonFiles(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json") && name !== "manifest.json")
    .sort()
    .map((name) => join(dir, name));
}

export function loadInvalidManifest(manifestPath = INVALID_MANIFEST) {
  return loadJson(manifestPath);
}

export function designatedSeedPath(catalog = loadCatalog()) {
  return join(here, "fixtures", catalog.designatedSeed.file);
}

export function evaluateSeededFailure(catalog = loadCatalog()) {
  const seed = catalog.designatedSeed;
  if (!seed || seed.id !== SEEDED_FAILURE) {
    return {
      ok: false,
      caught: false,
      error: { code: "SEED_MISS", message: "catalog designatedSeed.id must be read-claimed-match" },
    };
  }
  const filePath = designatedSeedPath(catalog);
  const result = evaluateFile(filePath);
  const codes = codesFrom(result);
  const caught =
    result.naiveVerdict === "accept" &&
    result.honestVerdict === "reject" &&
    codes.includes(seed.code);
  if (!caught) {
    return {
      ok: false,
      caught: false,
      filePath,
      result,
      error: {
        code: result.ok ? "SEED_ACCEPTED" : "SEED_MISS",
        message: result.ok
          ? "seeded read-claimed-match was accepted as aligned"
          : `seeded read-claimed-match not caught on ${seed.id}`,
      },
    };
  }
  return {
    ok: false,
    caught: true,
    filePath,
    result,
    error: {
      code: "SEED_REJECT",
      message: `seeded ${seed.id} caught: bazaar /read 50000 vs unpaid receipt 5000`,
    },
  };
}

export function runSuite() {
  const results = [];
  for (const filePath of listJsonFiles(VALID_DIR)) {
    const result = evaluateFile(filePath);
    results.push({
      filePath,
      expect: "accept",
      expectedCode: null,
      ok: result.ok === true,
      errors: result.errors,
    });
  }
  const manifest = loadInvalidManifest();
  for (const spec of manifest.cases) {
    const filePath = join(INVALID_DIR, spec.file);
    const result = evaluateFile(filePath);
    const codes = codesFrom(result);
    const matched = result.ok === false && codes.includes(spec.code);
    results.push({
      filePath,
      expect: "reject",
      expectedCode: spec.code,
      ok: matched,
      errors: result.errors,
    });
  }
  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;
  return { ok: failed === 0, passed, failed, total: results.length, results };
}

export function loadListings(path = DEFAULT_LISTINGS) {
  const doc = loadJson(path);
  return { path, doc, rows: Array.isArray(doc.rows) ? doc.rows : [] };
}

export function loadReceipts(path = DEFAULT_RECEIPTS) {
  const doc = loadJson(path);
  return { path, doc, receipts: Array.isArray(doc.receipts) ? doc.receipts : [] };
}

export function projectCompact(rows) {
  return rows.map((row) => compactRoute(row));
}

export function runCold({
  pinPath = DEFAULT_PIN,
  listingsPath = DEFAULT_LISTINGS,
  receiptsPath = DEFAULT_RECEIPTS,
} = {}) {
  const errors = [];
  const pin = loadJson(pinPath);
  const listings = loadListings(listingsPath);
  const receipts = loadReceipts(receiptsPath);
  const listingByPath = new Map();
  for (const row of listings.rows) {
    listingByPath.set(pathOf(joinKey(row)), row);
  }
  const receiptByPath = new Map();
  for (const row of receipts.receipts) {
    receiptByPath.set(pathOf(joinKey(row)), row);
  }
  const paths = [...new Set([...listingByPath.keys(), ...receiptByPath.keys()])].sort();
  const pairs = [];
  for (const path of paths) {
    const compared = comparePair(listingByPath.get(path) ?? null, receiptByPath.get(path) ?? null, {
      claims: { treatAbsenceAsDemand: false, catalogPresenceIsDemand: false },
    });
    pairs.push(compared);
  }

  const compact = projectCompact(listings.rows);
  const compactBlob = JSON.stringify(compact);
  if (compactBlob.includes("payTo") || compact.some((row) => Object.hasOwn(row, "amount"))) {
    errors.push(error("payto_in_compact", "$.compact", "compact SDS projection leaked payment terms"));
  }
  for (const row of compact) {
    const keys = Object.keys(row).sort();
    if (JSON.stringify(keys) !== JSON.stringify(["digest", "route", "seller", "sellerId", "source"].sort())) {
      errors.push(error("payment_terms_in_compact", "$.compact", `unexpected compact keys ${keys.join(",")}`));
    }
  }

  const inBoth = pairs.filter((row) => row.class === "in-both");
  const receiptOnly = pairs.filter((row) => row.class === "receipt-only");
  const bazaarOnly = pairs.filter((row) => row.class === "bazaar-only");
  const amountDrift = inBoth.filter((row) => row.amountMatch === false);
  const aligned = inBoth.filter((row) => row.aligned);
  const bazaarPaths = [...listingByPath.keys()].sort();
  const receiptOnlyPaths = receiptOnly.map((row) => row.path).sort();

  if (listings.rows.length !== EXPECTED_BAZAAR_COUNT) {
    errors.push(
      error(
        "bazaar_count",
        "$.listings.rowCount",
        `expected ${EXPECTED_BAZAAR_COUNT} bazaar routes, got ${listings.rows.length}`,
      ),
    );
  }
  for (const path of EXPECTED_BAZAAR_PATHS) {
    if (!listingByPath.has(path)) {
      errors.push(error("expected_bazaar_path", path, `missing SDS bazaar path ${path}`));
    }
  }
  const read = amountDrift.find((row) => row.path === EXPECTED_READ_DRIFT.path);
  if (
    !read ||
    read.bazaarAmount !== EXPECTED_READ_DRIFT.bazaarAmount ||
    read.receiptAmount !== EXPECTED_READ_DRIFT.receiptAmount
  ) {
    errors.push(
      error(
        "expected_read_amount_drift_missing",
        "/read",
        "documented GET /read bazaar 50000 vs unpaid receipt 5000 was not reported",
      ),
    );
  }
  const unexpectedDrift = amountDrift.filter((row) => row.path !== EXPECTED_READ_DRIFT.path);
  for (const row of unexpectedDrift) {
    errors.push(
      error("unexpected_amount_drift", row.path, `unexpected amount drift on ${row.path}`),
    );
  }
  for (const path of EXPECTED_RECEIPT_ONLY) {
    if (!receiptOnlyPaths.includes(path)) {
      errors.push(
        error("expected_receipt_only", path, `expected bazaar-absent origin route ${path}`),
      );
    }
  }
  if (receiptOnly.some((row) => row.buyerDemand === true)) {
    errors.push(error("absence_as_demand", "$.receiptOnly", "catalog absence was labeled demand"));
  }
  if (pin.rewriteAuthorized === true || pin.purchaseAuthority === true || pin.liveCdp === true) {
    errors.push(error("money_movement_refused", "$.pin", "cold pin cannot authorize rewrite, purchase, or live CDP"));
  }
  for (const pair of pairs) {
    const paid = pair.errors.filter((item) => item.code === "paid_as_unpaid");
    errors.push(...paid);
    const floats = pair.errors.filter((item) => item.code === "float_money");
    errors.push(...floats);
  }

  const ok = errors.length === 0;
  return {
    ok,
    schema: SCHEMA,
    command: "cold",
    paid: false,
    live: false,
    network: false,
    neo: false,
    published: false,
    cron: false,
    daemon: false,
    liveCdp: false,
    catalogAbsenceIsDemand: false,
    absenceIsDemand: false,
    bazaarRowCount: listings.rows.length,
    receiptCount: receipts.receipts.length,
    inBothCount: inBoth.length,
    alignedCount: aligned.length,
    amountDriftCount: amountDrift.length,
    receiptOnlyCount: receiptOnly.length,
    bazaarOnlyCount: bazaarOnly.length,
    bazaarPaths,
    amountDrift: amountDrift.map((row) => ({
      path: row.path,
      bazaarAmount: row.bazaarAmount,
      receiptAmount: row.receiptAmount,
      buyerDemand: false,
    })),
    receiptOnly: receiptOnly.map((row) => ({
      path: row.path,
      class: "receipt-only",
      buyerDemand: false,
      reason: "catalog_absence_is_not_demand",
    })),
    compactObservation: compact,
    expectedReadAmountDrift: EXPECTED_READ_DRIFT,
    sources: {
      pin: displayRepoPath(pinPath),
      bazaarListings: displayRepoPath(listingsPath),
      receipts: displayRepoPath(receiptsPath),
      originX402: "fixtures/presence/catalog/x402.json",
      lqdist1: "docs/lqdist1-distribution-audit/evidence/agent402-seller-bounded.json",
    },
    errors,
    pairs: pairs.map((row) => ({
      path: row.path,
      class: row.class,
      bazaarAmount: row.bazaarAmount,
      receiptAmount: row.receiptAmount,
      amountMatch: row.amountMatch,
      aligned: row.aligned,
      buyerDemand: false,
      codes: codesFrom(row),
    })),
  };
}
