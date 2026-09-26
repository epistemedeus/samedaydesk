import { OWNER_TOKEN_ENV, ERROR_CODE } from "./constants.mjs";
import { fail } from "./errors.mjs";

const SECRET_ENV_RE =
  /^(?:.*(?:TOKEN|SECRET|PRIVATE|WALLET|MNEMONIC|PASSWORD|CREDENTIAL|API_KEY|AUTHORIZATION|BEARER).*)$/i;
const POSTGRES_URL_RE = /\bpostgres(?:ql)?:\/\/[^\s"'`]+/gi;
const WALLET_HEX_RE = /\b0x[a-fA-F0-9]{64}\b/g;
const PEM_RE = /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g;
const BEARER_HEADER_RE = /Bearer\s+\S+/gi;
const EW_CTR_RE = /\bew_ctr_[A-Za-z0-9_-]{16,}\b/g;

const ALWAYS_SECRET_NAMES = Object.freeze([
  OWNER_TOKEN_ENV,
  "WALLETLESS_LEDGER_ADMIN_TOKEN",
  "CORRESPONDENCE_ADMIN_TOKEN",
]);

export function isSecretEnvKey(key) {
  if (typeof key !== "string" || !key) return false;
  if (ALWAYS_SECRET_NAMES.includes(key)) return true;
  return SECRET_ENV_RE.test(key);
}

export function collectSecrets(...values) {
  const out = [];
  for (const value of values) {
    if (typeof value === "string" && value.length >= 8) out.push(value);
  }
  return [...new Set(out)];
}

export function collectEnvSecrets(env = process.env) {
  const secrets = [];
  for (const [key, value] of Object.entries(env || {})) {
    if (!isSecretEnvKey(key)) continue;
    if (typeof value === "string" && value.length >= 8) secrets.push(value);
  }
  return collectSecrets(...secrets);
}

export function redactString(text, extraSecrets = []) {
  let out = text == null ? "" : String(text);
  for (const secret of extraSecrets) {
    if (typeof secret === "string" && secret.length >= 8) {
      out = out.split(secret).join("[redacted]");
    }
  }
  out = out.replace(BEARER_HEADER_RE, "Bearer [redacted]");
  out = out.replace(EW_CTR_RE, "ew_ctr_[redacted]");
  out = out.replace(POSTGRES_URL_RE, "postgres://[redacted]");
  out = out.replace(WALLET_HEX_RE, "[redacted-wallet]");
  out = out.replace(PEM_RE, "[redacted-pem]");
  return out;
}

function walk(value, extraSecrets) {
  if (typeof value === "string") return redactString(value, extraSecrets);
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => walk(item, extraSecrets));
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    const safeKey = isSecretEnvKey(key) ? "[redacted-env]" : key;
    out[safeKey] = walk(item, extraSecrets);
  }
  return out;
}

export function redactValue(value, extraSecrets = []) {
  return walk(value, extraSecrets);
}

export function assertSecretFree(record, extraSecrets = [], label = "state.json") {
  const serialized = typeof record === "string" ? record : JSON.stringify(record);
  for (const secret of extraSecrets) {
    if (typeof secret === "string" && secret.length >= 8 && serialized.includes(secret)) {
      fail(ERROR_CODE.SECRET_LEAK, `${label} must not contain token plaintext`);
    }
  }
  if (EW_CTR_RE.test(serialized)) {
    EW_CTR_RE.lastIndex = 0;
    fail(ERROR_CODE.SECRET_LEAK, `${label} must not contain a raw contributor bearer`);
  }
  EW_CTR_RE.lastIndex = 0;
}

export function envDump(env = process.env, extraSecrets = []) {
  const keys = Object.keys(env || {}).sort();
  const values = {};
  for (const key of keys) {
    const raw = env[key];
    if (isSecretEnvKey(key)) {
      values[key] = raw == null || raw === "" ? "[unset]" : "[redacted]";
      continue;
    }
    values[key] = redactString(raw == null ? "" : String(raw), extraSecrets);
  }
  return {
    ownerTokenEnvPresent: Object.prototype.hasOwnProperty.call(env || {}, OWNER_TOKEN_ENV),
    keys,
    values,
  };
}

export function contributorEnvForbidden(env = process.env) {
  if (!Object.prototype.hasOwnProperty.call(env || {}, OWNER_TOKEN_ENV)) return;
  fail(
    ERROR_CODE.OWNER_TOKEN_IN_CONTRIBUTOR_PROCESS,
    "contributor process must not start with EARNED_WORK_OWNER_TOKEN set",
  );
}
