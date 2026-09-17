import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const PACK_ROOT = here;
export const ROOT = join(here, "../../..");
export const FIXTURE_ROOT = join(here, "fixtures");
export const VALID_FIXTURES = join(FIXTURE_ROOT, "valid");
export const INVALID_FIXTURES = join(FIXTURE_ROOT, "invalid");
export const DEFAULT_MATRIX = join(here, "matrix.json");
export const INVALID_MANIFEST = join(INVALID_FIXTURES, "manifest.json");
export const IN_TREE_X402 = join(ROOT, "fixtures/presence/catalog/x402.json");

export const PRODUCT = "samedaydesk-commerce-receipts";
export const PACK = "amount-matrix-w7-unpaid";
export const SCHEMA_VERSION = "samedaydesk.amount-matrix-w7.unpaid.v1";
export const MATRIX_SCHEMA_VERSION = "samedaydesk.amount-matrix-w7.v1";
export const SEEDED_FAILURE = "stale-listed-amount";

const FIXTURE_ID_RE = /^[a-z][a-z0-9_-]{2,95}$/;
const TOKEN_RE = /^[a-z][a-z0-9_]{1,95}$/;
const SURFACE_RE = /^[\x20-\x7E]{1,400}$/;
const ROUTE_RE = /^\/[^?#]*$/;
const ATOMIC_RE = /^[1-9][0-9]{0,20}$/;
const DISPLAY_RE = /^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/;
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const TX_RE = /^0x[a-f0-9]{64}$/;
const RFC3339_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;
const RESOURCE_PREFIX = "https://agents.samedaydesk.com/";
const PAYMENT_HEADER_RE = /^(PAYMENT-SIGNATURE|X-PAYMENT|PAYMENT-RESPONSE)$/i;
const HTTP_METHODS = new Set(["GET", "POST"]);
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

const ROOT_KEYS = Object.freeze([
  "schemaVersion",
  "fixtureId",
  "kind",
  "statusClass",
  "origin",
  "resource",
  "route",
  "method",
  "httpStatus",
  "charged",
  "paymentSent",
  "observedAt",
  "amountAtomic",
  "amountDisplayUsd",
  "network",
  "asset",
  "payTo",
  "maxTimeoutSeconds",
  "extra",
  "request",
  "source",
  "unknownWhenAbsent",
  "prohibitedInferences",
  "settlement",
  "unitsClaim",
  "editLivePrice",
  "proposedAmountAtomic",
]);

const REQUEST_KEYS = Object.freeze(["method", "url", "headers"]);
const SOURCE_KEYS = Object.freeze(["kind", "capturedAt", "path", "note"]);
const EXTRA_KEYS = Object.freeze(["name", "version", "verifyingContract"]);
const SETTLEMENT_KEYS = Object.freeze([
  "operationId",
  "amountUsdc",
  "transaction",
  "facilitatorOrPayoutRef",
]);

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
]);

function error(code, path, message) {
  return { code, path, message };
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function ownKeys(value) {
  return Object.getOwnPropertyNames(value);
}

function allowKeys(obj, allowed, path, errors) {
  const allowedSet = new Set(allowed);
  for (const key of ownKeys(obj)) {
    if (FORBIDDEN_KEYS.has(key) || !allowedSet.has(key)) {
      errors.push(error("additional_property", `${path}.${key}`, `property ${key} is not allowed`));
    }
  }
}

function requireKeys(obj, required, path, errors) {
  for (const key of required) {
    if (!Object.hasOwn(obj, key)) {
      errors.push(error("invalid_shape", path, `missing ${key}`));
    }
  }
}

function expectString(value, re, path, errors, code = "invalid_shape") {
  if (typeof value !== "string" || !re.test(value)) {
    errors.push(error(code, path, "invalid string"));
    return false;
  }
  return true;
}

function expectUniqueStringArray(value, path, errors, itemRe, { min, max }) {
  if (!Array.isArray(value) || Object.keys(value).length !== value.length) {
    errors.push(error("invalid_shape", path, "expected array"));
    return false;
  }
  if (value.length < min || value.length > max) {
    errors.push(error("invalid_shape", path, `expected ${min} to ${max} items`));
    return false;
  }
  const seen = new Set();
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (typeof item !== "string" || (itemRe && !itemRe.test(item))) {
      errors.push(error("invalid_shape", `${path}[${i}]`, "invalid item"));
      continue;
    }
    if (seen.has(item)) {
      errors.push(error("invalid_shape", `${path}[${i}]`, "duplicate item"));
    }
    seen.add(item);
  }
  return true;
}

