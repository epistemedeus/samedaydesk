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

export const PRODUCT = "samedaydesk-verify-sds";
export const PACK = "batch-extract-402-w7";
export const WAVE = "w7";
export const SCHEMA_VERSION = "samedaydesk.batch-extract-402-w7.unpaid.v1";
export const MATRIX_SCHEMA_VERSION = "samedaydesk.batch-extract-402-w7.matrix.v1";
export const SEEDED_FAILURES = Object.freeze(["wrong-amount", "missing-amount", "forged-settlement"]);

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
  "batch",
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
const BATCH_KEYS = Object.freeze(["urlCount", "urlCountMin", "urlCountMax", "quoteKind"]);
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
  if (!isPlainObject(matrix) || !isPlainObject(matrix.pin) || !isPlainObject(matrix.primary)) {
    throw new Error("matrix must contain pin and primary");
  }
  if (matrix.schemaVersion !== MATRIX_SCHEMA_VERSION) {
    throw new Error(`matrix schemaVersion must be ${MATRIX_SCHEMA_VERSION}`);
  }
  return matrix;
}

export function designatedSeedPath(seed, matrix = loadMatrix()) {
  const row = (matrix.designatedSeeds || []).find((item) => item.id === seed);
  if (!row) return null;
  return join(FIXTURE_ROOT, row.file);
}

export function routeKey(method, route) {
  return `${method} ${route}`;
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
    hits.push(error("paid_as_unpaid", "$.charged", "charged true cannot be an unpaid 402 fixture"));
  }
  if (record.paymentSent === true) {
    hits.push(error("paid_as_unpaid", "$.paymentSent", "paymentSent true cannot be an unpaid 402 fixture"));
  }
  if (record.httpStatus === 200) {
    hits.push(error("paid_as_unpaid", "$.httpStatus", "HTTP 200 cannot be an unpaid 402 fixture"));
  }
  return hits;
}

