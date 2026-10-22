import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const VALID_FIXTURES = join(here, "fixtures/valid");
const INVALID_FIXTURES = join(here, "fixtures/invalid");
const INVALID_MANIFEST = join(INVALID_FIXTURES, "manifest.json");

export const SCHEMA = "samedaydesk.commerce-receipts.join.v1";
export const EXACT_KEYS = Object.freeze(["receipt_id", "transaction_hash", "operation_id"]);
export const PARTIES = Object.freeze(["buyer", "seller", "facilitator"]);
export const SOURCE_BY_PARTY = Object.freeze({
  buyer: "buyer_attested_receipt",
  seller: "seller_ledger_line",
  facilitator: "x402_facilitator_settlement",
});
export const AUTHORITY_CLASSES = Object.freeze([
  "seller_observed",
  "provider_returned",
  "independently_reconciled",
  "provider_authoritative",
]);
export const STATUSES = Object.freeze([
  "observed",
  "attested",
  "ledger_line",
  "facilitator_returned",
]);
export const DECISIONS = Object.freeze({
  JOINED: "joined",
  INVALID_INPUT: "invalid-input",
});
export const SEEDED_FAILURES = Object.freeze({
  "money-movement": {
    file: "money-movement.json",
    code: "money_movement_refused",
    message: "seeded money-movement caught: checkout intent is refused",
  },
  "join-without-exact-key": {
    file: "join-without-exact-key.json",
    code: "cross_source_join_without_exact_key",
    message: "seeded join-without-exact-key caught: cross-party join requires an exact key",
  },
});

const ROOT_KEYS = Object.freeze(["schemaVersion", "mode", "receipts"]);
const RECEIPT_KEYS = Object.freeze([
  "party",
  "sourceKind",
  "authorityClass",
  "receiptId",
  "joinKeys",
  "observedAt",
  "amountUsdc",
  "status",
  "joins",
]);
const JOIN_DECL_KEYS = Object.freeze(["otherParty", "otherSourceKind", "exactKey", "exactValue"]);
const JOIN_KEY_FIELDS = Object.freeze(["receipt_id", "transaction_hash", "operation_id"]);
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const TOKEN_RE = /^[a-z][a-z0-9_-]{2,95}$/;
const RFC3339_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;
const DECIMAL_RE = /^(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,8})?$/;
const HASH_RE = /^0x[a-fA-F0-9]{64}$/;
const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
const MAX_RECEIPTS = 32;
const MAX_JOINS = 16;

const MONEY_MOVEMENT_KEYS = new Set([
  "pay",
  "checkout",
  "settle",
  "transfer",
  "refund",
  "capture",
  "payout",
  "charge",
  "authorize",
  "purchase",
  "autopay",
  "replaypayment",
  "approvepayment",
  "sendpayment",
  "movemoney",
  "moneymovement",
  "paymentintent",
  "paymentsession",
  "confirmpayment",
  "createcharge",
  "walletpay",
  "xpayment",
  "paymentsignature",
  "stripe",
  "sendtransaction",
  "ethsendtransaction",
  "ethsendrawtransaction",
  "walletscan",
  "profileaddress",
  "payment",
  "intent",
  "action",
  "command",
]);
const PAY_MODES = new Set([
  "pay",
  "paid",
  "checkout",
  "settle",
  "settlement",
  "transfer",
  "refund",
  "capture",
  "payout",
  "charge",
  "purchase",
  "authorize",
  "mutate",
  "write",
  "live_pay",
]);
const SUM_KEYS = new Set(["totalusdc", "sumusdc", "aggregates", "summedusdc", "revenueusdc"]);
const OFFLINE_KEYS = new Set(["url", "endpoint", "href", "fetch", "request", "method", "headers", "host"]);
const MUTATING_HTTP = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const BOUNDARIES = Object.freeze({
  readOnly: true,
  payment: false,
  checkout: false,
  publish: false,
  registry: false,
  fetch: false,
  moneyMovement: false,
});
const CLAIMS = Object.freeze({
  independentlySettled: false,
  demandOrRevenue: false,
  sumAcrossAuthorityClasses: false,
  customerCountFromJoin: false,
  facilitatorAttributionIndependentlyProved: false,
});

