import { ERROR_CODE, OUTCOME } from "./constants.mjs";
import { fail } from "./errors.mjs";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function assertLoopbackBaseUrl(raw) {
  if (!raw || typeof raw !== "string") {
    fail(ERROR_CODE.NOT_CONFIGURED, "--base-url is required");
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail(ERROR_CODE.LOOPBACK_ONLY, "base URL must be a loopback http URL for this prototype");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    fail(ERROR_CODE.LOOPBACK_ONLY, "base URL protocol must be http or https");
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    fail(
      ERROR_CODE.LOOPBACK_ONLY,
      "this pack talks only to a loopback fixture/runtime (127.0.0.1). Not a hosted exchange.",
    );
  }
  if (url.username || url.password) {
    fail(ERROR_CODE.LOOPBACK_ONLY, "base URL must not contain userinfo");
  }
  return url.origin;
}

export function isJsonObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function classifyHttpSuccess({ status, text, parsed, requireObject = true }) {
  if (text == null || String(text).trim() === "") {
    fail(
      ERROR_CODE.UNKNOWN_OUTCOME,
      `HTTP ${status} with an empty body is unknown, not success. Do not treat it as a grant or claim.`,
      { status, outcome: OUTCOME.UNKNOWN },
    );
  }
  if (requireObject && !isJsonObject(parsed)) {
    fail(
      ERROR_CODE.UNKNOWN_OUTCOME,
      `HTTP ${status} body is not a JSON object; outcome unknown, not success`,
      { status, outcome: OUTCOME.UNKNOWN },
    );
  }
  return parsed;
}

export async function requestJson({
  baseUrl,
  method,
  path,
  token,
  idempotencyKey,
  forbidIdempotencyKey = false,
  body,
  fetchImpl = fetch,
  success = [200, 201],
  requireObject = true,
  timeoutMs = 15_000,
}) {
  const origin = assertLoopbackBaseUrl(baseUrl);
  if (forbidIdempotencyKey && idempotencyKey) {
    fail(
      ERROR_CODE.GRANT_IDEMPOTENCY_HEADER_FORBIDDEN,
      "grant creation has no idempotency key; do not send Idempotency-Key. Reconcile the attempt directory instead of retrying.",
    );
  }
  const headers = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  if (idempotencyKey && !forbidIdempotencyKey) headers["idempotency-key"] = idempotencyKey;

  let response;
  let text;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    response = await fetchImpl(`${origin}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
      signal: controller.signal,
    });
    text = await response.text();
  } catch {
    fail(
      ERROR_CODE.UNKNOWN_OUTCOME,
      "Grant or HTTP outcome unknown. Grant creation has no idempotency key; do not automatically retry. Reconcile the attempt directory first.",
      { status: response?.status, outcome: OUTCOME.UNKNOWN },
    );
  } finally {
    clearTimeout(timer);
  }

  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (response.status >= 300 && response.status < 400) {
    fail(
      ERROR_CODE.UNKNOWN_OUTCOME,
      `HTTP ${response.status} redirect after dispatch is unknown, not success or refusal. Do not automatically retry a non-idempotent grant.`,
      { status: response.status, outcome: OUTCOME.UNKNOWN },
    );
  }

  if (success.includes(response.status)) {
    const objectBody = classifyHttpSuccess({
      status: response.status,
      text,
      parsed,
      requireObject,
    });
    return { status: response.status, body: objectBody, text, outcome: OUTCOME.SUCCESS };
  }

  if (response.status < 400 || response.status >= 500) {
    fail(
      ERROR_CODE.UNKNOWN_OUTCOME,
      `HTTP ${response.status} after dispatch is unknown; the write may have committed. Do not automatically retry a non-idempotent grant.`,
      { status: response.status, outcome: OUTCOME.UNKNOWN },
    );
  }

  const code = parsed?.error?.code || ERROR_CODE.HTTP_ERROR;
  const message = parsed?.error?.message || `HTTP ${response.status} ${path}`;
  const err = new Error(message);
  err.code = code;
  err.status = response.status;
  err.body = parsed;
  err.outcome = OUTCOME.REFUSED;
  throw err;
}

export { requestJson as json };