export function collectForgedSettlement(record) {
  const hits = [];
  if (!isPlainObject(record)) return hits;
  if (Object.hasOwn(record, "settlement") && record.settlement !== null) {
    hits.push(
      error(
        "forged_settlement",
        "$.settlement",
        "settlement object on an unpaid extract/batch 402 is a forged settlement, not payment",
      ),
    );
  }
  const headers = isPlainObject(record.request) ? record.request.headers : null;
  if (isPlainObject(headers)) {
    for (const name of ownKeys(headers)) {
      if (isPaymentHeaderName(name)) {
        hits.push(
          error(
            "forged_settlement",
            `$.request.headers.${name}`,
            "payment header on an unpaid extract/batch 402 is a forged settlement",
          ),
        );
      }
    }
  }
  return hits;
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

function validateBatch(batch, primary, errors) {
  if (!isPlainObject(batch)) {
    errors.push(error("invalid_shape", "$.batch", "batch must be an object"));
    return;
  }
  allowKeys(batch, BATCH_KEYS, "$.batch", errors);
  requireKeys(batch, ["urlCount", "urlCountMin", "urlCountMax", "quoteKind"], "$.batch", errors);
  if (!Number.isInteger(batch.urlCount) || batch.urlCount < primary.urlCountMin || batch.urlCount > primary.urlCountMax) {
    errors.push(
      error(
        "batch_bound",
        "$.batch.urlCount",
        `urlCount must be an integer ${primary.urlCountMin}-${primary.urlCountMax}`,
      ),
    );
  }
  if (batch.urlCountMin !== primary.urlCountMin) {
    errors.push(error("pin_mismatch", "$.batch.urlCountMin", "urlCountMin is not the extract/batch pin"));
  }
  if (batch.urlCountMax !== primary.urlCountMax) {
    errors.push(error("pin_mismatch", "$.batch.urlCountMax", "urlCountMax is not the extract/batch pin"));
  }
  if (batch.quoteKind !== primary.quoteKind) {
    errors.push(error("pin_mismatch", "$.batch.quoteKind", "quoteKind must be flat_attempt"));
  }
}

function amountPresent(input) {
  return Object.hasOwn(input, "amountAtomic") && input.amountAtomic !== null && input.amountAtomic !== "";
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
  if (input.httpStatus !== 402 && input.statusClass === "unpaid") {
    errors.push(error("invalid_shape", "$.httpStatus", "unpaid challenge kinds must be 402"));
  }

  validateRequest(input.request, input, errors);

  if (Object.hasOwn(input, "editLivePrice") && input.editLivePrice === true) {
    errors.push(error("live_price_edit", "$.editLivePrice", "live catalog amounts are not editable in this pack"));
  }
  if (Object.hasOwn(input, "proposedAmountAtomic")) {
    errors.push(error("live_price_edit", "$.proposedAmountAtomic", "proposed amount edits are refused"));
  }

  const primary = matrix.primary;
  const contrast = matrix.contrast;
  const isPrimary = input.method === primary.method && input.route === primary.route;
  const isContrast = input.method === contrast.method && input.route === contrast.route;

  if (!isPrimary) {
    if (isContrast) {
      errors.push(
        error(
          "not_batch_route",
          "$.route",
          "GET /extract is the contrast pin, not POST /extract/batch",
        ),
      );
    } else {
      errors.push(error("unknown_route", "$.route", "route is not native POST /extract/batch"));
    }
  } else {
    if (input.resource !== primary.resource) {
      errors.push(error("resource_mismatch", "$.resource", "resource must be the extract/batch URL"));
    }
    if (isPlainObject(input.request) && input.request.url !== primary.resource) {
      errors.push(error("resource_mismatch", "$.request.url", "request url must be the extract/batch URL"));
    }
  }

  if (Object.hasOwn(input, "batch")) {
    validateBatch(input.batch, primary, errors);
  } else if (isPrimary) {
    errors.push(error("invalid_shape", "$.batch", "missing batch bound (urlCount 1-5, flat_attempt)"));
  }

  if (!amountPresent(input)) {
    errors.push(
      error(
        "missing_amount",
        "$.amountAtomic",
        "POST /extract/batch unpaid 402 must carry amountAtomic 10000",
      ),
    );
  } else if (typeof input.amountAtomic !== "string") {
    errors.push(error("invalid_shape", "$.amountAtomic", "amountAtomic must be a string"));
  } else if (input.amountAtomic.includes(".") || /e/i.test(input.amountAtomic)) {
    errors.push(
      error(
        "wrong_units",
        "$.amountAtomic",
        "amountAtomic must be six-decimal USDC atomic digits, not a decimal display",
      ),
    );
  } else if (!ATOMIC_RE.test(input.amountAtomic)) {
    errors.push(error("invalid_shape", "$.amountAtomic", "amountAtomic must be a positive integer string"));
  } else if (isPrimary && input.amountAtomic !== primary.amountAtomic) {
    const rewrite = input.amountAtomic === contrast.amountAtomic;
    errors.push(
      error(
        "wrong_amount",
        "$.amountAtomic",
        rewrite
          ? `amount ${input.amountAtomic} is GET /extract (${contrast.amountAtomic}), not POST /extract/batch ${primary.amountAtomic}`
          : `amount ${input.amountAtomic} does not match extract/batch pin ${primary.amountAtomic}`,
      ),
    );
    if (rewrite) {
      errors.push(
        error(
          "get_extract_rewrite",
          "$.amountAtomic",
          "native POST /extract/batch is not a GET /extract rewrite",
        ),
      );
    }
  }

  if (amountPresent(input) && ATOMIC_RE.test(String(input.amountAtomic))) {
    if (!Object.hasOwn(input, "amountDisplayUsd") || input.amountDisplayUsd === null || input.amountDisplayUsd === "") {
      errors.push(error("missing_amount", "$.amountDisplayUsd", "amountDisplayUsd is missing"));
    } else if (typeof input.amountDisplayUsd !== "string" || !DISPLAY_RE.test(input.amountDisplayUsd)) {
      errors.push(error("invalid_shape", "$.amountDisplayUsd", "amountDisplayUsd must be a decimal string"));
    } else if (input.amountDisplayUsd === input.amountAtomic) {
      errors.push(
        error(
          "wrong_units",
          "$.amountDisplayUsd",
          "display USD equals atomic units; 10000 atomic is 0.01 USDC, not 10000 dollars",
        ),
      );
    } else if (input.unitsClaim === "usd" || input.unitsClaim === "dollars") {
      errors.push(error("wrong_units", "$.unitsClaim", "atomic amount claimed as dollars"));
    } else if (isPrimary && input.amountAtomic === primary.amountAtomic) {
      const expectedDisplay = atomicToDisplay(input.amountAtomic, matrix.pin.decimals);
      if (expectedDisplay !== input.amountDisplayUsd) {
        errors.push(
          error(
            "display_mismatch",
            "$.amountDisplayUsd",
            `display ${input.amountDisplayUsd} does not equal atomic ${input.amountAtomic} / 1e${matrix.pin.decimals}`,
          ),
        );
      } else if (input.amountDisplayUsd !== primary.amountDisplayUsd) {
        errors.push(
          error(
            "display_mismatch",
            "$.amountDisplayUsd",
            `display ${input.amountDisplayUsd} does not match extract/batch pin ${primary.amountDisplayUsd}`,
          ),
        );
      }
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
    { min: 5, max: 16 },
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
    errors.push(error("not_unpaid", "$.statusClass", "this pack accepts unpaid 402 fixtures only"));
  }

  errors.push(...collectPaidEvidence(input));
  errors.push(...collectForgedSettlement(input));

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
  return {
    ...result,
    naiveVerdict: naiveVerdict(input),
    honestVerdict: result.ok ? "accept" : "reject",
    paidEvidence: collectPaidEvidence(input),
    forgedSettlement: collectForgedSettlement(input),
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
      forgedSettlement: [],
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
    method: record.method ?? null,
    amountAtomic: Object.hasOwn(record, "amountAtomic") ? record.amountAtomic : null,
    urlCount: record.batch?.urlCount ?? null,
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

function seedSpec(id, matrix) {
  return (matrix.designatedSeeds || []).find((item) => item.id === id) ?? null;
}

export function evaluateSeededFailure(id, matrix = loadMatrix()) {
  if (!SEEDED_FAILURES.includes(id)) {
    return {
      ok: false,
      caught: false,
      error: { code: "USAGE", message: `--seeded-failure must be ${SEEDED_FAILURES.join("|")} or all` },
    };
  }
  const seed = seedSpec(id, matrix);
  if (!seed) {
    return {
      ok: false,
      caught: false,
      error: { code: "SEED_MISS", message: `matrix designatedSeeds missing ${id}` },
    };
  }
  const filePath = designatedSeedPath(id, matrix);
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
          ? `seeded ${id} was accepted as a catalog unpaid 402 amount`
          : `seeded ${id} not caught`,
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
      message: `seeded ${id} caught`,
    },
  };
}

export function evaluateAllSeededFailures(matrix = loadMatrix()) {
  const seeds = SEEDED_FAILURES.map((id) => ({ id, ...evaluateSeededFailure(id, matrix) }));
  const allCaught = seeds.every((item) => item.caught);
  return {
    ok: false,
    caught: allCaught,
    seeds,
    error: allCaught
      ? {
          code: "SEED_REJECT",
          message: "seeded wrong-amount, missing-amount, and forged-settlement caught",
        }
      : {
          code: "SEED_MISS",
          message: `seeded failures not all caught: ${seeds
            .filter((item) => !item.caught)
            .map((item) => item.id)
            .join(",")}`,
        },
  };
}

function quoteAmount(document, path) {
  const quote = document?.quote;
  if (!isPlainObject(quote)) {
    return { ok: false, path, code: "quote_missing" };
  }
  return {
    ok: quote.amountAtomic === "10000" && quote.displayUsdc === "0.01",
    path,
    amountAtomic: quote.amountAtomic ?? null,
    displayUsdc: quote.displayUsdc ?? null,
  };
}

export function crossCheckInTreePins(matrix = loadMatrix()) {
  const findings = [];
  const pins = matrix.inTreePins || {};

  const catalogPath = join(ROOT, pins.x402Catalog);
  if (!existsSync(catalogPath)) {
    return {
      ok: false,
      error: { code: "CATALOG_MISS", message: `in-tree catalog missing: ${catalogPath}` },
    };
  }
  const catalog = loadJson(catalogPath);
  const items = Array.isArray(catalog.items) ? catalog.items : [];
  const extract = items.find(
    (item) => item?.resource?.routeTemplate === "/extract" && item?.request?.method === "GET",
  );
  const batch = items.find((item) => item?.resource?.routeTemplate === "/extract/batch");
  const extractAmount = extract?.accepts?.[0]?.amount ?? null;
  if (extractAmount !== matrix.contrast.amountAtomic) {
    findings.push({
      code: "contrast_drift",
      key: "GET /extract",
      catalogAmount: extractAmount,
      matrixAmount: matrix.contrast.amountAtomic,
    });
  }
  if (batch) {
    const batchAmount = batch?.accepts?.[0]?.amount ?? null;
    const batchMethod = batch?.request?.method ?? null;
    if (batchMethod !== "POST" || batchAmount !== matrix.primary.amountAtomic) {
      findings.push({
        code: "catalog_rewrite",
        key: `${batchMethod} /extract/batch`,
        catalogAmount: batchAmount,
        matrixAmount: matrix.primary.amountAtomic,
      });
    }
  }

  for (const key of ["extractBatchQuote", "acceptedExtractBatch"]) {
    const rel = pins[key];
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) {
      findings.push({ code: "pin_file_missing", path: rel });
      continue;
    }
    const checked = quoteAmount(loadJson(abs), rel);
    if (!checked.ok) {
      findings.push({
        code: "quote_amount_drift",
        path: rel,
        amountAtomic: checked.amountAtomic,
        displayUsdc: checked.displayUsdc,
      });
    }
  }

  const agentsLlms = join(ROOT, pins.agentsLlmsTxt);
  if (!existsSync(agentsLlms)) {
    findings.push({ code: "pin_file_missing", path: pins.agentsLlmsTxt });
  } else {
    const text = readFileSync(agentsLlms, "utf8");
    if (!text.includes("/extract/batch")) {
      findings.push({ code: "llms_missing_route", path: pins.agentsLlmsTxt });
    }
    if (!text.includes("10000 atomic") || !text.includes("0.01 USDC")) {
      findings.push({ code: "llms_missing_amount", path: pins.agentsLlmsTxt });
    }
  }

  const apexLlms = join(ROOT, pins.apexLlmsTxt);
  if (!existsSync(apexLlms)) {
    findings.push({ code: "pin_file_missing", path: pins.apexLlmsTxt });
  } else {
    const text = readFileSync(apexLlms, "utf8");
    if (!text.includes("/extract/batch") || !text.includes("0.01 USDC")) {
      findings.push({ code: "llms_missing_amount", path: pins.apexLlmsTxt });
    }
  }

  const costPath = join(ROOT, pins.costNotes);
  if (!existsSync(costPath)) {
    findings.push({ code: "pin_file_missing", path: pins.costNotes });
  } else {
    const text = readFileSync(costPath, "utf8");
    if (!text.includes("POST /extract/batch") || !text.includes("0.01 USDC")) {
      findings.push({ code: "cost_note_drift", path: pins.costNotes });
    }
  }

  return {
    ok: findings.length === 0,
    catalogPath,
    lastUpdated: catalog.lastUpdated ?? null,
    catalogItems: items.length,
    catalogHasExtractBatch: Boolean(batch),
    catalogExtractAmount: extractAmount,
    primaryAmountAtomic: matrix.primary.amountAtomic,
    contrastAmountAtomic: matrix.contrast.amountAtomic,
    findings,
  };
}

export function matrixSummary(matrix = loadMatrix()) {
  return {
    ok: true,
    pack: matrix.pack,
    wave: matrix.wave,
    pin: matrix.pin,
    primary: matrix.primary,
    contrast: matrix.contrast,
    uniqueAmounts: matrix.uniqueAmounts,
    routes: matrix.routes,
    designatedSeeds: matrix.designatedSeeds,
    boundary: matrix.boundary,
  };
}

export function coverageReport(matrix = loadMatrix()) {
  const files = listJsonFiles(VALID_FIXTURES).map((filePath) => ({
    filePath,
    record: loadJson(filePath),
  }));
  const urlCounts = files.map((file) => file.record.batch?.urlCount).filter((n) => Number.isInteger(n));
  const amounts = new Set(files.map((file) => file.record.amountAtomic));
  const routes = new Set(files.map((file) => routeKey(file.record.method, file.record.route)));
  const missingPrimary = !routes.has(routeKey(matrix.primary.method, matrix.primary.route));
  const nonFlat = [...amounts].filter((amount) => amount !== matrix.primary.amountAtomic);
  const expectedCounts = [1, 5];
  const missingCounts = expectedCounts.filter((n) => !urlCounts.includes(n));
  return {
    ok: !missingPrimary && nonFlat.length === 0 && missingCounts.length === 0 && files.length >= 2,
    validFixtures: files.length,
    primaryRoute: routeKey(matrix.primary.method, matrix.primary.route),
    amounts: [...amounts],
    urlCounts: [...new Set(urlCounts)].sort((a, b) => a - b),
    missingPrimary,
    nonFlatAmounts: nonFlat,
    missingUrlCounts: missingCounts,
    flatQuote: nonFlat.length === 0 && urlCounts.includes(1) && urlCounts.includes(5),
  };
}

export function refusedFlag(argv) {
  for (const arg of argv) {
    const name = String(arg).replace(/^--/, "");
    if (REFUSED_FLAGS.includes(name)) return arg;
  }
  return null;
}