export function validFixtureDir() {
  return VALID_FIXTURES;
}

export function invalidFixtureDir() {
  return INVALID_FIXTURES;
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

function normalizeKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function closed(decision, reasons, extra = {}) {
  const errors = Array.isArray(extra.errors) ? extra.errors : [];
  const ok = decision === DECISIONS.JOINED && errors.length === 0;
  return {
    ok,
    schemaVersion: SCHEMA,
    decision,
    reasons: reasons.slice(0, 32),
    errors,
    quotedPath: extra.quotedPath ?? null,
    mode: "read_only",
    moneyMovement: false,
    boundaries: { ...BOUNDARIES },
    claims: { ...CLAIMS },
    joins: extra.joins ?? [],
    unjoined: extra.unjoined ?? [],
    parties: extra.parties ?? [],
  };
}

function scanTree(value, path, errors) {
  if (errors.length > 0) return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      scanTree(value[i], `${path}[${i}]`, errors);
      if (errors.length > 0) return;
    }
    return;
  }
  if (!isPlainObject(value)) {
    if (typeof value === "string") {
      if (MUTATING_HTTP.has(value) && /\.method$/i.test(path)) {
        errors.push(error("money_movement_refused", path, "mutating HTTP is money movement"));
      }
    }
    return;
  }
  for (const key of ownKeys(value)) {
    const childPath = path === "$" ? `$.${key}` : `${path}.${key}`;
    if (FORBIDDEN_KEYS.has(key)) {
      errors.push(error("additional_property", childPath, `property ${key} is not allowed`));
      return;
    }
    const normalized = normalizeKey(key);
    if (MONEY_MOVEMENT_KEYS.has(normalized)) {
      errors.push(
        error("money_movement_refused", childPath, "join probe refuses payment, checkout, and settlement"),
      );
      return;
    }
    if (SUM_KEYS.has(normalized)) {
      errors.push(
        error("sum_across_authority_classes", childPath, "join probe never sums amounts across parties"),
      );
      return;
    }
    if (OFFLINE_KEYS.has(normalized)) {
      const child = value[key];
      if (typeof child === "string" && MUTATING_HTTP.has(child.toUpperCase())) {
        errors.push(error("money_movement_refused", childPath, "mutating HTTP is money movement"));
        return;
      }
      errors.push(error("probe_is_offline", childPath, "join probe reads local fixtures only"));
      return;
    }
    scanTree(value[key], childPath, errors);
    if (errors.length > 0) return;
  }
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

