import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  KNOWN_STALE_LISTINGS,
  PIN,
  PROHIBITED_INFERENCES,
  RECORD_SCHEMA_VERSION,
  SEEDED,
  SEEDED_FAILURE,
} from "./pin.mjs";
import {
  ATOMIC_RE,
  DISPLAY_RE,
  PACK_ROOT,
  atomicToDisplay,
  indexRows,
  loadJson,
  pathOf,
  routeKey,
} from "./catalog.mjs";
import { expectedIndex } from "./matrix.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURE_ROOT = join(here, "../fixtures");
export const SEEDED_DIR = join(FIXTURE_ROOT, "seeded");
export const OK_DIR = join(FIXTURE_ROOT, "ok");

const FIXTURE_ID_RE = /^[a-z][a-z0-9_-]{2,95}$/;
const ROUTE_RE = /^\/[^?#]*$/;
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const RFC3339_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;
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
  "listedSurface",
  "listedAmountAtomic",
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
    hits.push(error("paid_as_unpaid", "$.httpStatus", "HTTP 200 cannot be an unpaid 402 amount fixture"));
  }
  if (Object.hasOwn(record, "settlement") && record.settlement !== null) {
    hits.push(error("paid_as_unpaid", "$.settlement", "settlement object cannot be labeled unpaid"));
  }
  const headers = isPlainObject(record.request) ? record.request.headers : null;
  if (isPlainObject(headers)) {
    for (const name of ownKeys(headers)) {
      if (PAYMENT_HEADER_RE.test(name)) {
        hits.push(error("paid_as_unpaid", `$.request.headers.${name}`, "payment header cannot be labeled unpaid"));
      }
    }
  }
  return hits;
}

function findKnownStale(route, method, amountAtomic) {
  return KNOWN_STALE_LISTINGS.find(
    (item) =>
      item.host === PIN.originHost &&
      item.route === route &&
      item.method === method &&
      item.listedAmountAtomic === amountAtomic &&
      item.catalogAmountAtomic !== amountAtomic,
  );
}

