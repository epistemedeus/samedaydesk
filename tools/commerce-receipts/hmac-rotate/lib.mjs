import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const VALID_FIXTURES = join(here, "fixtures/valid");
const INVALID_FIXTURES = join(here, "fixtures/invalid");
const INVALID_MANIFEST = join(INVALID_FIXTURES, "manifest.json");
const CATALOG = join(here, "fixtures/catalog.json");
const UNPAID_BODY = join(here, "fixtures/bodies/unpaid-402-extract.json");

export const SCHEMA = "samedaydesk.commerce-receipts.hmac-rotate.v1";
export const HMAC_DOMAIN = "samedaydesk.commerce-receipts.hmac.v1";
export const FIXTURE_DOMAIN = "samedaydesk.commerce-receipts.hmac-rotate.fixture.v1";

export const INTENTS = Object.freeze(["sign", "verify", "rotate", "expire"]);
export const KEY_STATUSES = Object.freeze(["current", "previous", "retired"]);
export const DECISIONS = Object.freeze({
  ACCEPTED: "accepted",
  INVALID_INPUT: "invalid-input",
  REJECTED: "rejected",
});

export const SEEDED_FAILURES = Object.freeze({
  "retired-key-after-overlap": {
    file: "retired-key-after-overlap.json",
    code: "retired_key_after_overlap",
    message: "seeded retired-key-after-overlap caught: retired kid cannot verify after overlap",
  },
  "forged-mac": {
    file: "forged-mac.json",
    code: "forged_mac",
    message: "seeded forged-mac caught: HMAC does not match body and kid",
  },
});

const ROOT_KEYS = Object.freeze([
  "schemaVersion",
  "intent",
  "now",
  "overlapMs",
  "keyring",
  "receipts",
  "rotateTo",
]);
const KEY_KEYS = Object.freeze(["kid", "label", "status", "notBefore", "notAfter"]);
const RECEIPT_KEYS = Object.freeze(["receiptId", "kid", "mac", "body"]);
const ROTATE_TO_KEYS = Object.freeze(["kid", "label"]);
const BODY_KEYS = Object.freeze([
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
  "accepts",
]);
const ACCEPT_KEYS = Object.freeze(["scheme", "network", "amount", "asset", "payTo"]);
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const INVENTED_FIELDS = new Set([
  "loyaltypoints",
  "throughblock",
  "buyeremail",
  "npsscore",
  "tipamount",
  "uniquevisitors",
]);
const SECRET_KEYS = new Set([
  "secret",
  "hmacsecret",
  "privatekey",
  "signingkey",
  "apikey",
  "rawkey",
  "keymaterial",
  "pepper",
]);
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
  "payment",
  "neo",
  "publish",
  "paymentintent",
  "paymentsignature",
  "xpayment",
  "stripe",
  "walletpay",
  "sendtransaction",
]);
const PAY_INTENTS = new Set(["pay", "paid", "checkout", "settle", "publish", "neo", "live"]);
const REFUSED_FLAGS = new Set([
  "--pay",
  "--checkout",
  "--payment",
  "--settle",
  "--live",
  "--neo",
  "--publish",
  "--registry",
  "--refund",
  "--capture",
]);

const TOKEN_RE = /^[a-z][a-z0-9_-]{2,95}$/;
const KID_RE = /^sds-hmac-[a-z0-9-]{1,64}$/;
const LABEL_RE = /^fixture\.[a-z0-9._-]{1,64}$/;
const RFC3339_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;
const MAC_RE = /^hmac-sha256:[a-f0-9]{64}$/;
const AMOUNT_RE = /^[1-9][0-9]{0,20}$/;
const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
const MAX_KEYS = 8;
const MAX_RECEIPTS = 8;
const MAX_OVERLAP_MS = 7 * 24 * 60 * 60 * 1000;
const COLD_OVERLAP_MS = 60 * 60 * 1000;
const COLD_NOW = "2026-09-17T12:00:00.000Z";
const COLD_AFTER = "2026-09-17T13:00:00.000Z";

const BOUNDARIES = Object.freeze({
  readOnly: true,
  payment: false,
  checkout: false,
  publish: false,
  neo: false,
  live: false,
  moneyMovement: false,
});

export function validFixtureDir() {
  return VALID_FIXTURES;
}

export function invalidFixtureDir() {
  return INVALID_FIXTURES;
}

export function catalogPath() {
  return CATALOG;
}

export function unpaidBodyPath() {
  return UNPAID_BODY;
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

export function refusedFlag(argv) {
  return argv.find((arg) => REFUSED_FLAGS.has(arg)) ?? null;
}

export function deriveFixtureKey(label) {
  return createHash("sha256")
    .update(FIXTURE_DOMAIN, "utf8")
    .update("\0")
    .update(String(label), "utf8")
    .digest();
}

export function fingerprint(key) {
  return `sha256:${createHash("sha256").update(key).digest("hex")}`;
}

export function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortValue(value[key])]),
    );
  }
  return value;
}

