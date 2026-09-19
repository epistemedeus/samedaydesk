import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACCEPT_KEYS,
  ADDR_RE,
  AMOUNT_RE,
  AUTHORITY_CLASSES,
  COMPLETENESS,
  DIGEST_RE,
  EXTRA_KEYS,
  FORBIDDEN_KEYS,
  HTTP_CHALLENGE_KINDS,
  HTTP_METHODS,
  INTEGRITY_KEYS,
  KINDS,
  KNOWN_SETTLEMENT,
  OFFER_KEYS,
  OFFER_RECEIPT_KEYS,
  PAYLOAD_KEYS,
  PAYMENT_HEADER_RE,
  PRODUCT,
  PROHIBITED_INFERENCES,
  RECEIPT_ID_RE,
  REFUSED_FLAGS,
  REQUEST_KEYS,
  REQUIRED_JOIN_KEYS,
  REQUIRED_PROHIBITED_INFERENCES,
  RESOURCE_PREFIX,
  RFC3339_RE,
  ROOT_KEYS,
  ROUTE_RE,
  SCHEMA_VERSION,
  SDS_PIN,
  SEEDED_CODE,
  SEEDED_FAILURE,
  SETTLEMENT_KEYS,
  SOURCE_KEYS,
  SOURCE_KINDS,
  SPENT_RECEIPT_ID,
  SURFACE_RE,
  TOKEN_RE,
  TX_RE,
  UNKNOWN_RE,
} from "./constants.mjs";
import { digestClaim, isPlainObject, ownKeys } from "./digest.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const PACK_ROOT = join(here, "..");
export const FIXTURE_ROOT = join(PACK_ROOT, "fixtures");
export const VALID_FIXTURES = join(FIXTURE_ROOT, "valid");
export const REJECT_FIXTURES = join(FIXTURE_ROOT, "reject");
export const DEFAULT_CATALOG = join(FIXTURE_ROOT, "catalog.json");
export const DEFAULT_SCHEMA = join(PACK_ROOT, "schema", "receipt-claim.v1.json");
export const REJECT_MANIFEST = join(REJECT_FIXTURES, "manifest.json");

export { PRODUCT, SCHEMA_VERSION, SEEDED_CODE, SEEDED_FAILURE };

function error(code, path, message) {
  return { code, path, message };
}

