/**
 * Lockfile POST binding rules. Same shape as the merchant customer-x402 patch.
 * Unpatched merchant client still refuses any POST whose path is not /extract/batch.
 */
import { createHash } from "node:crypto";

export const LIVE_LOCKFILE_URL = "https://agents.samedaydesk.com/lockfile-pin-delta";
export const LIVE_NETWORK = "eip155:8453";
export const LIVE_ASSET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const LIVE_RECIPIENT = "0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee";
export const LIVE_AMOUNT_ATOMIC = "5000";
export const LOCKFILE_MAX_REQUEST_JSON_BYTES = 256 * 1024;

export const DEFAULT_LOCKFILE_REQUIRED_OUTPUT = Object.freeze({
  mediaType: "application/json",
  requiredFields: Object.freeze([
    "ok",
    "product",
    "schemaVersion",
    "charged",
    "analysis",
    "quote.amountAtomic",
  ]),
  maxResponseBytes: 160 * 1024,
});

export class AuthorizationRefusal extends Error {
  constructor(message, { field = null } = {}) {
    super(message);
    this.name = "AuthorizationRefusal";
    this.code = "authorization_refused";
    this.field = field;
  }
}

function fail(message, field = null) {
  throw new AuthorizationRefusal(message, { field });
}

function normalizeHexAddress(value, label) {
  const raw = String(value || "");
  if (!/^0x[a-fA-F0-9]{40}$/.test(raw)) fail(`${label} must be a checksummable EVM address`, label);
  return raw;
}

export function serializeLockfileBody(before, after) {
  return JSON.stringify({ before, after });
}

export function bodyDigestFor(bodyRaw) {
  return `sha256:${createHash("sha256").update(String(bodyRaw)).digest("hex")}`;
}

export function normalizeLockfileAuthorization(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("authorization must be an object");
  const method = String(input.method || "POST").toUpperCase();
  if (method !== "POST") fail("lockfile authorization method must be POST", "method");
  let url;
  try {
    url = new URL(String(input.url || ""));
  } catch {
    fail("url must be an absolute HTTPS URL", "url");
  }
  if (url.protocol !== "https:") fail("url must use HTTPS", "url");
  if (url.pathname !== "/lockfile-pin-delta") fail("authorization path must be /lockfile-pin-delta", "url");
  if (url.search) fail("lockfile authorization URL must not include a query string", "url");
  if (url.username || url.password || url.hash) fail("url must not contain credentials or a fragment", "url");

  let bodyRaw;
  let parsed;
  if (typeof input.bodyRaw === "string") {
    if (Buffer.byteLength(input.bodyRaw) > LOCKFILE_MAX_REQUEST_JSON_BYTES) {
      fail("bodyRaw exceeds request byte ceiling", "body");
    }
    parsed = JSON.parse(input.bodyRaw);
    bodyRaw = input.bodyRaw;
  } else if (input.body && typeof input.body === "object") {
    parsed = input.body;
    bodyRaw = serializeLockfileBody(parsed.before, parsed.after);
  } else {
    fail("lockfile authorization requires body {before, after} or bodyRaw", "body");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail("body must be a JSON object", "body");
  if (!parsed.before || !parsed.after) fail("body must include before and after objects", "body");
  if (typeof parsed.before !== "object" || typeof parsed.after !== "object" || Array.isArray(parsed.before) || Array.isArray(parsed.after)) {
    fail("before and after must be objects (not paths)", "body");
  }

  const network = String(input.network || "").trim();
  if (!/^eip155:\d+$/.test(network)) fail("authorization network must look like eip155:<id>", "network");
  const asset = normalizeHexAddress(input.asset, "asset");
  const recipient = normalizeHexAddress(input.recipient, "recipient");
  const amountCapAtomic = String(input.amountCapAtomic ?? "").trim();
  if (!/^\d+$/.test(amountCapAtomic) || BigInt(amountCapAtomic) <= 0n) {
    fail("amount cap must be a positive integer string", "amountCapAtomic");
  }
  if (typeof input.assetName !== "string" || !input.assetName) fail("assetName required", "assetName");
  if (typeof input.assetVersion !== "string" || !input.assetVersion) fail("assetVersion required", "assetVersion");
  if (!Number.isSafeInteger(input.maxTimeoutSeconds) || input.maxTimeoutSeconds < 1 || input.maxTimeoutSeconds > 300) {
    fail("maxTimeoutSeconds must be an integer from 1 to 300", "maxTimeoutSeconds");
  }

  const requiredOutput = input.requiredOutput || DEFAULT_LOCKFILE_REQUIRED_OUTPUT;
  if (requiredOutput.mediaType !== "application/json") fail("requiredOutput.mediaType must be application/json");

  return Object.freeze({
    method: "POST",
    url: url.toString(),
    origin: url.origin,
    path: url.pathname,
    query: "",
    bodyRaw,
    bodyDigest: bodyDigestFor(bodyRaw),
    bodyBytes: Buffer.byteLength(bodyRaw),
    batch: null,
    lockfile: true,
    network,
    asset,
    recipient,
    amountCapAtomic,
    assetName: input.assetName,
    assetVersion: input.assetVersion,
    maxTimeoutSeconds: input.maxTimeoutSeconds,
    requiredOutput: Object.freeze({
      mediaType: "application/json",
      requiredFields: Object.freeze([...requiredOutput.requiredFields]),
      maxResponseBytes: requiredOutput.maxResponseBytes ?? 160 * 1024,
    }),
  });
}