export function macBytes(key, kid, body) {
  return createHmac("sha256", key)
    .update(HMAC_DOMAIN, "utf8")
    .update("\0")
    .update(String(kid), "utf8")
    .update("\0")
    .update(canonicalJson(body), "utf8")
    .digest();
}

export function formatMac(bytes) {
  return `hmac-sha256:${bytes.toString("hex")}`;
}

export function signBody(key, kid, body) {
  return formatMac(macBytes(key, kid, body));
}

export function macsEqual(presented, expected) {
  const a = Buffer.from(String(presented));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
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

function extraKeys(value, allowed) {
  return ownKeys(value).filter((key) => !allowed.includes(key));
}

function parseTime(value, path, errors) {
  if (typeof value !== "string" || !RFC3339_RE.test(value)) {
    errors.push(error("invalid_timestamp", path, "timestamp must be RFC3339 with milliseconds Z"));
    return null;
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    errors.push(error("invalid_timestamp", path, "timestamp is not parseable"));
    return null;
  }
  return ms;
}

function closed(decision, reasons, extra = {}) {
  const errors = Array.isArray(extra.errors) ? extra.errors : [];
  const ok = decision === DECISIONS.ACCEPTED && errors.length === 0;
  return redactSecrets({
    ok,
    schemaVersion: SCHEMA,
    decision,
    reasons: reasons.slice(0, 32),
    errors,
    quotedPath: extra.quotedPath ?? null,
    mode: extra.mode ?? "read_only",
    intent: extra.intent ?? null,
    paid: false,
    moneyMovement: false,
    neo: false,
    publish: false,
    checkout: false,
    secretsEmitted: false,
    boundaries: { ...BOUNDARIES },
    naive: extra.naive ?? null,
    keyring: extra.keyring ?? null,
    receipts: extra.receipts ?? [],
    rotation: extra.rotation ?? null,
  });
}

function keyPublicView(entry, key) {
  return {
    kid: entry.kid,
    status: entry.status,
    notBefore: entry.notBefore,
    notAfter: entry.notAfter,
    fingerprint: fingerprint(key),
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
  if (!isPlainObject(value)) return;
  for (const key of ownKeys(value)) {
    const childPath = path === "$" ? `$.${key}` : `${path}.${key}`;
    if (FORBIDDEN_KEYS.has(key)) {
      errors.push(error("additional_property", childPath, `property ${key} is not allowed`));
      return;
    }
    const normalized = normalizeKey(key);
    if (SECRET_KEYS.has(normalized)) {
      errors.push(error("secret_in_pack", childPath, "hmac-rotate never accepts raw key material"));
      return;
    }
    if (INVENTED_FIELDS.has(normalized)) {
      errors.push(
        error("invented_receipt_field", childPath, "field is not on the live SDS receipt schema"),
      );
      return;
    }
    if (MONEY_MOVEMENT_KEYS.has(normalized)) {
      errors.push(
        error("money_movement_refused", childPath, "hmac-rotate refuses payment, checkout, neo, and publish"),
      );
      return;
    }
    scanTree(value[key], childPath, errors);
    if (errors.length > 0) return;
  }
}

function validateAccept(accept, path, errors) {
  if (!isPlainObject(accept)) {
    errors.push(error("invalid_accept", path, "accepts entry must be an object"));
    return;
  }
  const extra = extraKeys(accept, ACCEPT_KEYS);
  if (extra.length > 0) {
    errors.push(error("additional_property", `${path}.${extra[0]}`, `property ${extra[0]} is not allowed`));
    return;
  }
  for (const key of ACCEPT_KEYS) {
    if (!(key in accept)) {
      errors.push(error("missing_property", `${path}.${key}`, `missing ${key}`));
      return;
    }
  }
  if (accept.scheme !== "exact") {
    errors.push(error("invalid_accept", `${path}.scheme`, "scheme must be exact"));
  }
  if (accept.network !== "eip155:8453") {
    errors.push(error("invalid_accept", `${path}.network`, "network must be eip155:8453"));
  }
  if (typeof accept.amount !== "string" || !AMOUNT_RE.test(accept.amount)) {
    errors.push(error("invalid_accept", `${path}.amount`, "amount must be a decimal integer string"));
  }
  if (typeof accept.asset !== "string" || !ADDR_RE.test(accept.asset)) {
    errors.push(error("invalid_accept", `${path}.asset`, "asset must be a 20-byte hex address"));
  }
  if (typeof accept.payTo !== "string" || !ADDR_RE.test(accept.payTo)) {
    errors.push(error("invalid_accept", `${path}.payTo`, "payTo must be a 20-byte hex address"));
  }
}

function validateBody(body, path, errors) {
  if (!isPlainObject(body)) {
    errors.push(error("invalid_body", path, "receipt body must be an object"));
    return;
  }
  const extra = extraKeys(body, BODY_KEYS);
  if (extra.length > 0) {
    const normalized = normalizeKey(extra[0]);
    if (INVENTED_FIELDS.has(normalized) || extra[0] === "loyaltyPoints") {
      errors.push(
        error("invented_receipt_field", `${path}.${extra[0]}`, "field is not on the live SDS receipt schema"),
      );
      return;
    }
    errors.push(error("additional_property", `${path}.${extra[0]}`, `property ${extra[0]} is not allowed`));
    return;
  }
  for (const key of BODY_KEYS) {
    if (!(key in body)) {
      errors.push(error("missing_property", `${path}.${key}`, `missing ${key}`));
      return;
    }
  }
  if (typeof body.receiptId !== "string" || !TOKEN_RE.test(body.receiptId)) {
    errors.push(error("invalid_body", `${path}.receiptId`, "receiptId is not a closed token"));
  }
  if (body.kind !== "unpaid_payment_required" && body.kind !== "unpaid_offer" && body.kind !== "unpaid_probe") {
    errors.push(error("invalid_body", `${path}.kind`, "kind must be an unpaid receipt kind"));
  }
  if (body.statusClass !== "unpaid") {
    errors.push(error("paid_as_unpaid", `${path}.statusClass`, "hmac-rotate packs are unpaid-only"));
  }
  if (body.origin !== "https://agents.samedaydesk.com") {
    errors.push(error("invalid_body", `${path}.origin`, "origin must be agents.samedaydesk.com"));
  }
  if (body.charged !== false || body.paymentSent !== false) {
    errors.push(error("paid_as_unpaid", path, "charged or paymentSent true is paid evidence"));
  }
  if (body.httpStatus !== 402 && body.httpStatus !== null) {
    errors.push(error("paid_as_unpaid", `${path}.httpStatus`, "paid HTTP labeled unpaid is refused"));
  }
  parseTime(body.observedAt, `${path}.observedAt`, errors);
  if (!Array.isArray(body.accepts) || body.accepts.length < 1 || body.accepts.length > 4) {
    errors.push(error("invalid_body", `${path}.accepts`, "accepts must have 1-4 entries"));
    return;
  }
  validateAccept(body.accepts[0], `${path}.accepts[0]`, errors);
}

function materializeKey(entry, path, errors) {
  if (!isPlainObject(entry)) {
    errors.push(error("invalid_key", path, "key entry must be an object"));
    return null;
  }
  const extra = extraKeys(entry, KEY_KEYS);
  if (extra.length > 0) {
    errors.push(error("additional_property", `${path}.${extra[0]}`, `property ${extra[0]} is not allowed`));
    return null;
  }
  for (const key of KEY_KEYS) {
    if (key === "notAfter") continue;
    if (!(key in entry)) {
      errors.push(error("missing_property", `${path}.${key}`, `missing ${key}`));
      return null;
    }
  }
  if (typeof entry.kid !== "string" || !KID_RE.test(entry.kid)) {
    errors.push(error("invalid_kid", `${path}.kid`, "kid must match sds-hmac-[a-z0-9-]+"));
    return null;
  }
  if (typeof entry.label !== "string" || !LABEL_RE.test(entry.label)) {
    errors.push(error("invalid_label", `${path}.label`, "label must be a fixture.* public label"));
    return null;
  }
  if (!KEY_STATUSES.includes(entry.status)) {
    errors.push(error("invalid_status", `${path}.status`, "status must be current, previous, or retired"));
    return null;
  }
  const notBefore = parseTime(entry.notBefore, `${path}.notBefore`, errors);
  let notAfter = null;
  if (entry.notAfter != null) {
    notAfter = parseTime(entry.notAfter, `${path}.notAfter`, errors);
  }
  if (errors.length > 0) return null;
  if (notAfter != null && notAfter <= notBefore) {
    errors.push(error("invalid_window", path, "notAfter must be after notBefore"));
    return null;
  }
  const key = deriveFixtureKey(entry.label);
  return { entry, key, notBefore, notAfter };
}

function materializeKeyring(keyring, path, errors) {
  if (!isPlainObject(keyring) || !Array.isArray(keyring.keys)) {
    errors.push(error("invalid_keyring", path, "keyring.keys must be an array"));
    return [];
  }
  const extra = extraKeys(keyring, ["keys"]);
  if (extra.length > 0) {
    errors.push(error("additional_property", `${path}.${extra[0]}`, `property ${extra[0]} is not allowed`));
    return [];
  }
  if (keyring.keys.length < 1 || keyring.keys.length > MAX_KEYS) {
    errors.push(error("invalid_keyring", `${path}.keys`, `keyring must have 1-${MAX_KEYS} keys`));
    return [];
  }
  const materialized = [];
  const seenKids = new Set();
  const seenFingerprints = new Set();
  for (let i = 0; i < keyring.keys.length; i += 1) {
    const item = materializeKey(keyring.keys[i], `${path}.keys[${i}]`, errors);
    if (!item) return [];
    if (seenKids.has(item.entry.kid)) {
      errors.push(error("duplicate_kid", `${path}.keys[${i}].kid`, "kid already exists"));
      return [];
    }
    const fp = fingerprint(item.key);
    if (seenFingerprints.has(fp)) {
      errors.push(error("key_reuse", `${path}.keys[${i}].label`, "key fingerprint already in the ring"));
      return [];
    }
    seenKids.add(item.entry.kid);
    seenFingerprints.add(fp);
    materialized.push(item);
  }
  const currents = materialized.filter((item) => item.entry.status === "current");
  if (currents.length !== 1) {
    errors.push(error("invalid_keyring", `${path}.keys`, "keyring must have exactly one current key"));
  }
  return materialized;
}

function findKey(materialized, kid) {
  return materialized.find((item) => item.entry.kid === kid) ?? null;
}

function keyUsableForVerify(item, nowMs) {
  if (nowMs < item.notBefore) return { ok: false, code: "future_key" };
  if (item.entry.status === "retired") return { ok: false, code: "retired_key_after_overlap" };
  if (item.notAfter != null && nowMs >= item.notAfter) return { ok: false, code: "retired_key_after_overlap" };
  if (item.entry.status === "current" || item.entry.status === "previous") return { ok: true, code: null };
  return { ok: false, code: "retired_key_after_overlap" };
}

function keyUsableForSign(item, nowMs) {
  if (item.entry.status !== "current") {
    return {
      ok: false,
      code: item.entry.status === "previous" ? "previous_key_cannot_sign" : "retired_key_cannot_sign",
    };
  }
  if (nowMs < item.notBefore) return { ok: false, code: "future_key" };
  if (item.notAfter != null && nowMs >= item.notAfter) return { ok: false, code: "retired_key_after_overlap" };
  return { ok: true, code: null };
}

function naiveMacOk(item, kid, body, mac) {
  if (!item || typeof mac !== "string" || !MAC_RE.test(mac)) return false;
  const expected = signBody(item.key, kid, body);
  return macsEqual(mac, expected);
}

function verifyOne(item, receipt, path, nowMs, errors, intent) {
  if (!item) {
    errors.push(error("unknown_kid", `${path}.kid`, "kid is not in the keyring"));
    return { ok: false, naive: false };
  }
  const naive = naiveMacOk(item, receipt.kid, receipt.body, receipt.mac);
  if (intent === "sign") {
    const usable = keyUsableForSign(item, nowMs);
    if (!usable.ok) {
      errors.push(error(usable.code, `${path}.kid`, usable.code.replaceAll("_", " ")));
      return { ok: false, naive };
    }
    return { ok: true, naive, mac: signBody(item.key, receipt.kid, receipt.body) };
  }
  if (typeof receipt.mac !== "string" || !MAC_RE.test(receipt.mac)) {
    errors.push(error("invalid_mac", `${path}.mac`, "mac must be hmac-sha256:<64 hex>"));
    return { ok: false, naive: false };
  }
  const usable = keyUsableForVerify(item, nowMs);
  if (!usable.ok) {
    errors.push(error(usable.code, `${path}.kid`, usable.code.replaceAll("_", " ")));
    return { ok: false, naive };
  }
  const expected = signBody(item.key, receipt.kid, receipt.body);
  if (!macsEqual(receipt.mac, expected)) {
    errors.push(error("forged_mac", `${path}.mac`, "HMAC does not match body and kid"));
    return { ok: false, naive: false };
  }
  return { ok: true, naive: true, mac: receipt.mac };
}

function validateReceipt(receipt, path, errors) {
  if (!isPlainObject(receipt)) {
    errors.push(error("invalid_receipt", path, "receipt must be an object"));
    return null;
  }
  const extra = extraKeys(receipt, RECEIPT_KEYS);
  if (extra.length > 0) {
    errors.push(error("additional_property", `${path}.${extra[0]}`, `property ${extra[0]} is not allowed`));
    return null;
  }
  for (const key of ["receiptId", "kid", "body"]) {
    if (!(key in receipt)) {
      errors.push(error("missing_property", `${path}.${key}`, `missing ${key}`));
      return null;
    }
  }
  if (typeof receipt.receiptId !== "string" || !TOKEN_RE.test(receipt.receiptId)) {
    errors.push(error("invalid_receipt", `${path}.receiptId`, "receiptId is not a closed token"));
  }
  if (typeof receipt.kid !== "string" || !KID_RE.test(receipt.kid)) {
    errors.push(error("invalid_kid", `${path}.kid`, "kid must match sds-hmac-[a-z0-9-]+"));
  }
  validateBody(receipt.body, `${path}.body`, errors);
  return receipt;
}

export function applyRotate(materialized, nowIso, overlapMs, rotateTo, errors) {
  const nowMs = Date.parse(nowIso);
  if (!Number.isInteger(overlapMs) || overlapMs < 1 || overlapMs > MAX_OVERLAP_MS) {
    errors.push(error("overlap_required", "$.overlapMs", "rotation requires overlapMs in 1..604800000"));
    return materialized;
  }
  if (!isPlainObject(rotateTo)) {
    errors.push(error("invalid_rotate_to", "$.rotateTo", "rotateTo must be {kid,label}"));
    return materialized;
  }
  const extra = extraKeys(rotateTo, ROTATE_TO_KEYS);
  if (extra.length > 0) {
    errors.push(error("additional_property", `$.rotateTo.${extra[0]}`, `property ${extra[0]} is not allowed`));
    return materialized;
  }
  if (typeof rotateTo.kid !== "string" || !KID_RE.test(rotateTo.kid)) {
    errors.push(error("invalid_kid", "$.rotateTo.kid", "kid must match sds-hmac-[a-z0-9-]+"));
    return materialized;
  }
  if (typeof rotateTo.label !== "string" || !LABEL_RE.test(rotateTo.label)) {
    errors.push(error("invalid_label", "$.rotateTo.label", "label must be a fixture.* public label"));
    return materialized;
  }
  if (findKey(materialized, rotateTo.kid)) {
    errors.push(error("duplicate_kid", "$.rotateTo.kid", "rotateTo kid already exists"));
    return materialized;
  }
  const nextKey = deriveFixtureKey(rotateTo.label);
  const nextFp = fingerprint(nextKey);
  if (materialized.some((item) => fingerprint(item.key) === nextFp)) {
    errors.push(error("key_reuse", "$.rotateTo.label", "rotateTo fingerprint already in the ring"));
    return materialized;
  }
  const nextNotAfterIso = new Date(nowMs + overlapMs).toISOString();
  const rotated = materialized.map((item) => {
    if (item.entry.status === "current") {
      const entry = {
        ...item.entry,
        status: "previous",
        notAfter: nextNotAfterIso,
      };
      return { ...item, entry, notAfter: nowMs + overlapMs };
    }
    if (item.entry.status === "previous") {
      const entry = { ...item.entry, status: "retired" };
      return { ...item, entry };
    }
    return item;
  });
  rotated.push({
    entry: {
      kid: rotateTo.kid,
      label: rotateTo.label,
      status: "current",
      notBefore: nowIso,
      notAfter: null,
    },
    key: nextKey,
    notBefore: nowMs,
    notAfter: null,
  });
  return rotated;
}

export function applyExpire(materialized, nowMs) {
  return materialized.map((item) => {
    if (item.entry.status === "retired") return item;
    if (item.notAfter != null && nowMs >= item.notAfter) {
      return { ...item, entry: { ...item.entry, status: "retired" } };
    }
    return item;
  });
}

function publicKeyring(materialized) {
  return {
    keys: materialized.map((item) => keyPublicView(item.entry, item.key)),
  };
}

function redactSecrets(value) {
  return value;
}

function assertNoRawKeys(envelope, materialized) {
  const dumped = JSON.stringify(envelope);
  for (const item of materialized) {
    const hex = item.key.toString("hex");
    if (dumped.includes(hex)) {
      throw new Error("raw fixture key leaked into envelope");
    }
  }
  return envelope;
}

export function evaluate(pack, options = {}) {
  const quotedPath = options.quotedPath ?? null;
  const errors = [];
  if (!isPlainObject(pack)) {
    return closed(DECISIONS.INVALID_INPUT, ["invalid_pack"], {
      errors: [error("invalid_pack", "$", "pack must be an object")],
      quotedPath,
    });
  }
  scanTree(pack, "$", errors);
  if (errors.length > 0) {
    return closed(DECISIONS.INVALID_INPUT, errors.map((item) => item.code), { errors, quotedPath });
  }
  const extra = extraKeys(pack, ROOT_KEYS);
  if (extra.length > 0) {
    const normalized = normalizeKey(extra[0]);
    const code = INVENTED_FIELDS.has(normalized)
      ? "invented_receipt_field"
      : SECRET_KEYS.has(normalized)
        ? "secret_in_pack"
        : "additional_property";
    errors.push(error(code, `$.${extra[0]}`, `property ${extra[0]} is not allowed`));
    return closed(DECISIONS.INVALID_INPUT, [code], { errors, quotedPath });
  }
  if (pack.schemaVersion !== SCHEMA) {
    errors.push(error("invalid_schema", "$.schemaVersion", `schemaVersion must be ${SCHEMA}`));
  }
  if (!INTENTS.includes(pack.intent)) {
    if (typeof pack.intent === "string" && PAY_INTENTS.has(pack.intent)) {
      errors.push(error("money_movement_refused", "$.intent", "hmac-rotate refuses payment intents"));
    } else {
      errors.push(error("invalid_intent", "$.intent", "intent must be sign, verify, rotate, or expire"));
    }
  }
  const nowMs = parseTime(pack.now, "$.now", errors);
  if (errors.length > 0) {
    return closed(DECISIONS.INVALID_INPUT, errors.map((item) => item.code), { errors, quotedPath, intent: pack.intent });
  }
  const materialized = materializeKeyring(pack.keyring, "$.keyring", errors);
  if (!Array.isArray(pack.receipts) || pack.receipts.length < 1 || pack.receipts.length > MAX_RECEIPTS) {
    errors.push(error("invalid_receipts", "$.receipts", `receipts must have 1-${MAX_RECEIPTS} entries`));
  }
  const receipts = [];
  if (Array.isArray(pack.receipts)) {
    for (let i = 0; i < pack.receipts.length; i += 1) {
      const receipt = validateReceipt(pack.receipts[i], `$.receipts[${i}]`, errors);
      if (receipt) receipts.push(receipt);
    }
  }
  if (errors.length > 0) {
    return closed(DECISIONS.INVALID_INPUT, unique(errors.map((item) => item.code)), {
      errors,
      quotedPath,
      intent: pack.intent,
      keyring: materialized.length ? publicKeyring(materialized) : null,
    });
  }

  let ring = materialized;
  let rotation = null;
  if (pack.intent === "rotate") {
    ring = applyRotate(ring, pack.now, pack.overlapMs, pack.rotateTo, errors);
    if (errors.length === 0) {
      rotation = {
        previousKid: ring.find((item) => item.entry.status === "previous")?.entry.kid ?? null,
        currentKid: ring.find((item) => item.entry.status === "current")?.entry.kid ?? null,
        overlapMs: pack.overlapMs,
      };
    }
  } else if (pack.intent === "expire") {
    ring = applyExpire(ring, nowMs);
  } else if (pack.overlapMs != null) {
    errors.push(error("additional_property", "$.overlapMs", "overlapMs is only valid on rotate"));
  }
  if (pack.intent !== "rotate" && pack.rotateTo != null) {
    errors.push(error("additional_property", "$.rotateTo", "rotateTo is only valid on rotate"));
  }
  if (errors.length > 0) {
    return closed(DECISIONS.INVALID_INPUT, unique(errors.map((item) => item.code)), {
      errors,
      quotedPath,
      intent: pack.intent,
      keyring: publicKeyring(ring),
    });
  }

  const receiptViews = [];
  let naiveAccepts = 0;
  for (let i = 0; i < receipts.length; i += 1) {
    const receipt = receipts[i];
    const item = findKey(ring, receipt.kid);
    const verified = verifyOne(item, receipt, `$.receipts[${i}]`, nowMs, errors, pack.intent);
    if (verified.naive) naiveAccepts += 1;
    receiptViews.push({
      receiptId: receipt.receiptId,
      kid: receipt.kid,
      mac: pack.intent === "sign" ? verified.mac ?? null : receipt.mac ?? null,
      verified: verified.ok,
    });
  }

  const naive = {
    ok: naiveAccepts === receipts.length && receipts.length > 0,
    receiptsAccepted: naiveAccepts,
    ignoresKeyStatus: true,
  };

  if (errors.length > 0) {
    const envelope = closed(DECISIONS.REJECTED, unique(errors.map((item) => item.code)), {
      errors,
      quotedPath,
      intent: pack.intent,
      naive,
      keyring: publicKeyring(ring),
      receipts: receiptViews,
      rotation,
    });
    return assertNoRawKeys(envelope, ring);
  }

  const envelope = closed(DECISIONS.ACCEPTED, ["hmac_ok"], {
    errors: [],
    quotedPath,
    intent: pack.intent,
    mode: pack.intent === "rotate" ? "rotate" : "verify",
    naive,
    keyring: publicKeyring(ring),
    receipts: receiptViews,
    rotation,
  });
  return assertNoRawKeys(envelope, ring);
}

function unique(values) {
  return [...new Set(values)];
}

export function codesFrom(result) {
  return (result.errors ?? []).map((item) => item.code);
}

function quotePath(filePath) {
  const prefix = `${here}/`;
  if (filePath.startsWith(prefix)) return filePath.slice(prefix.length);
  return filePath;
}

export function evaluateFile(filePath) {
  const quotedPath = quotePath(filePath);
  let pack;
  try {
    pack = loadJson(filePath);
  } catch (cause) {
    return closed(DECISIONS.INVALID_INPUT, ["unreadable_pack"], {
      errors: [error("unreadable_pack", quotedPath, cause.message)],
      quotedPath,
    });
  }
  return evaluate(pack, { quotedPath });
}

export function seededFailurePath(id) {
  const spec = SEEDED_FAILURES[id];
  if (!spec) return null;
  return join(INVALID_FIXTURES, spec.file);
}

export function evaluateSeededFailure(id) {
  const spec = SEEDED_FAILURES[id];
  if (!spec) {
    return {
      ok: false,
      seededFailure: id,
      error: { code: "unknown_seeded_failure", message: `unknown seeded failure ${id}` },
    };
  }
  const filePath = join(INVALID_FIXTURES, spec.file);
  const honest = evaluateFile(filePath);
  const codes = codesFrom(honest);
  const rejected = honest.ok === false && codes.includes(spec.code);
  return {
    ok: rejected,
    seededFailure: id,
    code: spec.code,
    message: spec.message,
    rejected,
    naive: honest.naive,
    honest: {
      ok: honest.ok,
      decision: honest.decision,
      codes,
    },
    quotedPath: honest.quotedPath,
    result: honest,
  };
}

export function runSuite() {
  const catalog = loadJson(CATALOG);
  const results = [];
  for (const filePath of listJsonFiles(VALID_FIXTURES)) {
    const result = evaluateFile(filePath);
    results.push({
      filePath,
      expect: "accept",
      ok: result.ok === true,
      codes: codesFrom(result),
      result,
    });
  }
  const manifest = loadInvalidManifest();
  for (const row of manifest.cases) {
    const filePath = join(INVALID_FIXTURES, row.file);
    const result = evaluateFile(filePath);
    const codes = codesFrom(result);
    const ok = result.ok === false && codes.includes(row.code);
    results.push({
      filePath,
      expect: "reject",
      expectedCode: row.code,
      ok,
      codes,
      result,
    });
  }
  const failed = results.filter((item) => item.ok !== true);
  return {
    ok: failed.length === 0,
    passed: results.filter((item) => item.ok).length,
    failed: failed.length,
    total: results.length,
    catalog: catalog.id,
    results,
  };
}

export function signReceipt(kid, label, body, status, notBefore, notAfter = null) {
  const key = deriveFixtureKey(label);
  return {
    receiptId: body.receiptId,
    kid,
    mac: signBody(key, kid, body),
    body,
    _view: keyPublicView({ kid, status, notBefore, notAfter }, key),
  };
}

export function runCold() {
  const body = loadJson(UNPAID_BODY);
  const kidA = "sds-hmac-2026-09-a";
  const kidB = "sds-hmac-2026-09-b";
  const labelA = "fixture.a";
  const labelB = "fixture.b";
  const keyA = deriveFixtureKey(labelA);
  const keyB = deriveFixtureKey(labelB);
  const signed = {
    receiptId: body.receiptId,
    kid: kidA,
    mac: signBody(keyA, kidA, body),
    body,
  };

  const before = evaluate({
    schemaVersion: SCHEMA,
    intent: "verify",
    now: COLD_NOW,
    keyring: {
      keys: [
        {
          kid: kidA,
          label: labelA,
          status: "current",
          notBefore: "2026-09-17T00:00:00.000Z",
          notAfter: null,
        },
      ],
    },
    receipts: [signed],
  });

  const rotated = evaluate({
    schemaVersion: SCHEMA,
    intent: "rotate",
    now: COLD_NOW,
    overlapMs: COLD_OVERLAP_MS,
    keyring: {
      keys: [
        {
          kid: kidA,
          label: labelA,
          status: "current",
          notBefore: "2026-09-17T00:00:00.000Z",
          notAfter: null,
        },
      ],
    },
    rotateTo: { kid: kidB, label: labelB },
    receipts: [signed],
  });

  const dual = evaluate({
    schemaVersion: SCHEMA,
    intent: "verify",
    now: COLD_NOW,
    keyring: {
      keys: [
        {
          kid: kidA,
          label: labelA,
          status: "previous",
          notBefore: "2026-09-17T00:00:00.000Z",
          notAfter: COLD_AFTER,
        },
        {
          kid: kidB,
          label: labelB,
          status: "current",
          notBefore: COLD_NOW,
          notAfter: null,
        },
      ],
    },
    receipts: [signed],
  });

  const body2 = { ...body, receiptId: "cr_unpaid_extract_402_rotated" };
  const signedCurrent = {
    receiptId: body2.receiptId,
    kid: kidB,
    mac: signBody(keyB, kidB, body2),
    body: body2,
  };
  const signCurrent = evaluate({
    schemaVersion: SCHEMA,
    intent: "verify",
    now: COLD_NOW,
    keyring: {
      keys: [
        {
          kid: kidA,
          label: labelA,
          status: "previous",
          notBefore: "2026-09-17T00:00:00.000Z",
          notAfter: COLD_AFTER,
        },
        {
          kid: kidB,
          label: labelB,
          status: "current",
          notBefore: COLD_NOW,
          notAfter: null,
        },
      ],
    },
    receipts: [signedCurrent],
  });

  const expired = evaluate({
    schemaVersion: SCHEMA,
    intent: "expire",
    now: COLD_AFTER,
    keyring: {
      keys: [
        {
          kid: kidA,
          label: labelA,
          status: "previous",
          notBefore: "2026-09-17T00:00:00.000Z",
          notAfter: COLD_AFTER,
        },
        {
          kid: kidB,
          label: labelB,
          status: "current",
          notBefore: COLD_NOW,
          notAfter: null,
        },
      ],
    },
    receipts: [signed],
  });

  const retiredReject = evaluate({
    schemaVersion: SCHEMA,
    intent: "verify",
    now: COLD_AFTER,
    keyring: {
      keys: [
        {
          kid: kidA,
          label: labelA,
          status: "retired",
          notBefore: "2026-09-17T00:00:00.000Z",
          notAfter: COLD_AFTER,
        },
        {
          kid: kidB,
          label: labelB,
          status: "current",
          notBefore: COLD_NOW,
          notAfter: null,
        },
      ],
    },
    receipts: [signed],
  });

  const currentAfterExpire = evaluate({
    schemaVersion: SCHEMA,
    intent: "verify",
    now: COLD_AFTER,
    keyring: {
      keys: [
        {
          kid: kidA,
          label: labelA,
          status: "retired",
          notBefore: "2026-09-17T00:00:00.000Z",
          notAfter: COLD_AFTER,
        },
        {
          kid: kidB,
          label: labelB,
          status: "current",
          notBefore: COLD_NOW,
          notAfter: null,
        },
      ],
    },
    receipts: [signedCurrent],
  });

  const steps = [
    {
      name: "sign",
      ok: typeof signed.mac === "string" && MAC_RE.test(signed.mac),
      kid: kidA,
      fingerprint: fingerprint(keyA),
    },
    {
      name: "verify",
      ok: before.ok === true,
      codes: codesFrom(before),
    },
    {
      name: "rotate",
      ok: rotated.ok === true && rotated.rotation?.currentKid === kidB,
      previousKid: rotated.rotation?.previousKid ?? null,
      currentKid: rotated.rotation?.currentKid ?? null,
      overlapMs: COLD_OVERLAP_MS,
      fingerprint: fingerprint(keyB),
    },
    {
      name: "dual-verify",
      ok: dual.ok === true,
      codes: codesFrom(dual),
    },
    {
      name: "sign-current",
      ok: signCurrent.ok === true,
      kid: kidB,
    },
    {
      name: "expire-overlap",
      ok: expired.ok === false && codesFrom(expired).includes("retired_key_after_overlap"),
      retired: [kidA],
    },
    {
      name: "retired-reject",
      ok:
        retiredReject.ok === false &&
        codesFrom(retiredReject).includes("retired_key_after_overlap") &&
        retiredReject.naive?.ok === true,
      rejected: true,
      code: "retired_key_after_overlap",
      naiveAccepted: retiredReject.naive?.ok === true,
    },
    {
      name: "current-after-expire",
      ok: currentAfterExpire.ok === true,
      kid: kidB,
    },
  ];

  const ok = steps.every((step) => step.ok === true);
  const envelope = {
    ok,
    schemaVersion: SCHEMA,
    mode: "cold",
    paid: false,
    moneyMovement: false,
    neo: false,
    publish: false,
    checkout: false,
    secretsEmitted: false,
    overlapMs: COLD_OVERLAP_MS,
    now: COLD_NOW,
    afterOverlap: COLD_AFTER,
    origin: body.origin,
    resource: body.resource,
    steps,
    keyring: {
      keys: [
        keyPublicView(
          {
            kid: kidA,
            status: "retired",
            notBefore: "2026-09-17T00:00:00.000Z",
            notAfter: COLD_AFTER,
          },
          keyA,
        ),
        keyPublicView(
          {
            kid: kidB,
            status: "current",
            notBefore: COLD_NOW,
            notAfter: null,
          },
          keyB,
        ),
      ],
    },
    fingerprints: {
      a: fingerprint(keyA),
      b: fingerprint(keyB),
    },
  };
  return assertNoRawKeys(envelope, [
    { key: keyA, entry: { kid: kidA } },
    { key: keyB, entry: { kid: kidB } },
  ]);
}