function expectString(value, re, path, errors) {
  if (typeof value !== "string" || !re.test(value)) {
    errors.push(error("invalid_shape", path, "invalid string"));
    return false;
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

export function normalizeTxHash(value) {
  if (typeof value !== "string" || !HASH_RE.test(value)) return null;
  return value.toLowerCase();
}

function firstErrorDecision(errors, extra = {}) {
  const reasons = [...new Set(errors.map((item) => item.code))];
  return closed(DECISIONS.INVALID_INPUT, reasons, { ...extra, errors });
}

function readJoinKeys(raw, path, errors) {
  if (!isPlainObject(raw)) {
    errors.push(error("invalid_shape", path, "joinKeys must be an object"));
    return {};
  }
  allowKeys(raw, JOIN_KEY_FIELDS, path, errors);
  const keys = {};
  for (const name of JOIN_KEY_FIELDS) {
    if (!Object.hasOwn(raw, name)) continue;
    const value = raw[name];
    if (name === "transaction_hash") {
      const hash = normalizeTxHash(value);
      if (!hash) {
        errors.push(error("invalid_shape", `${path}.${name}`, "invalid transaction_hash"));
        continue;
      }
      keys[name] = hash;
    } else if (expectString(value, TOKEN_RE, `${path}.${name}`, errors)) {
      keys[name] = value;
    }
  }
  return keys;
}

function readJoinDecls(raw, joinKeys, path, errors) {
  if (!Array.isArray(raw) || Object.keys(raw).length !== raw.length) {
    errors.push(error("invalid_shape", path, "joins must be an array"));
    return;
  }
  if (raw.length > MAX_JOINS) {
    errors.push(error("invalid_shape", path, "too many joins"));
    return;
  }
  for (let i = 0; i < raw.length; i += 1) {
    const decl = raw[i];
    const declPath = `${path}[${i}]`;
    if (!isPlainObject(decl)) {
      errors.push(error("invalid_shape", declPath, "join must be an object"));
      continue;
    }
    allowKeys(decl, JOIN_DECL_KEYS, declPath, errors);
    const otherParty = decl.otherParty;
    const otherSourceKind = decl.otherSourceKind;
    const crossParty =
      (typeof otherParty === "string" && otherParty.length > 0) ||
      (typeof otherSourceKind === "string" && otherSourceKind.length > 0);
    const hasKey = typeof decl.exactKey === "string" && EXACT_KEYS.includes(decl.exactKey);
    const hasValue = typeof decl.exactValue === "string" && decl.exactValue.length > 0;
    if (crossParty && (!hasKey || !hasValue)) {
      errors.push(
        error(
          "cross_source_join_without_exact_key",
          declPath,
          "cross-party join requires an exact key and value",
        ),
      );
      continue;
    }
    if (hasKey && !Object.hasOwn(joinKeys, decl.exactKey)) {
      errors.push(
        error(
          "cross_source_join_without_exact_key",
          `${declPath}.exactKey`,
          "exactKey is not declared on this receipt",
        ),
      );
    }
    if (typeof otherParty === "string" && !PARTIES.includes(otherParty)) {
      errors.push(error("invalid_shape", `${declPath}.otherParty`, "unknown party"));
    }
    if (typeof otherSourceKind === "string" && !Object.values(SOURCE_BY_PARTY).includes(otherSourceKind)) {
      errors.push(error("invalid_shape", `${declPath}.otherSourceKind`, "unknown sourceKind"));
    }
  }
}

function readReceipt(raw, index, errors) {
  const path = `$.receipts[${index}]`;
  if (!isPlainObject(raw)) {
    errors.push(error("invalid_shape", path, "receipt must be an object"));
    return null;
  }
  allowKeys(raw, RECEIPT_KEYS, path, errors);
  requireKeys(
    raw,
    ["party", "sourceKind", "authorityClass", "receiptId", "joinKeys", "observedAt", "status"],
    path,
    errors,
  );
  if (!PARTIES.includes(raw.party)) {
    errors.push(error("invalid_shape", `${path}.party`, "party is not in the closed set"));
  }
  if (!Object.values(SOURCE_BY_PARTY).includes(raw.sourceKind)) {
    errors.push(error("invalid_shape", `${path}.sourceKind`, "sourceKind is not in the closed set"));
  } else if (PARTIES.includes(raw.party) && SOURCE_BY_PARTY[raw.party] !== raw.sourceKind) {
    errors.push(
      error("source_kind_party_mismatch", `${path}.sourceKind`, "sourceKind is not the kind for this party"),
    );
  }
  if (!AUTHORITY_CLASSES.includes(raw.authorityClass)) {
    errors.push(error("invalid_authority_class", `${path}.authorityClass`, "authorityClass is not in the closed set"));
  }
  expectString(raw.receiptId, TOKEN_RE, `${path}.receiptId`, errors);
  if (typeof raw.receiptId === "string" && ADDR_RE.test(raw.receiptId)) {
    errors.push(error("payer_address_refused", `${path}.receiptId`, "payer-shaped identifiers are refused"));
  }
  const joinKeys = readJoinKeys(raw.joinKeys, `${path}.joinKeys`, errors);
  const observed = parseRfc3339(raw.observedAt);
  if (observed === null) {
    errors.push(error("invalid_shape", `${path}.observedAt`, "invalid observedAt"));
  }
  if (!STATUSES.includes(raw.status)) {
    errors.push(error("invalid_shape", `${path}.status`, "status is not in the closed set"));
  }
  let amountUsdc = null;
  if (Object.hasOwn(raw, "amountUsdc")) {
    if (expectString(raw.amountUsdc, DECIMAL_RE, `${path}.amountUsdc`, errors)) {
      amountUsdc = raw.amountUsdc;
    }
  }
  if (Object.hasOwn(raw, "joins")) {
    readJoinDecls(raw.joins, joinKeys, `${path}.joins`, errors);
  }
  return {
    party: raw.party,
    sourceKind: raw.sourceKind,
    authorityClass: raw.authorityClass,
    receiptId: raw.receiptId,
    joinKeys,
    observedAt: raw.observedAt,
    amountUsdc,
    status: raw.status,
  };
}

function joinReceipts(receipts) {
  const joins = [];
  const joinedIds = new Set();
  const unjoined = [];

  for (const key of EXACT_KEYS) {
    const buckets = new Map();
    for (const receipt of receipts) {
      const value = receipt.joinKeys[key];
      if (!value) continue;
      if (!buckets.has(value)) buckets.set(value, []);
      buckets.get(value).push(receipt);
    }
    for (const [value, group] of buckets) {
      const byParty = new Map();
      for (const receipt of group) {
        if (byParty.has(receipt.party)) continue;
        byParty.set(receipt.party, receipt);
      }
      if (byParty.size < 2) continue;
      const members = [...byParty.values()].sort((a, b) => a.party.localeCompare(b.party));
      const authorityClasses = [...new Set(members.map((item) => item.authorityClass))].sort();
      joins.push({
        exactKey: key,
        exactValue: value,
        parties: members.map((item) => item.party),
        receipts: members.map((item) => ({
          party: item.party,
          receiptId: item.receiptId,
          sourceKind: item.sourceKind,
          authorityClass: item.authorityClass,
          status: item.status,
          amountUsdc: item.amountUsdc,
          observedAt: item.observedAt,
        })),
        authorityClasses,
        independentlySettled: false,
        summedUsdc: null,
      });
      for (const member of members) joinedIds.add(member.receiptId);
    }
  }

  const seenIds = new Set();
  for (const receipt of receipts) {
    if (seenIds.has(receipt.receiptId)) {
      unjoined.push({
        receiptId: receipt.receiptId,
        party: receipt.party,
        reason: "duplicate_receipt_id",
      });
      continue;
    }
    seenIds.add(receipt.receiptId);
    if (!joinedIds.has(receipt.receiptId)) {
      unjoined.push({
        receiptId: receipt.receiptId,
        party: receipt.party,
        reason: "no_cross_party_exact_key",
      });
    }
  }

  return { joins, unjoined };
}

export function probe(input) {
  const quotedPath = input && typeof input === "object" ? (input.quotedPath ?? null) : null;
  const body =
    input && typeof input === "object" && !Array.isArray(input) && Object.hasOwn(input, "quotedPath")
      ? Object.fromEntries(Object.entries(input).filter(([key]) => key !== "quotedPath"))
      : input;

  if (!isPlainObject(body)) {
    return closed(DECISIONS.INVALID_INPUT, ["input_not_object"], {
      quotedPath,
      errors: [error("invalid_shape", "$", "pack must be a plain object")],
    });
  }

  const scanErrors = [];
  scanTree(body, "$", scanErrors);
  if (scanErrors.length > 0) return firstErrorDecision(scanErrors, { quotedPath });

  const errors = [];
  allowKeys(body, ROOT_KEYS, "$", errors);
  requireKeys(body, ["schemaVersion", "mode", "receipts"], "$", errors);

  if (body.schemaVersion !== SCHEMA) {
    errors.push(error("unknown_schema_version", "$.schemaVersion", "unsupported schemaVersion"));
  }
  if (body.mode !== "read_only") {
    if (typeof body.mode === "string" && PAY_MODES.has(body.mode)) {
      errors.push(error("money_movement_refused", "$.mode", "join probe is read-only"));
    } else {
      errors.push(error("invalid_mode", "$.mode", "mode must be read_only"));
    }
  }

  if (!Array.isArray(body.receipts) || Object.keys(body.receipts).length !== body.receipts.length) {
    errors.push(error("invalid_shape", "$.receipts", "receipts must be an array"));
    return firstErrorDecision(errors, { quotedPath });
  }
  if (body.receipts.length < 2 || body.receipts.length > MAX_RECEIPTS) {
    errors.push(
      error("invalid_shape", "$.receipts", `expected 2 to ${MAX_RECEIPTS} receipts`),
    );
  }

  const receipts = [];
  const ids = new Set();
  for (let i = 0; i < body.receipts.length; i += 1) {
    const receipt = readReceipt(body.receipts[i], i, errors);
    if (!receipt) continue;
    if (ids.has(receipt.receiptId)) {
      errors.push(error("duplicate_receipt_id", `$.receipts[${i}].receiptId`, "duplicate receiptId"));
    }
    ids.add(receipt.receiptId);
    receipts.push(receipt);
  }

  if (errors.length > 0) return firstErrorDecision(errors, { quotedPath });

  const parties = [...new Set(receipts.map((item) => item.party))].sort();
  if (parties.length < 2) {
    return firstErrorDecision(
      [error("no_cross_party_join", "$.receipts", "cross-party join requires two distinct parties")],
      { quotedPath, parties },
    );
  }

  const { joins, unjoined } = joinReceipts(receipts);
  if (joins.length === 0) {
    return firstErrorDecision(
      [error("no_cross_party_join", "$.receipts", "no receipts share an exact join key")],
      { quotedPath, parties, unjoined },
    );
  }

  return closed(DECISIONS.JOINED, ["exact_key_join"], {
    quotedPath,
    joins,
    unjoined,
    parties,
  });
}

export function probeFile(filePath) {
  let parsed;
  try {
    parsed = loadJson(filePath);
  } catch (cause) {
    return closed(DECISIONS.INVALID_INPUT, ["invalid_json"], {
      quotedPath: filePath,
      errors: [error("invalid_shape", "$", `cannot parse JSON: ${cause.message}`)],
    });
  }
  return probe({ ...parsed, quotedPath: filePath });
}

export function codesFrom(result) {
  const fromErrors = Array.isArray(result.errors) ? result.errors.map((item) => item.code) : [];
  const fromReasons = Array.isArray(result.reasons) ? result.reasons : [];
  return [...new Set([...fromErrors, ...fromReasons])];
}

export function runSuite() {
  const results = [];
  for (const filePath of listJsonFiles(VALID_FIXTURES)) {
    const result = probeFile(filePath);
    results.push({
      filePath,
      expect: "accept",
      ok: result.ok && result.decision === DECISIONS.JOINED,
      errors: result.errors,
      codes: codesFrom(result),
    });
  }

  const manifest = loadInvalidManifest();
  for (const [name, spec] of Object.entries(manifest)) {
    const filePath = join(INVALID_FIXTURES, name);
    const result = probeFile(filePath);
    const codes = codesFrom(result);
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

export function seededFailurePath(id) {
  const spec = SEEDED_FAILURES[id];
  if (!spec) return null;
  return join(INVALID_FIXTURES, spec.file);
}
