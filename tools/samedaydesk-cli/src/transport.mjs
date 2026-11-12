// Bounded transport over the existing machine-gateway client request()
// (server/vendor/machine-gateway/bin/client-io.mjs). client-io owns the caps:
// no redirect, timeout, JSON content type, 512 KiB body. This module only
// classifies failures, adds bounded GET retry and wires cancellation. POST is
// never retried.
//
// It works with two client-io versions:
// - pinned (samedaydesk@32437117): throws Error("gateway_http_<status>") with
//   no body, code or recovery, and takes no AbortSignal.
// - repaired (draft PR #398 @7f270b23): throws GatewayRequestError with
//   code (server code passthrough), serverCode, status and recovery, and
//   accepts signal.
// Fields on the error are always preferred. The response observation below
// runs only for a client-io without structured errors, so a server code is
// never hidden.
import * as pinnedClientIo from "../../../server/vendor/machine-gateway/bin/client-io.mjs";
import { CliError } from "./errors.mjs";

export const RETRY = Object.freeze({ attempts: 3, baseDelayMs: 200, maxDelayMs: 2000 });
export const SERVER_BODY_MAX_BYTES = 16384;
export const RECOVERY_VALUES = Object.freeze(["not_sent", "sent_unconfirmed", "remote_refused", "remote_committed", "remote_cancelled"]);
const SERVER_CODE_RE = /^[a-z][a-z0-9_]{0,63}$/;

// Server refusal codes the CLI types directly. Any other server code is still
// surfaced in evidence.server.code.
const TYPED_SERVER_CODES = new Set(["cursor_refused", "cursor_malformed", "cursor_unrecognized"]);

export function capabilitiesOf(clientIo) {
  const structured = Array.isArray(clientIo?.RECOVERY) && typeof clientIo?.GatewayRequestError === "function";
  return Object.freeze({ version: structured ? "repaired" : "pinned", structuredErrors: structured, abortSignal: structured });
}

function byStatus(status, evidence) {
  if (status >= 200 && status < 300) return new CliError("response_invalid", evidence);
  if (status === 401 || status === 403) return new CliError("unauthorized", evidence);
  if (status === 404) return new CliError("not_found", evidence);
  if (status === 409) return new CliError("conflict", evidence);
  if (status === 429) return new CliError("rate_limited", evidence);
  if (status >= 500) return new CliError("unavailable", evidence);
  if (status >= 300 && status < 400) return new CliError("origin_refused", evidence);
  return new CliError("http_refused", evidence);
}

// Repaired client-io: use the error's own fields.
const STRUCTURED_CODES = {
  request_timeout: "request_timeout",
  request_aborted: "cancelled",
  transport_failed: "transport_failed",
  response_interrupted: "response_interrupted",
  gateway_response_too_large: "response_oversize",
  gateway_response_invalid: "response_invalid",
  recovery_record_unsaved: "recovery_record_failed",
};

export function classifyStructured(error) {
  const status = Number.isInteger(error.status) ? error.status : null;
  const serverCode = typeof error.serverCode === "string" && SERVER_CODE_RE.test(error.serverCode) ? error.serverCode : null;
  const recovery = RECOVERY_VALUES.includes(error.recovery) ? error.recovery : null;
  const evidence = {
    ...(status !== null ? { httpStatus: status } : {}),
    clientIo: "repaired",
    recovery, recoverySource: recovery ? "client-io" : null,
    ...(serverCode ? { server: { code: serverCode, body: null, source: "client-io" } } : {}),
    ...(typeof error.code === "string" && SERVER_CODE_RE.test(error.code) ? { clientIoCode: error.code } : {}),
  };
  if (serverCode && TYPED_SERVER_CODES.has(serverCode)) return new CliError(serverCode, evidence);
  if (Object.hasOwn(STRUCTURED_CODES, error.code)) return new CliError(STRUCTURED_CODES[error.code], evidence);
  if (status !== null) return byStatus(status, evidence);
  return new CliError("transport_failed", evidence);
}