export function validateRecord(input, catalogRows) {
  const errors = [];
  if (!isPlainObject(input)) {
    return {
      ok: false,
      errors: [error("invalid_shape", "$", "record must be an object")],
      naiveVerdict: "reject",
      honestVerdict: "reject",
    };
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

  if (input.schemaVersion !== RECORD_SCHEMA_VERSION) {
    errors.push(error("invalid_shape", "$.schemaVersion", `schemaVersion must be ${RECORD_SCHEMA_VERSION}`));
  }
  if (typeof input.fixtureId !== "string" || !FIXTURE_ID_RE.test(input.fixtureId)) {
    errors.push(error("invalid_shape", "$.fixtureId", "invalid fixtureId"));
  }
  if (input.kind !== "unpaid_payment_required") {
    errors.push(error("invalid_shape", "$.kind", "kind must be unpaid_payment_required"));
  }
  if (input.origin !== PIN.origin) {
    errors.push(error("pin_mismatch", "$.origin", "origin is not the SDS pin"));
  }
  if (typeof input.route !== "string" || !ROUTE_RE.test(input.route)) {
    errors.push(error("invalid_shape", "$.route", "invalid route"));
  }
  if (!HTTP_METHODS.has(input.method)) {
    errors.push(error("invalid_shape", "$.method", "method must be GET or POST"));
  }
  if (typeof input.resource !== "string" || !input.resource.startsWith(`${PIN.origin}/`)) {
    errors.push(error("invalid_shape", "$.resource", "resource must be an SDS origin URL"));
  }
  if (typeof input.observedAt !== "string" || !RFC3339_RE.test(input.observedAt) || new Date(input.observedAt).toISOString() !== input.observedAt) {
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
  if (input.statusClass === "unpaid" && input.httpStatus !== 402) {
    errors.push(error("invalid_shape", "$.httpStatus", "unpaid challenge kinds must be HTTP 402"));
  }

  if (isPlainObject(input.request)) {
    if (input.request.method !== input.method) {
      errors.push(error("invalid_shape", "$.request.method", "request method must equal method"));
    }
    if (typeof input.request.url !== "string" || !input.request.url.startsWith(`${PIN.origin}/`)) {
      errors.push(error("invalid_shape", "$.request.url", "request url must be an SDS origin URL"));
    }
  } else if (Object.hasOwn(input, "request")) {
    errors.push(error("invalid_shape", "$.request", "request must be an object"));
  }

  errors.push(...collectPaidEvidence(input));

  if (input.editLivePrice === true) {
    errors.push(error("live_price_edit", "$.editLivePrice", "live catalog amounts are not editable in this pack"));
  }
  if (Object.hasOwn(input, "proposedAmountAtomic")) {
    errors.push(error("live_price_edit", "$.proposedAmountAtomic", "proposed amount edits are refused"));
  }

  const atomicOk = typeof input.amountAtomic === "string";
  if (!atomicOk) {
    errors.push(error("invalid_shape", "$.amountAtomic", "amountAtomic must be a string"));
  } else if (input.amountAtomic.includes(".") || /e/i.test(input.amountAtomic)) {
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
    const expectedDisplay = atomicToDisplay(input.amountAtomic);
    if (expectedDisplay !== input.amountDisplayUsd) {
      errors.push(
        error(
          "display_mismatch",
          "$.amountDisplayUsd",
          `display ${input.amountDisplayUsd} != atomic/1e6 ${expectedDisplay}`,
        ),
      );
    }
  }

  if (typeof input.network === "string" && input.network !== PIN.network) {
    errors.push(error("pin_mismatch", "$.network", "network is not the SDS pin"));
  }
  if (typeof input.asset === "string" && !ADDR_RE.test(input.asset)) {
    errors.push(error("invalid_shape", "$.asset", "asset must be a 0x address"));
  } else if (typeof input.asset === "string" && input.asset.toLowerCase() !== PIN.asset.toLowerCase()) {
    errors.push(error("pin_mismatch", "$.asset", "asset is not the SDS pin"));
  }
  if (typeof input.payTo === "string" && !ADDR_RE.test(input.payTo)) {
    errors.push(error("invalid_shape", "$.payTo", "payTo must be a 0x address"));
  } else if (typeof input.payTo === "string" && input.payTo.toLowerCase() !== PIN.payTo.toLowerCase()) {
    errors.push(error("pin_mismatch", "$.payTo", "payTo is not the SDS pin"));
  }

  if (Array.isArray(input.prohibitedInferences)) {
    for (const token of PROHIBITED_INFERENCES) {
      if (!input.prohibitedInferences.includes(token)) {
        errors.push(error("invalid_shape", "$.prohibitedInferences", `missing ${token}`));
      }
    }
  }

  const pinRow = expectedIndex().get(routeKey(input.method, input.route));
  const catalog = catalogRows ? indexRows(catalogRows).get(routeKey(input.method, input.route)) : pinRow;
  const authority = catalog || pinRow;

  if (!authority) {
    errors.push(error("unknown_route", "$.route", `${input.method} ${input.route} is not in the SDS 402 matrix`));
  } else if (atomicOk && ATOMIC_RE.test(input.amountAtomic) && input.amountAtomic !== authority.amountAtomic) {
    const stale = findKnownStale(input.route, input.method, input.amountAtomic);
    if (stale) {
      errors.push(
        error(
          "stale_listed_amount",
          "$.amountAtomic",
          `${stale.note} Catalog pin is ${authority.amountAtomic}.`,
        ),
      );
    } else {
      errors.push(
        error(
          "amount_mismatch",
          "$.amountAtomic",
          `claimed ${input.amountAtomic} != catalog ${authority.amountAtomic} for ${input.method} ${input.route}`,
        ),
      );
    }
  }

  if (typeof input.resource === "string" && input.route && pathOf(input.resource) !== input.route) {
    errors.push(error("invalid_shape", "$.resource", "resource path must equal route"));
  }

  const codes = [...new Set(errors.map((item) => item.code))];
  const honestVerdict = errors.length === 0 ? "accept" : "reject";
  return {
    ok: errors.length === 0,
    fixtureId: input.fixtureId ?? null,
    statusClass: input.statusClass ?? null,
    route: input.route ?? null,
    method: input.method ?? null,
    amountAtomic: input.amountAtomic ?? null,
    amountDisplayUsd: input.amountDisplayUsd ?? null,
    httpStatus: input.httpStatus ?? null,
    naiveVerdict: naiveVerdict(input),
    honestVerdict,
    codes,
    errors,
  };
}

export function unpaidRecordFromRow(row, { fixtureId } = {}) {
  const id =
    fixtureId ||
    `unpaid-402-${row.route.replace(/^\//, "").replaceAll("/", "-")}-${row.amountAtomic}`.toLowerCase();
  return {
    schemaVersion: RECORD_SCHEMA_VERSION,
    fixtureId: id,
    kind: "unpaid_payment_required",
    statusClass: "unpaid",
    origin: PIN.origin,
    resource: row.resource,
    route: row.route,
    method: row.method,
    httpStatus: 402,
    charged: false,
    paymentSent: false,
    observedAt: "2026-09-03T17:03:44.000Z",
    amountAtomic: row.amountAtomic,
    amountDisplayUsd: row.amountDisplayUsd,
    network: row.network,
    asset: row.asset,
    payTo: row.payTo,
    maxTimeoutSeconds: row.maxTimeoutSeconds,
    extra: row.extra,
    request: {
      method: row.method,
      url: row.resource,
    },
    source: {
      kind: "in-tree-catalog",
      capturedAt: "2026-09-03T17:03:44.000Z",
      path: "fixtures/presence/catalog/x402.json",
      note: "Origin /.well-known/x402.json v2",
    },
    unknownWhenAbsent: ["settlement", "payment-signature"],
    prohibitedInferences: [...PROHIBITED_INFERENCES],
  };
}

export function listJsonFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json") && name !== "manifest.json")
    .sort()
    .map((name) => join(dir, name));
}

export function validateFile(filePath, catalogRows) {
  const record = loadJson(filePath);
  const result = validateRecord(record, catalogRows);
  return { ...result, filePath };
}

export function runSuite(catalogRows) {
  const generated = catalogRows.map((row) => {
    const record = unpaidRecordFromRow(row);
    const result = validateRecord(record, catalogRows);
    return {
      filePath: `generated:${result.fixtureId}`,
      expect: "accept",
      expectedCode: null,
      ...result,
    };
  });

  const okFiles = listJsonFiles(OK_DIR).map((filePath) => {
    const result = validateFile(filePath, catalogRows);
    return { expect: "accept", expectedCode: null, ...result };
  });

  const seededFiles = listJsonFiles(SEEDED_DIR).map((filePath) => {
    const result = validateFile(filePath, catalogRows);
    return { expect: "reject", expectedCode: null, ...result };
  });

  const results = [...generated, ...okFiles, ...seededFiles];
  for (const item of results) {
    if (item.expect === "accept") item.ok = item.honestVerdict === "accept";
    else item.ok = item.honestVerdict === "reject";
  }
  const failed = results.filter((item) => !item.ok);
  return {
    ok: failed.length === 0,
    passed: results.length - failed.length,
    failed: failed.length,
    total: results.length,
    generated: generated.length,
    results,
  };
}

export function evaluateSeededFailure(id = SEEDED_FAILURE, catalogRows) {
  const spec = SEEDED[id];
  if (!spec) {
    return {
      ok: false,
      caught: false,
      error: { code: "USAGE", message: `unknown seeded failure ${id}` },
    };
  }
  const filePath = join(FIXTURE_ROOT, spec.file);
  const result = validateFile(filePath, catalogRows);
  const caught = result.honestVerdict === "reject" && result.codes.includes(spec.code);
  const naiveWouldAccept = result.naiveVerdict === "accept";
  return {
    ok: false,
    caught,
    naiveWouldAccept,
    remappedFromNaiveAccept: caught && naiveWouldAccept,
    filePath,
    spec,
    result,
    error: caught
      ? { code: "SEED_REJECT", message: `${id} rejected (${spec.code})` }
      : { code: "SEED_NOT_CAUGHT", message: `${id} was not rejected as ${spec.code}` },
  };
}

export { PACK_ROOT };
