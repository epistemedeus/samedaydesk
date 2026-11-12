// Bounded transport over the existing machine-gateway client request()
// (server/vendor/machine-gateway/bin/client-io.mjs). That function owns the
// caps: no redirect, 15 s timeout, JSON content type, 512 KiB body. This module
// only classifies its failures and adds bounded GET retry. POST is never retried.
import { request } from "../../../server/vendor/machine-gateway/bin/client-io.mjs";
import { CliError } from "./errors.mjs";

export const RETRY = Object.freeze({ attempts: 3, baseDelayMs: 200, maxDelayMs: 2000 });
export const SERVER_BODY_MAX_BYTES = 16384;
const SERVER_CODE_RE = /^[a-z][a-z0-9_]{0,63}$/;

// client-io.request throws gateway_http_<status> and does not read a non-2xx
// body. To keep the server's own refusal visible without changing client-io
// and without a second request, the CLI observes the same Response for the
// duration of one request() call and keeps a clone when it is a non-2xx JSON
// answer. The clone is read once, bounded, and returned as data only.
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

export async function readServerRefusal(response) {
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
  const code = typeof body?.code === "string" && SERVER_CODE_RE.test(body.code) ? body.code
    : typeof body?.error === "string" && SERVER_CODE_RE.test(body.error) ? body.error : null;
  return { code, body, truncated: false };
}

// Server refusal codes the CLI types directly. The server code is always kept
// in evidence.server, typed or not.
const TYPED_SERVER_CODES = new Set(["cursor_refused"]);

export function classify(error) {
  if (error instanceof CliError) return error;
  const message = typeof error?.message === "string" ? error.message : "";
  const http = /^gateway_http_(\d{3})$/.exec(message);
  if (http) {
    const status = Number(http[1]);
    const evidence = { httpStatus: status };
    if (status >= 200 && status < 300) return new CliError("response_invalid", evidence);
    if (status === 401 || status === 403) return new CliError("unauthorized", evidence);
    if (status === 404) return new CliError("not_found", evidence);
    if (status === 409) return new CliError("conflict", evidence);
    if (status === 429) return new CliError("rate_limited", evidence);
    if (status >= 500) return new CliError("unavailable", evidence);
    if (status >= 300 && status < 400) return new CliError("origin_refused", evidence);
    return new CliError("http_refused", evidence);
  }
  if (message === "gateway_response_too_large") return new CliError("response_oversize");
  if (error?.name === "TimeoutError" || error?.name === "AbortError") return new CliError("timeout");
  if (error instanceof SyntaxError) return new CliError("response_invalid");
  return new CliError("transport_failed");
}

const RETRYABLE = new Set(["transport_failed", "timeout", "response_invalid", "unavailable", "rate_limited"]);

export async function call(base, path, { body, sleep = defaultSleep, retry = RETRY } = {}) {
  const method = body === undefined ? "GET" : "POST";
  const attempts = method === "GET" ? retry.attempts : 1;
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const outcome = await observed(() => request(base, path, body === undefined ? {} : { body }));
    if (!outcome.error) return { value: outcome.value, attempts: attempt };
    {
      const server = outcome.refusal ? await readServerRefusal(outcome.refusal) : null;
      last = classify(outcome.error);
      if (server?.code && TYPED_SERVER_CODES.has(server.code) && last.code === "http_refused") last = new CliError(server.code, last.evidence);
      last.evidence = { ...(last.evidence || {}), method, attempts: attempt, ...(server ? { server } : {}) };
      if (!RETRYABLE.has(last.code) || attempt === attempts) break;
      await sleep(Math.min(retry.maxDelayMs, retry.baseDelayMs * 2 ** (attempt - 1)));
    }
  }
  throw last;
}

function defaultSleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