// Pinned client-io: classify by message, infer recovery, and use the observed body.
export function classifyPinned(error, server = null) {
  if (error instanceof CliError) return error;
  const message = typeof error?.message === "string" ? error.message : "";
  const http = /^gateway_http_(\d{3})$/.exec(message);
  const base = { clientIo: "pinned", recoverySource: "cli-inferred", ...(server ? { server: { ...server, source: "observed-response" } } : {}) };
  if (http) {
    const status = Number(http[1]);
    const evidence = { httpStatus: status, ...base, recovery: status >= 500 || status < 400 ? "sent_unconfirmed" : "remote_refused" };
    if (server?.code && TYPED_SERVER_CODES.has(server.code) && status >= 400 && status < 500) return new CliError(server.code, evidence);
    return byStatus(status, evidence);
  }
  if (message === "gateway_response_too_large") return new CliError("response_oversize", { ...base, recovery: "sent_unconfirmed" });
  if (error?.name === "TimeoutError") return new CliError("request_timeout", { ...base, recovery: "sent_unconfirmed" });
  if (error?.name === "AbortError") return new CliError("cancelled", { ...base, recovery: "sent_unconfirmed" });
  if (error instanceof SyntaxError) return new CliError("response_invalid", { ...base, recovery: "remote_committed" });
  return new CliError("transport_failed", { ...base, recovery: "sent_unconfirmed" });
}

// Backward-compatible name used by existing callers and tests.
export const classify = error => classifyPinned(error);

async function readServerRefusal(response) {
  if (!response?.body) return null;
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > SERVER_BODY_MAX_BYTES) { await reader.cancel(); return { code: null, body: null, truncated: true }; }
      chunks.push(Buffer.from(next.value));
    }
  } catch { return null; } finally { try { reader.releaseLock(); } catch {} }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return { code: null, body: null, truncated: false }; }
  const candidate = body?.error?.code ?? body?.code ?? body?.error;
  const code = typeof candidate === "string" && SERVER_CODE_RE.test(candidate) ? candidate : null;
  return { code, body, truncated: false };
}

// Pinned fallback only: observe the same Response for one request() call and
// keep a clone of a non-2xx JSON answer. No second request.
async function observed(run) {
  const original = globalThis.fetch;
  let refusal = null;
  globalThis.fetch = async (...args) => {
    const response = await original(...args);
    if (!response.ok && response.headers.get("content-type")?.includes("application/json")) refusal = response.clone();
    return response;
  };
  try {
    return { value: await run(), refusal: null };
  } catch (error) {
    return { error, refusal };
  } finally {
    globalThis.fetch = original;
  }
}

// Pinned client-io takes no signal: race it so the CLI can stop waiting. The
// request may still complete remotely, so recovery is sent_unconfirmed.
function raceAbort(promise, signal) {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const onAbort = () => { const error = new Error("aborted"); error.name = "AbortError"; reject(error); };
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

const RETRYABLE = new Set(["transport_failed", "request_timeout", "response_invalid", "unavailable", "rate_limited"]);

export function createTransport(clientIo = pinnedClientIo, { timeoutMs } = {}) {
  const caps = capabilitiesOf(clientIo);
  async function attempt(base, path, body, signal) {
    const options = body === undefined ? {} : { body };
    if (caps.structuredErrors) {
      try { return { value: await clientIo.request(base, path, { ...options, ...(signal ? { signal } : {}), ...(timeoutMs ? { timeoutMs } : {}) }) }; }
      catch (error) { return { error: error instanceof clientIo.GatewayRequestError ? classifyStructured(error) : classifyPinned(error) }; }
    }
    const outcome = await observed(() => raceAbort(clientIo.request(base, path, options), signal));
    if (!outcome.error) return { value: outcome.value };
    const server = outcome.refusal ? await readServerRefusal(outcome.refusal) : null;
    return { error: classifyPinned(outcome.error, server) };
  }
  async function call(base, path, { body, sleep = defaultSleep, retry = RETRY, signal } = {}) {
    const method = body === undefined ? "GET" : "POST";
    const attempts = method === "GET" ? retry.attempts : 1;
    if (signal?.aborted) throw new CliError("cancelled", { method, attempts: 0, recovery: "not_sent", recoverySource: "cli", clientIo: caps.version });
    let last;
    for (let index = 1; index <= attempts; index += 1) {
      const result = await attempt(base, path, body, signal);
      if (!result.error) return { value: result.value, attempts: index };
      last = result.error;
      last.evidence = { ...(last.evidence || {}), method, attempts: index, abortSupported: caps.abortSignal };
      if (!RETRYABLE.has(last.code) || index === attempts || signal?.aborted) break;
      await sleep(Math.min(retry.maxDelayMs, retry.baseDelayMs * 2 ** (index - 1)));
    }
    throw last;
  }
  return Object.freeze({ call, capabilities: caps });
}

const defaultTransport = createTransport();
export const call = defaultTransport.call;
export const CLIENT_IO = defaultTransport.capabilities;

function defaultSleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
