import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, "../..");
export const FIXTURE_ROOT = join(here, "fixtures");
export const VALID_FIXTURES = join(FIXTURE_ROOT, "valid");
export const INVALID_FIXTURES = join(FIXTURE_ROOT, "invalid");
export const DEFAULT_CATALOG = join(FIXTURE_ROOT, "catalog.json");
export const DEFAULT_SCHEMA = join(here, "schema/commerce-receipt.v1.json");
export const INVALID_MANIFEST = join(INVALID_FIXTURES, "manifest.json");

export const PRODUCT = "samedaydesk-commerce-receipts";
export const SCHEMA_VERSION = "samedaydesk.commerce-receipt.v1";
export const SEEDED_FAILURE = "paid-as-unpaid";

const RECEIPT_ID_RE = /^[a-z][a-z0-9_-]{2,95}$/;
const TOKEN_RE = /^[a-z][a-z0-9_]{1,95}$/;
const UNKNOWN_RE = /^[\x20-\x7E]{1,160}$/;
const SURFACE_RE = /^[\x20-\x7E]{1,400}$/;
const ROUTE_RE = /^\/[^?#]*$/;
const AMOUNT_RE = /^[1-9][0-9]{0,20}$/;
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const TX_RE = /^0x[a-f0-9]{64}$/;
const RFC3339_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;
const RESOURCE_PREFIX = "https://agents.samedaydesk.com/";
const PAYMENT_HEADER_RE = /^(PAYMENT-SIGNATURE|X-PAYMENT|PAYMENT-RESPONSE)$/i;
const HTTP_METHODS = new Set(["GET", "POST"]);
const HTTP_CHALLENGE_KINDS = new Set([
  "unpaid_payment_required",
  "unpaid_offer",
  "unpaid_probe",
]);
const EXTRA_KEYS = Object.freeze(["name", "version", "verifyingContract"]);
const ACCEPT_KEYS = Object.freeze([
  "scheme",
  "network",
  "amount",
  "asset",
  "payTo",
  "maxTimeoutSeconds",
  "extra",
]);
const REQUEST_KEYS = Object.freeze(["method", "url", "headers"]);
const SOURCE_KEYS = Object.freeze(["kind", "capturedAt", "path", "note"]);
const OFFER_KEYS = Object.freeze(["format", "acceptIndex", "payload"]);
const PAYLOAD_KEYS = Object.freeze([
  "version",
  "resourceUrl",
  "scheme",
  "network",
  "asset",
  "payTo",
  "amount",
]);
const OFFER_RECEIPT_KEYS = Object.freeze(["offers", "receipt"]);
const SETTLEMENT_KEYS = Object.freeze([
  "operationId",
  "amountUsdc",
  "transaction",
  "facilitatorOrPayoutRef",
]);
const ROOT_KEYS = Object.freeze([
  "schemaVersion",
  "receiptId",
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
  "completeness",
  "authorityClass",
  "request",
  "accepts",
  "offerReceipt",
  "settlement",
  "joinKeys",
  "source",
  "unknownWhenAbsent",
  "prohibitedInferences",
]);
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
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

export function loadCatalog(catalogPath = DEFAULT_CATALOG) {
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  if (!catalog || typeof catalog !== "object" || !catalog.pin) {
    throw new Error("catalog must contain a pin object");
  }
  return catalog;
}

export function loadSchema(schemaPath = DEFAULT_SCHEMA) {
  return JSON.parse(readFileSync(schemaPath, "utf8"));
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

export function designatedSeedPath(catalog = loadCatalog()) {
  return join(FIXTURE_ROOT, catalog.designatedSeed.file);
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
    hits.push(error("paid_as_unpaid", "$.charged", "charged true cannot be an unpaid receipt"));
  }
  if (record.paymentSent === true) {
    hits.push(error("paid_as_unpaid", "$.paymentSent", "paymentSent true cannot be an unpaid receipt"));
  }
  if (record.httpStatus === 200) {
    hits.push(error("paid_as_unpaid", "$.httpStatus", "HTTP 200 cannot be an unpaid 402 receipt"));
  }
  if (Object.hasOwn(record, "settlement") && record.settlement !== null) {
    hits.push(
      error("paid_as_unpaid", "$.settlement", "settlement object cannot be labeled unpaid"),
    );
  }
  if (isPlainObject(record.offerReceipt) && record.offerReceipt.receipt != null) {
    hits.push(
      error(
        "paid_as_unpaid",
        "$.offerReceipt.receipt",
        "settled offer-receipt.receipt cannot be labeled unpaid",
      ),
    );
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

function validateAccept(accept, index, catalog, errors) {
  const path = `$.accepts[${index}]`;
  if (!isPlainObject(accept)) {
    errors.push(error("invalid_shape", path, "accept must be an object"));
    return;
  }
  allowKeys(accept, ACCEPT_KEYS, path, errors);
  requireKeys(accept, ["scheme", "network", "amount", "asset", "payTo"], path, errors);
  const pin = catalog.pin;
  if (accept.scheme !== pin.scheme) {
    errors.push(error("pin_mismatch", `${path}.scheme`, "scheme is not the SDS pin"));
  }
  if (accept.network !== pin.network) {
    errors.push(error("pin_mismatch", `${path}.network`, "network is not the SDS pin"));
  }
  expectString(accept.amount, AMOUNT_RE, `${path}.amount`, errors);
  if (!expectString(accept.asset, ADDR_RE, `${path}.asset`, errors) || addr(accept.asset) !== addr(pin.asset)) {
    if (typeof accept.asset === "string" && ADDR_RE.test(accept.asset)) {
      errors.push(error("pin_mismatch", `${path}.asset`, "asset is not the SDS pin"));
    }
  }
  if (!expectString(accept.payTo, ADDR_RE, `${path}.payTo`, errors) || addr(accept.payTo) !== addr(pin.payTo)) {
    if (typeof accept.payTo === "string" && ADDR_RE.test(accept.payTo)) {
      errors.push(error("pin_mismatch", `${path}.payTo`, "payTo is not the SDS pin"));
    }
  }
  if (Object.hasOwn(accept, "maxTimeoutSeconds")) {
    if (!Number.isInteger(accept.maxTimeoutSeconds) || accept.maxTimeoutSeconds < 1) {
      errors.push(error("invalid_shape", `${path}.maxTimeoutSeconds`, "invalid timeout"));
    }
  }
  if (Object.hasOwn(accept, "extra")) {
    if (!isPlainObject(accept.extra)) {
      errors.push(error("invalid_shape", `${path}.extra`, "extra must be an object"));
    } else {
      allowKeys(accept.extra, EXTRA_KEYS, `${path}.extra`, errors);
      requireKeys(accept.extra, ["name", "version"], `${path}.extra`, errors);
      expectString(accept.extra.name, /^[\x20-\x7E]{1,64}$/, `${path}.extra.name`, errors);
      expectString(accept.extra.version, /^[\x20-\x7E]{1,16}$/, `${path}.extra.version`, errors);
      if (Object.hasOwn(accept.extra, "verifyingContract")) {
        expectString(accept.extra.verifyingContract, ADDR_RE, `${path}.extra.verifyingContract`, errors);
      }
    }
  }
}

function validateRequest(request, record, errors) {
  if (!isPlainObject(request)) {
    errors.push(error("invalid_shape", "$.request", "request must be an object"));
    return;
  }
  allowKeys(request, REQUEST_KEYS, "$.request", errors);
  requireKeys(request, REQUEST_KEYS, "$.request", errors);
  if (!HTTP_METHODS.has(request.method)) {
    errors.push(error("invalid_shape", "$.request.method", "method is not GET or POST"));
  } else if (request.method !== record.method) {
    errors.push(error("invalid_shape", "$.request.method", "request.method must equal method"));
  }
  if (typeof request.url !== "string" || !request.url.startsWith(RESOURCE_PREFIX)) {
    errors.push(error("invalid_shape", "$.request.url", "url must be on the SDS origin"));
  }
  if (!isPlainObject(request.headers)) {
    errors.push(error("invalid_shape", "$.request.headers", "headers must be an object"));
  } else {
    for (const key of ownKeys(request.headers)) {
      if (FORBIDDEN_KEYS.has(key) || typeof request.headers[key] !== "string") {
        errors.push(error("invalid_shape", `$.request.headers.${key}`, "header values must be strings"));
      }
    }
  }
}

function validateOfferReceipt(offerReceipt, record, errors) {
  if (!isPlainObject(offerReceipt)) {
    errors.push(error("invalid_shape", "$.offerReceipt", "offerReceipt must be an object"));
    return;
  }
  allowKeys(offerReceipt, OFFER_RECEIPT_KEYS, "$.offerReceipt", errors);
  if (Object.hasOwn(offerReceipt, "offers")) {
    if (!Array.isArray(offerReceipt.offers) || offerReceipt.offers.length > 4) {
      errors.push(error("invalid_shape", "$.offerReceipt.offers", "offers must be a short array"));
    } else {
      const accepts = Array.isArray(record.accepts) ? record.accepts : [];
      for (let i = 0; i < offerReceipt.offers.length; i += 1) {
        const offer = offerReceipt.offers[i];
        const path = `$.offerReceipt.offers[${i}]`;
        if (!isPlainObject(offer)) {
          errors.push(error("invalid_shape", path, "offer must be an object"));
          continue;
        }
        allowKeys(offer, OFFER_KEYS, path, errors);
        requireKeys(offer, OFFER_KEYS, path, errors);
        expectString(offer.format, /^[a-z0-9-]{2,32}$/, `${path}.format`, errors);
        if (!Number.isInteger(offer.acceptIndex) || offer.acceptIndex < 0 || offer.acceptIndex >= accepts.length) {
          errors.push(error("invalid_shape", `${path}.acceptIndex`, "acceptIndex is out of range"));
        }
        if (!isPlainObject(offer.payload)) {
          errors.push(error("invalid_shape", `${path}.payload`, "payload must be an object"));
          continue;
        }
        allowKeys(offer.payload, PAYLOAD_KEYS, `${path}.payload`, errors);
        requireKeys(offer.payload, PAYLOAD_KEYS, `${path}.payload`, errors);
        const accept = accepts[offer.acceptIndex];
        if (accept && offer.payload.amount !== accept.amount) {
          errors.push(error("offer_accept_mismatch", `${path}.payload.amount`, "offer amount must equal accept amount"));
        }
        if (accept && addr(offer.payload.payTo) !== addr(accept.payTo)) {
          errors.push(error("offer_accept_mismatch", `${path}.payload.payTo`, "offer payTo must equal accept payTo"));
        }
      }
    }
  }
}

function validateSettlementShape(settlement, errors) {
  if (!isPlainObject(settlement)) {
    errors.push(error("invalid_shape", "$.settlement", "settlement must be an object"));
    return;
  }
  allowKeys(settlement, SETTLEMENT_KEYS, "$.settlement", errors);
  if (Object.hasOwn(settlement, "transaction")) {
    expectString(settlement.transaction, TX_RE, "$.settlement.transaction", errors);
  }
}

export function validateRecord(input, catalog = loadCatalog()) {
  const errors = [];
  if (!isPlainObject(input)) {
    return { ok: false, errors: [error("invalid_shape", "$", "record must be a plain object")] };
  }

  allowKeys(input, ROOT_KEYS, "$", errors);
  requireKeys(
    input,
    [
      "schemaVersion",
      "receiptId",
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
      "completeness",
      "authorityClass",
      "request",
      "accepts",
      "joinKeys",
      "source",
      "unknownWhenAbsent",
      "prohibitedInferences",
    ],
    "$",
    errors,
  );

  if (input.schemaVersion !== catalog.recordSchemaVersion) {
    errors.push(error("unknown_schema_version", "$.schemaVersion", "unsupported schemaVersion"));
  }
  expectString(input.receiptId, RECEIPT_ID_RE, "$.receiptId", errors);
  if (!catalog.kinds.includes(input.kind)) {
    errors.push(error("unknown_kind", "$.kind", "kind is not in the closed unpaid set"));
  }
  if (input.origin !== catalog.pin.origin) {
    errors.push(error("pin_mismatch", "$.origin", "origin is not the SDS pin"));
  }
  if (typeof input.resource !== "string" || !input.resource.startsWith(RESOURCE_PREFIX)) {
    errors.push(error("invalid_shape", "$.resource", "resource must be on the SDS origin"));
  }
  expectString(input.route, ROUTE_RE, "$.route", errors);
  if (!HTTP_METHODS.has(input.method)) {
    errors.push(error("invalid_shape", "$.method", "method is not GET or POST"));
  }
  if (typeof input.charged !== "boolean") {
    errors.push(error("invalid_shape", "$.charged", "charged must be a boolean"));
  }
  if (typeof input.paymentSent !== "boolean") {
    errors.push(error("invalid_shape", "$.paymentSent", "paymentSent must be a boolean"));
  }
  if (parseRfc3339(input.observedAt) === null) {
    errors.push(error("invalid_shape", "$.observedAt", "observedAt must be RFC3339 milliseconds Z"));
  }
  if (!catalog.completeness.includes(input.completeness)) {
    errors.push(error("invalid_completeness", "$.completeness", "completeness is not in the closed set"));
  }
  if (!catalog.authorityClasses.includes(input.authorityClass)) {
    errors.push(error("invalid_authority_class", "$.authorityClass", "authorityClass is not in the closed set"));
  }

  if (input.httpStatus === null) {
    if (input.kind !== "unpaid_buyer_stop") {
      errors.push(error("invalid_shape", "$.httpStatus", "null httpStatus is only valid for unpaid_buyer_stop"));
    }
  } else if (!Number.isInteger(input.httpStatus)) {
    errors.push(error("invalid_shape", "$.httpStatus", "httpStatus must be an integer or null"));
  } else if (input.kind === "unpaid_buyer_stop") {
    errors.push(error("invalid_shape", "$.httpStatus", "unpaid_buyer_stop has no HTTP response yet"));
  } else if (HTTP_CHALLENGE_KINDS.has(input.kind) && input.httpStatus !== 402 && input.httpStatus !== 200) {
    errors.push(error("invalid_shape", "$.httpStatus", "HTTP challenge kinds must be 402 when unpaid"));
  }

  validateRequest(input.request, input, errors);

  if (!Array.isArray(input.accepts) || input.accepts.length < 1 || input.accepts.length > 4) {
    errors.push(error("invalid_shape", "$.accepts", "accepts must contain 1 to 4 entries"));
  } else {
    for (let i = 0; i < input.accepts.length; i += 1) {
      validateAccept(input.accepts[i], i, catalog, errors);
    }
  }

  if (Object.hasOwn(input, "offerReceipt")) {
    validateOfferReceipt(input.offerReceipt, input, errors);
  }
  if (Object.hasOwn(input, "settlement") && input.settlement !== null) {
    validateSettlementShape(input.settlement, errors);
  }

  const joinOk = expectUniqueStringArray(input.joinKeys, "$.joinKeys", errors, TOKEN_RE, {
    min: catalog.requiredJoinKeys.length,
    max: 16,
  });
  if (joinOk && Array.isArray(input.joinKeys)) {
    for (const key of catalog.requiredJoinKeys) {
      if (!input.joinKeys.includes(key)) {
        errors.push(error("missing_join_key", "$.joinKeys", `missing ${key}`));
      }
    }
  }

  if (!isPlainObject(input.source)) {
    errors.push(error("invalid_shape", "$.source", "source must be an object"));
  } else {
    allowKeys(input.source, SOURCE_KEYS, "$.source", errors);
    requireKeys(input.source, ["kind"], "$.source", errors);
    if (!catalog.sourceKinds.includes(input.source.kind)) {
      errors.push(error("unknown_source_kind", "$.source.kind", "unknown source kind"));
    }
    if (Object.hasOwn(input.source, "capturedAt") && parseRfc3339(input.source.capturedAt) === null) {
      errors.push(error("invalid_shape", "$.source.capturedAt", "invalid capturedAt"));
    }
    if (Object.hasOwn(input.source, "path")) {
      expectString(input.source.path, /^[\x20-\x7E]{3,200}$/, "$.source.path", errors);
    }
    if (Object.hasOwn(input.source, "note")) {
      expectString(input.source.note, SURFACE_RE, "$.source.note", errors);
    }
  }

  expectUniqueStringArray(input.unknownWhenAbsent, "$.unknownWhenAbsent", errors, UNKNOWN_RE, {
    min: 1,
    max: 8,
  });

  const inferenceOk = expectUniqueStringArray(
    input.prohibitedInferences,
    "$.prohibitedInferences",
    errors,
    TOKEN_RE,
    { min: 4, max: 16 },
  );
  if (inferenceOk && Array.isArray(input.prohibitedInferences)) {
    const listed = new Set(input.prohibitedInferences);
    for (const code of input.prohibitedInferences) {
      if (!catalog.prohibitedInferences.includes(code)) {
        errors.push(error("unknown_prohibited_inference", "$.prohibitedInferences", code));
      }
    }
    for (const required of catalog.requiredProhibitedInferences) {
      if (!listed.has(required)) {
        errors.push(error("missing_prohibited_inference", "$.prohibitedInferences", `missing ${required}`));
      }
    }
  }

  if (input.statusClass !== "unpaid") {
    errors.push(error("not_unpaid", "$.statusClass", "this pack accepts unpaid receipts only"));
  }

  errors.push(...collectPaidEvidence(input));

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

export function evaluateRecord(input, catalog = loadCatalog()) {
  const result = validateRecord(input, catalog);
  const paidEvidence = collectPaidEvidence(input);
  const naive = naiveVerdict(input);
  const honest = result.ok ? "accept" : "reject";
  return {
    ...result,
    naiveVerdict: naive,
    honestVerdict: honest,
    paidEvidence,
    codes: result.errors.map((item) => item.code),
  };
}

export function validateFile(filePath, catalog = loadCatalog()) {
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
  const evaluated = evaluateRecord(record, catalog);
  return { ...evaluated, filePath, receiptId: record.receiptId ?? null, statusClass: record.statusClass ?? null };
}

export function runSuite(catalog = loadCatalog()) {
  const results = [];
  for (const filePath of listJsonFiles(VALID_FIXTURES)) {
    const result = validateFile(filePath, catalog);
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
    const result = validateFile(filePath, catalog);
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

export function evaluateSeededFailure(catalog = loadCatalog()) {
  const seed = catalog.designatedSeed;
  if (!seed || seed.id !== SEEDED_FAILURE) {
    return {
      ok: false,
      caught: false,
      error: { code: "SEED_MISS", message: "catalog designatedSeed.id must be paid-as-unpaid" },
    };
  }
  const filePath = designatedSeedPath(catalog);
  const result = validateFile(filePath, catalog);
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
          ? "seeded paid-as-unpaid was accepted as unpaid"
          : `seeded paid-as-unpaid not caught on ${seed.id}`,
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
      message: `seeded paid-as-unpaid caught on ${seed.id}`,
    },
  };
}

export function refusedFlag(argv) {
  for (const arg of argv) {
    const name = String(arg).replace(/^--/, "");
    if (REFUSED_FLAGS.includes(name)) return arg;
  }
  return null;
}