function parseRfc3339(value) {
  if (typeof value !== "string" || !RFC3339_RE.test(value)) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  if (new Date(ms).toISOString() !== value) return null;
  return ms;
}

function addr(value) {
  return String(value || "").toLowerCase();
}

export function atomicToDisplay(atomic, decimals = 6) {
  if (typeof atomic !== "string" || !ATOMIC_RE.test(atomic)) return null;
  const n = BigInt(atomic);
  const scale = 10n ** BigInt(decimals);
  const whole = n / scale;
  const frac = n % scale;
  if (frac === 0n) return String(whole);
  return `${whole}.${frac.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}

export function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function listJsonFiles(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json") && name !== "manifest.json")
    .sort()
    .map((name) => join(dir, name));
}

export function loadInvalidManifest(manifestPath = INVALID_MANIFEST) {
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

export function loadMatrix(matrixPath = DEFAULT_MATRIX) {
  const matrix = loadJson(matrixPath);
  if (!isPlainObject(matrix) || !isPlainObject(matrix.pin) || !Array.isArray(matrix.routes)) {
    throw new Error("matrix must contain pin and routes");
  }
  if (matrix.schemaVersion !== MATRIX_SCHEMA_VERSION) {
    throw new Error(`matrix schemaVersion must be ${MATRIX_SCHEMA_VERSION}`);
  }
  return matrix;
}

export function designatedSeedPath(matrix = loadMatrix()) {
  return join(FIXTURE_ROOT, matrix.designatedSeed.file);
}

export function routeKey(method, route) {
  return `${method} ${route}`;
}

export function indexRoutes(matrix = loadMatrix()) {
  const byKey = new Map();
  for (const row of matrix.routes) {
    byKey.set(routeKey(row.method, row.route), row);
  }
  return byKey;
}

export function isPaymentHeaderName(name) {
  return PAYMENT_HEADER_RE.test(String(name || ""));
}

export function naiveVerdict(record) {
  return record && record.statusClass === "unpaid" ? "accept" : "reject";
}

export function collectPaidEvidence(record) {
  const hits = [];
  if (!isPlainObject(record)) return hits;
  if (record.charged === true) {
    hits.push(error("paid_as_unpaid", "$.charged", "charged true cannot be an unpaid amount fixture"));
  }
  if (record.paymentSent === true) {
    hits.push(error("paid_as_unpaid", "$.paymentSent", "paymentSent true cannot be an unpaid amount fixture"));
  }
  if (record.httpStatus === 200) {
    hits.push(error("paid_as_unpaid", "$.httpStatus", "HTTP 200 cannot be an unpaid 402 amount fixture"));
  }
  if (Object.hasOwn(record, "settlement") && record.settlement !== null) {
    hits.push(error("paid_as_unpaid", "$.settlement", "settlement object cannot be labeled unpaid"));
  }
  const headers = isPlainObject(record.request) ? record.request.headers : null;
  if (isPlainObject(headers)) {
    for (const name of ownKeys(headers)) {
      if (isPaymentHeaderName(name)) {
        hits.push(
          error(
            "paid_as_unpaid",
            `$.request.headers.${name}`,
            "payment header cannot be labeled unpaid",
          ),
        );
      }
    }
  }
  return hits;
}

function findStaleListing(matrix, route, method, amountAtomic) {
  const listings = Array.isArray(matrix.knownStaleListings) ? matrix.knownStaleListings : [];
  return listings.find(
    (item) =>
      item.route === route &&
      item.method === method &&
      item.listedAmountAtomic === amountAtomic &&
      item.catalogAmountAtomic !== amountAtomic,
  );
}

function validateRequest(request, record, errors) {
  if (!isPlainObject(request)) {
    errors.push(error("invalid_shape", "$.request", "request must be an object"));
    return;
  }
  allowKeys(request, REQUEST_KEYS, "$.request", errors);
  requireKeys(request, ["method", "url"], "$.request", errors);
  if (request.method !== record.method) {
    errors.push(error("invalid_shape", "$.request.method", "request method must equal method"));
  }
  if (typeof request.url !== "string" || !request.url.startsWith(RESOURCE_PREFIX)) {
    errors.push(error("invalid_shape", "$.request.url", "request url must be an SDS origin URL"));
  }
  if (Object.hasOwn(request, "headers")) {
    if (!isPlainObject(request.headers)) {
      errors.push(error("invalid_shape", "$.request.headers", "headers must be an object"));
    } else {
      for (const name of ownKeys(request.headers)) {
        if (FORBIDDEN_KEYS.has(name) || !SURFACE_RE.test(name)) {
          errors.push(error("invalid_shape", `$.request.headers.${name}`, "invalid header name"));
        }
      }
    }
  }
}

export function validateRecord(input, matrix = loadMatrix()) {
  const errors = [];
  if (!isPlainObject(input)) {
    return { ok: false, errors: [error("invalid_shape", "$", "record must be an object")] };
  }
  allowKeys(input, ROOT_KEYS, "$", errors);
  requireKeys(
    input,
    [
      "schemaVersion",
      "fixtureId",
      "kind",
      "statusClass",
      "origin",
      "resource",
      "route",
      "method",
      "httpStatus",
      "charged",
      "paymentSent",
      "observedAt",
      "amountAtomic",
      "amountDisplayUsd",
      "network",
      "asset",
      "payTo",
      "request",
      "source",
      "prohibitedInferences",
    ],
    "$",
    errors,
  );

  if (input.schemaVersion !== SCHEMA_VERSION) {
    errors.push(error("invalid_shape", "$.schemaVersion", "unexpected schemaVersion"));
  }
  expectString(input.fixtureId, FIXTURE_ID_RE, "$.fixtureId", errors);
  if (input.kind !== "unpaid_payment_required") {
    errors.push(error("invalid_shape", "$.kind", "kind must be unpaid_payment_required"));
  }
  if (input.origin !== matrix.pin.origin) {
    errors.push(error("pin_mismatch", "$.origin", "origin is not the SDS pin"));
  }
  expectString(input.route, ROUTE_RE, "$.route", errors);
  if (!HTTP_METHODS.has(input.method)) {
    errors.push(error("invalid_shape", "$.method", "method must be GET or POST"));
  }
  if (typeof input.resource !== "string" || !input.resource.startsWith(RESOURCE_PREFIX)) {
    errors.push(error("invalid_shape", "$.resource", "resource must be an SDS origin URL"));
  }
  if (parseRfc3339(input.observedAt) === null) {
    errors.push(error("invalid_shape", "$.observedAt", "invalid observedAt"));
  }
  if (input.charged !== false) {
    errors.push(error("invalid_shape", "$.charged", "charged must be false"));
  }
  if (input.paymentSent !== false) {
    errors.push(error("invalid_shape", "$.paymentSent", "paymentSent must be false"));
  }
  if (input.httpStatus !== 402 && input.httpStatus !== 200) {
    errors.push(error("invalid_shape", "$.httpStatus", "httpStatus must be 402 or 200"));
  }
  if (input.httpStatus === 402 && input.statusClass === "unpaid" && input.kind === "unpaid_payment_required") {
    // expected unpaid challenge
  } else if (input.httpStatus !== 402 && input.statusClass === "unpaid") {
    errors.push(error("invalid_shape", "$.httpStatus", "unpaid challenge kinds must be 402"));
  }

  validateRequest(input.request, input, errors);

  if (Object.hasOwn(input, "editLivePrice") && input.editLivePrice === true) {
    errors.push(error("live_price_edit", "$.editLivePrice", "live catalog amounts are not editable in this pack"));
  }
  if (Object.hasOwn(input, "proposedAmountAtomic")) {
    errors.push(
      error("live_price_edit", "$.proposedAmountAtomic", "proposed amount edits are refused"),
    );
  }

  const atomicOk = typeof input.amountAtomic === "string";
  if (!atomicOk) {
    errors.push(error("invalid_shape", "$.amountAtomic", "amountAtomic must be a string"));
  } else if (input.amountAtomic.includes(".") || input.amountAtomic.includes("e") || input.amountAtomic.includes("E")) {
    errors.push(
      error("wrong_units", "$.amountAtomic", "amountAtomic must be six-decimal USDC atomic digits, not a decimal display"),
    );
  } else if (!ATOMIC_RE.test(input.amountAtomic)) {
    errors.push(error("invalid_shape", "$.amountAtomic", "amountAtomic must be a positive integer string"));
  }

  if (typeof input.amountDisplayUsd !== "string" || !DISPLAY_RE.test(input.amountDisplayUsd)) {
    errors.push(error("invalid_shape", "$.amountDisplayUsd", "amountDisplayUsd must be a decimal string"));
  } else if (atomicOk && ATOMIC_RE.test(input.amountAtomic) && input.amountDisplayUsd === input.amountAtomic) {
    errors.push(
      error(
        "wrong_units",
        "$.amountDisplayUsd",
        "display USD equals atomic units; 5000 atomic is 0.005 USDC, not 5000 dollars",
      ),
    );
  } else if (input.unitsClaim === "usd" || input.unitsClaim === "dollars") {
    errors.push(error("wrong_units", "$.unitsClaim", "atomic amount claimed as dollars"));
  } else if (atomicOk && ATOMIC_RE.test(input.amountAtomic)) {
    const expectedDisplay = atomicToDisplay(input.amountAtomic, matrix.pin.decimals);
    if (expectedDisplay !== input.amountDisplayUsd) {
      errors.push(
        error(
          "display_mismatch",
          "$.amountDisplayUsd",
          `display ${input.amountDisplayUsd} does not equal atomic ${input.amountAtomic} / 1e${matrix.pin.decimals}`,
        ),
      );
    }
  }

  const pin = matrix.pin;
  if (input.network !== pin.network) {
    errors.push(error("pin_mismatch", "$.network", "network is not the SDS pin"));
  }
  if (!expectString(input.asset, ADDR_RE, "$.asset", errors) || addr(input.asset) !== addr(pin.asset)) {
    if (typeof input.asset === "string" && ADDR_RE.test(input.asset)) {
      errors.push(error("pin_mismatch", "$.asset", "asset is not the SDS pin"));
    }
  }
  if (!expectString(input.payTo, ADDR_RE, "$.payTo", errors) || addr(input.payTo) !== addr(pin.payTo)) {
    if (typeof input.payTo === "string" && ADDR_RE.test(input.payTo)) {
      errors.push(error("pin_mismatch", "$.payTo", "payTo is not the SDS pin"));
    }
  }

  if (Object.hasOwn(input, "extra")) {
    if (!isPlainObject(input.extra)) {
      errors.push(error("invalid_shape", "$.extra", "extra must be an object"));
    } else {
      allowKeys(input.extra, EXTRA_KEYS, "$.extra", errors);
    }
  }
  if (Object.hasOwn(input, "maxTimeoutSeconds") && !Number.isInteger(input.maxTimeoutSeconds)) {
    errors.push(error("invalid_shape", "$.maxTimeoutSeconds", "maxTimeoutSeconds must be an integer"));
  }
  if (Object.hasOwn(input, "settlement") && input.settlement !== null) {
    if (!isPlainObject(input.settlement)) {
      errors.push(error("invalid_shape", "$.settlement", "settlement must be an object"));
    } else {
      allowKeys(input.settlement, SETTLEMENT_KEYS, "$.settlement", errors);
      if (Object.hasOwn(input.settlement, "transaction")) {
        expectString(input.settlement.transaction, TX_RE, "$.settlement.transaction", errors);
      }
    }
  }

  if (!isPlainObject(input.source)) {
    errors.push(error("invalid_shape", "$.source", "source must be an object"));
  } else {
    allowKeys(input.source, SOURCE_KEYS, "$.source", errors);
    requireKeys(input.source, ["kind"], "$.source", errors);
    if (Object.hasOwn(input.source, "capturedAt") && parseRfc3339(input.source.capturedAt) === null) {
      errors.push(error("invalid_shape", "$.source.capturedAt", "invalid capturedAt"));
    }
    if (Object.hasOwn(input.source, "note")) {
      expectString(input.source.note, SURFACE_RE, "$.source.note", errors);
    }
  }

  const inferenceOk = expectUniqueStringArray(
    input.prohibitedInferences,
    "$.prohibitedInferences",
    errors,
    TOKEN_RE,
    { min: 4, max: 16 },
  );
  if (inferenceOk && Array.isArray(input.prohibitedInferences)) {
    const listed = new Set(input.prohibitedInferences);
    for (const required of matrix.requiredProhibitedInferences) {
      if (!listed.has(required)) {
        errors.push(error("missing_prohibited_inference", "$.prohibitedInferences", `missing ${required}`));
      }
    }
  }

  if (Object.hasOwn(input, "unknownWhenAbsent")) {
    expectUniqueStringArray(input.unknownWhenAbsent, "$.unknownWhenAbsent", errors, TOKEN_RE, {
      min: 1,
      max: 8,
    });
  }

  if (input.statusClass !== "unpaid") {
    errors.push(error("not_unpaid", "$.statusClass", "this pack accepts unpaid amount fixtures only"));
  }

  errors.push(...collectPaidEvidence(input));

  const routes = indexRoutes(matrix);
  const row = HTTP_METHODS.has(input.method) && typeof input.route === "string"
    ? routes.get(routeKey(input.method, input.route))
    : null;
  if (!row) {
    errors.push(error("unknown_route", "$.route", "route is not in the W7 amount matrix"));
  } else {
    if (input.resource !== row.resource) {
      errors.push(error("resource_mismatch", "$.resource", "resource is not the catalog example URL"));
    }
    const stale = findStaleListing(matrix, input.route, input.method, input.amountAtomic);
    if (stale) {
      errors.push(
        error(
          "stale_listed_amount",
          "$.amountAtomic",
          `listed ${stale.listedAmountAtomic} is not catalog ${stale.catalogAmountAtomic} for ${stale.route}`,
        ),
      );
    } else if (ATOMIC_RE.test(String(input.amountAtomic)) && input.amountAtomic !== row.amountAtomic) {
      errors.push(
        error(
          "amount_mismatch",
          "$.amountAtomic",
          `amount ${input.amountAtomic} does not match matrix ${row.amountAtomic} for ${row.method} ${row.route}`,
        ),
      );
    }
    if (
      ATOMIC_RE.test(String(input.amountAtomic)) &&
      input.amountAtomic === row.amountAtomic &&
      typeof input.amountDisplayUsd === "string" &&
      DISPLAY_RE.test(input.amountDisplayUsd) &&
      input.amountDisplayUsd !== row.amountDisplayUsd &&
      input.amountDisplayUsd !== input.amountAtomic
    ) {
      errors.push(
        error(
          "display_mismatch",
          "$.amountDisplayUsd",
          `display ${input.amountDisplayUsd} does not match matrix ${row.amountDisplayUsd}`,
        ),
      );
    }
    if (Object.hasOwn(input, "maxTimeoutSeconds") && input.maxTimeoutSeconds !== row.maxTimeoutSeconds) {
      errors.push(error("pin_mismatch", "$.maxTimeoutSeconds", "maxTimeoutSeconds is not the catalog pin"));
    }
  }

  const unique = [];
  const seen = new Set();
  for (const item of errors) {
    const key = `${item.code}|${item.path}|${item.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique.length === 0 ? { ok: true, errors: [] } : { ok: false, errors: unique };
}

export function evaluateRecord(input, matrix = loadMatrix()) {
  const result = validateRecord(input, matrix);
  const paidEvidence = collectPaidEvidence(input);
  return {
    ...result,
    naiveVerdict: naiveVerdict(input),
    honestVerdict: result.ok ? "accept" : "reject",
    paidEvidence,
    codes: result.errors.map((item) => item.code),
  };
}

export function validateFile(filePath, matrix = loadMatrix()) {
  let record;
  try {
    record = loadJson(filePath);
  } catch (cause) {
    return {
      ok: false,
      filePath,
      naiveVerdict: "reject",
      honestVerdict: "reject",
      paidEvidence: [],
      codes: ["invalid_shape"],
      errors: [error("invalid_shape", "$", `cannot parse JSON: ${cause.message}`)],
    };
  }
  const evaluated = evaluateRecord(record, matrix);
  return {
    ...evaluated,
    filePath,
    fixtureId: record.fixtureId ?? null,
    statusClass: record.statusClass ?? null,
    route: record.route ?? null,
    amountAtomic: record.amountAtomic ?? null,
  };
}

export function runSuite(matrix = loadMatrix()) {
  const results = [];
  for (const filePath of listJsonFiles(VALID_FIXTURES)) {
    const result = validateFile(filePath, matrix);
    results.push({
      filePath,
      expect: "accept",
      ok: result.ok,
      errors: result.errors,
    });
  }

  const manifest = loadInvalidManifest();
  for (const [name, spec] of Object.entries(manifest)) {
    const filePath = join(INVALID_FIXTURES, name);
    const result = validateFile(filePath, matrix);
    const codes = result.errors.map((item) => item.code);
    const matched = !result.ok && codes.includes(spec.code);
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
  return {
    ok: failed === 0,
    passed,
    failed,
    total: results.length,
    results,
  };
}

export function evaluateSeededFailure(matrix = loadMatrix()) {
  const seed = matrix.designatedSeed;
  if (!seed || seed.id !== SEEDED_FAILURE) {
    return {
      ok: false,
      caught: false,
      error: { code: "SEED_MISS", message: "matrix designatedSeed.id must be stale-listed-amount" },
    };
  }
  const filePath = designatedSeedPath(matrix);
  const result = validateFile(filePath, matrix);
  const codes = result.errors.map((item) => item.code);
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
          ? "seeded stale-listed-amount was accepted as a catalog unpaid amount"
          : `seeded stale-listed-amount not caught on ${seed.id}`,
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
      message: `seeded stale-listed-amount caught on ${seed.id}`,
    },
  };
}