function allowKeys(obj, allowed, path, errors) {
  const allowedSet = new Set(allowed);
  for (const key of ownKeys(obj)) {
    if (FORBIDDEN_KEYS.includes(key) || !allowedSet.has(key)) {
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

export function loadRejectManifest(manifestPath = REJECT_MANIFEST) {
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

export function designatedSeedPath(catalog = loadCatalog()) {
  return join(FIXTURE_ROOT, catalog.designatedSeed.file);
}

export function isPaymentHeaderName(name) {
  return PAYMENT_HEADER_RE.test(String(name || ""));
}

export function naiveVerdict(claim) {
  if (!isPlainObject(claim)) return "reject";
  if (typeof claim.receiptId !== "string" || !RECEIPT_ID_RE.test(claim.receiptId)) return "reject";
  if (claim.origin !== SDS_PIN.origin) return "reject";
  if (!isPlainObject(claim.integrity)) return "reject";
  if (!DIGEST_RE.test(claim.integrity.claimedDigest)) return "reject";
  return "accept";
}

function validateAccept(accept, index, errors) {
  const path = `$.accepts[${index}]`;
  if (!isPlainObject(accept)) {
    errors.push(error("invalid_shape", path, "accept must be an object"));
    return;
  }
  allowKeys(accept, ACCEPT_KEYS, path, errors);
  requireKeys(accept, ["scheme", "network", "amount", "asset", "payTo"], path, errors);
  if (accept.scheme !== SDS_PIN.scheme) {
    errors.push(error("pin_mismatch", `${path}.scheme`, "scheme is not the SDS pin"));
  }
  if (accept.network !== SDS_PIN.network) {
    errors.push(error("pin_mismatch", `${path}.network`, "network is not the SDS pin"));
  }
  expectString(accept.amount, AMOUNT_RE, `${path}.amount`, errors);
  if (!expectString(accept.asset, ADDR_RE, `${path}.asset`, errors) || addr(accept.asset) !== addr(SDS_PIN.asset)) {
    if (typeof accept.asset === "string" && ADDR_RE.test(accept.asset)) {
      errors.push(error("pin_mismatch", `${path}.asset`, "asset is not the SDS pin"));
    }
  }
  if (!expectString(accept.payTo, ADDR_RE, `${path}.payTo`, errors) || addr(accept.payTo) !== addr(SDS_PIN.payTo)) {
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
    }
  }
}

function validateRequest(request, claim, errors) {
  if (!isPlainObject(request)) {
    errors.push(error("invalid_shape", "$.request", "request must be an object"));
    return;
  }
  allowKeys(request, REQUEST_KEYS, "$.request", errors);
  requireKeys(request, REQUEST_KEYS, "$.request", errors);
  if (!HTTP_METHODS.includes(request.method)) {
    errors.push(error("invalid_shape", "$.request.method", "method is not GET or POST"));
  } else if (request.method !== claim.method) {
    errors.push(error("invalid_shape", "$.request.method", "request.method must equal method"));
  }
  if (typeof request.url !== "string" || !request.url.startsWith(RESOURCE_PREFIX)) {
    errors.push(error("invalid_shape", "$.request.url", "url must be on the SDS origin"));
  } else if (request.url !== claim.resource) {
    errors.push(error("invalid_shape", "$.request.url", "request.url must equal resource"));
  }
  if (!isPlainObject(request.headers)) {
    errors.push(error("invalid_shape", "$.request.headers", "headers must be an object"));
    return;
  }
  for (const key of ownKeys(request.headers)) {
    if (FORBIDDEN_KEYS.includes(key) || typeof request.headers[key] !== "string") {
      errors.push(error("invalid_shape", `$.request.headers.${key}`, "header values must be strings"));
    }
    if (isPaymentHeaderName(key)) {
      errors.push(
        error(
          "payment_header_forge",
          `$.request.headers.${key}`,
          "payment header on an unpaid receipt is a forged payment",
        ),
      );
    }
  }
}

function validateOfferReceipt(offerReceipt, claim, errors) {
  if (!isPlainObject(offerReceipt)) {
    errors.push(error("invalid_shape", "$.offerReceipt", "offerReceipt must be an object"));
    return;
  }
  allowKeys(offerReceipt, OFFER_RECEIPT_KEYS, "$.offerReceipt", errors);
  if (Object.hasOwn(offerReceipt, "receipt") && offerReceipt.receipt != null) {
    errors.push(
      error(
        "copied_settlement",
        "$.offerReceipt.receipt",
        "settled offer-receipt.receipt cannot appear on an unpaid claim",
      ),
    );
  }
  if (!Object.hasOwn(offerReceipt, "offers")) return;
  if (!Array.isArray(offerReceipt.offers) || offerReceipt.offers.length > 4) {
    errors.push(error("invalid_shape", "$.offerReceipt.offers", "offers must be a short array"));
    return;
  }
  const accepts = Array.isArray(claim.accepts) ? claim.accepts : [];
  for (let i = 0; i < offerReceipt.offers.length; i += 1) {
    const offer = offerReceipt.offers[i];
    const path = `$.offerReceipt.offers[${i}]`;
    if (!isPlainObject(offer)) {
      errors.push(error("invalid_shape", path, "offer must be an object"));
      continue;
    }
    allowKeys(offer, OFFER_KEYS, path, errors);
    requireKeys(offer, OFFER_KEYS, path, errors);
    if (!isPlainObject(offer.payload)) {
      errors.push(error("invalid_shape", `${path}.payload`, "payload must be an object"));
      continue;
    }
    allowKeys(offer.payload, PAYLOAD_KEYS, `${path}.payload`, errors);
    const accept = accepts[offer.acceptIndex];
    if (accept && offer.payload.amount !== accept.amount) {
      errors.push(error("receipt_forged", `${path}.payload.amount`, "offer amount does not match accept"));
    }
    if (accept && addr(offer.payload.payTo) !== addr(accept.payTo)) {
      errors.push(error("receipt_forged", `${path}.payload.payTo`, "offer payTo does not match accept"));
    }
  }
}

function validateSettlement(settlement, claim, catalog, errors) {
  if (!isPlainObject(settlement)) {
    errors.push(error("invalid_shape", "$.settlement", "settlement must be an object"));
    return;
  }
  allowKeys(settlement, SETTLEMENT_KEYS, "$.settlement", errors);
  const tx = settlement.transaction;
  if (typeof tx !== "string" || !TX_RE.test(tx)) {
    errors.push(error("fabricated_settlement", "$.settlement.transaction", "settlement transaction is not a bound hex"));
    return;
  }
  const known = (catalog.pin.settlements ?? [KNOWN_SETTLEMENT]).find(
    (row) => String(row.transaction).toLowerCase() === tx.toLowerCase(),
  );
  if (!known) {
    errors.push(
      error(
        "fabricated_settlement",
        "$.settlement.transaction",
        "settlement transaction is not in the local SDS pin",
      ),
    );
    return;
  }
  const receiptOk = claim.receiptId === known.boundReceiptId;
  const resourceOk = claim.resource === known.boundResource;
  const routeOk = claim.route === known.boundRoute;
  const urlOk = claim.request?.url === known.boundResource;
  if (!receiptOk || !resourceOk || !routeOk || !urlOk) {
    errors.push(
      error(
        "copied_settlement",
        "$.settlement.transaction",
        "settlement transaction is bound to a different SDS receipt or resource",
      ),
    );
  }
}

function validateIntegrity(claim, errors) {
  const integrity = claim.integrity;
  if (!isPlainObject(integrity)) {
    errors.push(error("invalid_shape", "$.integrity", "integrity must be an object"));
    return;
  }
  allowKeys(integrity, INTEGRITY_KEYS, "$.integrity", errors);
  requireKeys(integrity, INTEGRITY_KEYS, "$.integrity", errors);
  if (integrity.alg !== "sha256") {
    errors.push(error("invalid_shape", "$.integrity.alg", "alg must be sha256"));
  }
  if (!expectString(integrity.claimedDigest, DIGEST_RE, "$.integrity.claimedDigest", errors)) {
    return;
  }
  const actual = digestClaim(claim);
  if (actual !== integrity.claimedDigest) {
    errors.push(
      error(
        "receipt_forged",
        "$.integrity.claimedDigest",
        "claimed digest does not match canonical unpaid receipt bytes",
      ),
    );
  }
}

export function validateClaim(input, catalog = loadCatalog()) {
  const errors = [];
  if (!isPlainObject(input)) {
    return { ok: false, errors: [error("invalid_shape", "$", "claim must be a plain object")] };
  }

  allowKeys(input, ROOT_KEYS, "$", errors);
  requireKeys(
    input,
    [
      "schemaVersion",
      "claimId",
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
      "integrity",
    ],
    "$",
    errors,
  );

  if (input.schemaVersion !== SCHEMA_VERSION) {
    errors.push(error("unknown_schema_version", "$.schemaVersion", "unsupported schemaVersion"));
  }
  expectString(input.claimId, RECEIPT_ID_RE, "$.claimId", errors);
  expectString(input.receiptId, RECEIPT_ID_RE, "$.receiptId", errors);
  if (!KINDS.includes(input.kind)) {
    errors.push(error("unknown_kind", "$.kind", "kind is not in the closed unpaid set"));
  }
  if (input.origin !== SDS_PIN.origin) {
    errors.push(error("pin_mismatch", "$.origin", "origin is not the SDS pin"));
  }
  if (typeof input.resource !== "string" || !input.resource.startsWith(RESOURCE_PREFIX)) {
    errors.push(error("invalid_shape", "$.resource", "resource must be on the SDS origin"));
  } else {
    try {
      const resourceUrl = new URL(input.resource);
      if (resourceUrl.origin !== SDS_PIN.origin) {
        errors.push(error("pin_mismatch", "$.resource", "resource origin is not the SDS pin"));
      }
      if (typeof input.route === "string" && resourceUrl.pathname !== input.route) {
        errors.push(error("invalid_shape", "$.route", "route must be the pathname of resource"));
      }
    } catch {
      errors.push(error("invalid_shape", "$.resource", "resource must be an absolute SDS URL"));
    }
  }
  expectString(input.route, ROUTE_RE, "$.route", errors);
  if (!HTTP_METHODS.includes(input.method)) {
    errors.push(error("invalid_shape", "$.method", "method is not GET or POST"));
  }
  if (typeof input.charged !== "boolean") {
    errors.push(error("invalid_shape", "$.charged", "charged must be a boolean"));
  } else if (input.charged === true) {
    errors.push(error("money_movement_refused", "$.charged", "charged true is refused"));
  }
  if (typeof input.paymentSent !== "boolean") {
    errors.push(error("invalid_shape", "$.paymentSent", "paymentSent must be a boolean"));
  } else if (input.paymentSent === true) {
    errors.push(error("money_movement_refused", "$.paymentSent", "paymentSent true is refused"));
  }
  if (parseRfc3339(input.observedAt) === null) {
    errors.push(error("invalid_shape", "$.observedAt", "observedAt must be RFC3339 milliseconds Z"));
  }
  if (!COMPLETENESS.includes(input.completeness)) {
    errors.push(error("invalid_completeness", "$.completeness", "completeness is not in the closed set"));
  }
  if (!AUTHORITY_CLASSES.includes(input.authorityClass)) {
    errors.push(error("invalid_authority_class", "$.authorityClass", "authorityClass is not in the unpaid set"));
  }
  if (input.statusClass !== "unpaid") {
    errors.push(error("not_unpaid", "$.statusClass", "this pack accepts unpaid receipts only"));
  }

  if (input.httpStatus === null) {
    if (input.kind !== "unpaid_buyer_stop") {
      errors.push(error("invalid_shape", "$.httpStatus", "null httpStatus is only valid for unpaid_buyer_stop"));
    }
  } else if (!Number.isInteger(input.httpStatus)) {
    errors.push(error("invalid_shape", "$.httpStatus", "httpStatus must be an integer or null"));
  } else if (input.kind === "unpaid_buyer_stop") {
    errors.push(error("invalid_shape", "$.httpStatus", "unpaid_buyer_stop has no HTTP response yet"));
  } else if (HTTP_CHALLENGE_KINDS.includes(input.kind) && input.httpStatus !== 402) {
    errors.push(error("invalid_shape", "$.httpStatus", "HTTP challenge kinds must be 402 when unpaid"));
  }

  validateRequest(input.request, input, errors);

  if (!Array.isArray(input.accepts) || input.accepts.length < 1 || input.accepts.length > 4) {
    errors.push(error("invalid_shape", "$.accepts", "accepts must contain 1 to 4 entries"));
  } else {
    for (let i = 0; i < input.accepts.length; i += 1) {
      validateAccept(input.accepts[i], i, errors);
    }
  }

  if (Object.hasOwn(input, "offerReceipt")) {
    validateOfferReceipt(input.offerReceipt, input, errors);
  }
  if (Object.hasOwn(input, "settlement") && input.settlement !== null) {
    errors.push(
      error(
        "paid_as_unpaid",
        "$.settlement",
        "settlement cannot appear on an unpaid claim; HTTP 402 is not delivery",
      ),
    );
    validateSettlement(input.settlement, input, catalog, errors);
  }

  const joinOk = expectUniqueStringArray(input.joinKeys, "$.joinKeys", errors, TOKEN_RE, {
    min: REQUIRED_JOIN_KEYS.length,
    max: 16,
  });
  if (joinOk && Array.isArray(input.joinKeys)) {
    for (const key of REQUIRED_JOIN_KEYS) {
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
    if (!SOURCE_KINDS.includes(input.source.kind)) {
      errors.push(error("unknown_source_kind", "$.source.kind", "unknown source kind"));
    }
    if (Object.hasOwn(input.source, "capturedAt") && parseRfc3339(input.source.capturedAt) === null) {
      errors.push(error("invalid_shape", "$.source.capturedAt", "invalid capturedAt"));
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
    { min: REQUIRED_PROHIBITED_INFERENCES.length, max: 16 },
  );
  if (inferenceOk && Array.isArray(input.prohibitedInferences)) {
    const listed = new Set(input.prohibitedInferences);
    for (const code of input.prohibitedInferences) {
      if (!PROHIBITED_INFERENCES.includes(code)) {
        errors.push(error("unknown_prohibited_inference", "$.prohibitedInferences", code));
      }
    }
    for (const required of REQUIRED_PROHIBITED_INFERENCES) {
      if (!listed.has(required)) {
        errors.push(error("missing_prohibited_inference", "$.prohibitedInferences", `missing ${required}`));
      }
    }
  }

  const spent = new Set([
    SPENT_RECEIPT_ID,
    KNOWN_SETTLEMENT.boundReceiptId,
    ...(catalog.pin.spentReceiptIds ?? []),
  ]);
  if (typeof input.receiptId === "string" && spent.has(input.receiptId)) {
    errors.push(
      error("receipt_replay", "$.receiptId", "receiptId is pinned as already spent and cannot authorize a new unpaid claim"),
    );
  }

  validateIntegrity(input, errors);

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

export function evaluateClaim(input, catalog = loadCatalog()) {
  const result = validateClaim(input, catalog);
  const naive = naiveVerdict(input);
  const honest = result.ok ? "accept" : "reject";
  return {
    ...result,
    naiveVerdict: naive,
    honestVerdict: honest,
    codes: result.errors.map((item) => item.code),
    actualDigest: isPlainObject(input) ? digestClaim(input) : null,
    claimedDigest: isPlainObject(input?.integrity) ? input.integrity.claimedDigest ?? null : null,
  };
}

export function validateFile(filePath, catalog = loadCatalog()) {
  let claim;
  try {
    claim = loadJson(filePath);
  } catch (cause) {
    return {
      ok: false,
      filePath,
      naiveVerdict: "reject",
      honestVerdict: "reject",
      codes: ["invalid_shape"],
      actualDigest: null,
      claimedDigest: null,
      errors: [error("invalid_shape", "$", `cannot parse JSON: ${cause.message}`)],
    };
  }
  const evaluated = evaluateClaim(claim, catalog);
  return {
    ...evaluated,
    filePath,
    claimId: claim.claimId ?? null,
    receiptId: claim.receiptId ?? null,
    statusClass: claim.statusClass ?? null,
  };
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
      codes: result.codes,
    });
  }

  const manifest = loadRejectManifest();
  for (const [name, spec] of Object.entries(manifest)) {
    const filePath = join(REJECT_FIXTURES, name);
    const result = validateFile(filePath, catalog);
    const codes = result.errors.map((item) => item.code);
    const matched = !result.ok && codes.includes(spec.code);
    results.push({
      filePath,
      expect: "reject",
      expectedCode: spec.code,
      ok: matched,
      errors: result.errors,
      codes,
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
      error: { code: "SEED_MISS", message: "catalog designatedSeed.id must be forged-digest" },
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
          ? "seeded forged-digest was accepted"
          : `seeded forged-digest not caught on ${seed.id}`,
      },
    };
  }
  return {
    ok: true,
    caught: true,
    filePath,
    result,
    error: {
      code: "SEED_REJECT",
      message: `seeded forged-digest caught on ${seed.id}`,
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