export function crossCheckInTreeCatalog(matrix = loadMatrix(), catalogPath = IN_TREE_X402) {
  if (!existsSync(catalogPath)) {
    return {
      ok: false,
      error: { code: "CATALOG_MISS", message: `in-tree catalog missing: ${catalogPath}` },
    };
  }
  const catalog = loadJson(catalogPath);
  const items = Array.isArray(catalog.items) ? catalog.items : [];
  const findings = [];
  const seen = new Set();
  for (const item of items) {
    const route = item?.resource?.routeTemplate;
    const method = item?.request?.method;
    const amount = item?.accepts?.[0]?.amount;
    const resource = item?.resource?.url;
    const key = routeKey(method, route);
    seen.add(key);
    const row = matrix.routes.find((entry) => entry.method === method && entry.route === route);
    if (!row) {
      findings.push({ code: "matrix_missing_route", key, amount, resource });
      continue;
    }
    if (row.amountAtomic !== amount) {
      findings.push({
        code: "amount_drift",
        key,
        matrixAmount: row.amountAtomic,
        catalogAmount: amount,
      });
    }
    if (row.resource !== resource) {
      findings.push({ code: "resource_drift", key });
    }
  }
  for (const row of matrix.routes) {
    const key = routeKey(row.method, row.route);
    if (!seen.has(key)) {
      findings.push({ code: "catalog_missing_route", key, amount: row.amountAtomic });
    }
  }
  return {
    ok: findings.length === 0,
    catalogPath,
    lastUpdated: catalog.lastUpdated ?? null,
    matrixRoutes: matrix.routes.length,
    catalogItems: items.length,
    findings,
  };
}

export function matrixSummary(matrix = loadMatrix()) {
  return {
    ok: true,
    pack: matrix.pack,
    week: matrix.week,
    pin: matrix.pin,
    uniqueAmounts: matrix.uniqueAmounts,
    routes: matrix.routes.map((row) => ({
      method: row.method,
      route: row.route,
      amountAtomic: row.amountAtomic,
      amountDisplayUsd: row.amountDisplayUsd,
    })),
    knownStaleListings: matrix.knownStaleListings,
    designatedSeed: matrix.designatedSeed,
    boundary: matrix.boundary,
  };
}

export function coverageReport(matrix = loadMatrix()) {
  const files = listJsonFiles(VALID_FIXTURES).map((filePath) => ({
    filePath,
    record: loadJson(filePath),
  }));
  const covered = new Set();
  for (const file of files) {
    covered.add(routeKey(file.record.method, file.record.route));
  }
  const missing = matrix.routes
    .filter((row) => !covered.has(routeKey(row.method, row.route)))
    .map((row) => routeKey(row.method, row.route));
  const uniqueCovered = new Set(files.map((file) => file.record.amountAtomic));
  const uniqueMissing = matrix.uniqueAmounts
    .filter((item) => !uniqueCovered.has(item.amountAtomic))
    .map((item) => item.amountAtomic);
  return {
    ok: missing.length === 0 && uniqueMissing.length === 0,
    validFixtures: files.length,
    matrixRoutes: matrix.routes.length,
    uniqueAmounts: matrix.uniqueAmounts.length,
    uniqueCovered: uniqueCovered.size,
    missingRoutes: missing,
    missingAmounts: uniqueMissing,
  };
}

export function refusedFlag(argv) {
  for (const arg of argv) {
    const name = String(arg).replace(/^--/, "");
    if (REFUSED_FLAGS.includes(name)) return arg;
  }
  return null;
}
