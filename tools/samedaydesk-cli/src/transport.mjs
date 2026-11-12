// Bounded transport over the existing machine-gateway client request()
// (server/vendor/machine-gateway/bin/client-io.mjs). That function owns the
// caps: no redirect, 15 s timeout, JSON content type, 512 KiB body. This module
// only classifies its failures and adds bounded GET retry. POST is never retried.
import { request } from "../../../server/vendor/machine-gateway/bin/client-io.mjs";
import { CliError } from "./errors.mjs";

export const RETRY = Object.freeze({ attempts: 3, baseDelayMs: 200, maxDelayMs: 2000 });

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
    try {
      const value = await request(base, path, body === undefined ? {} : { body });
      return { value, attempts: attempt };
    } catch (error) {
      last = classify(error);
      last.evidence = { ...(last.evidence || {}), method, attempts: attempt };
      if (!RETRYABLE.has(last.code) || attempt === attempts) break;
      await sleep(Math.min(retry.maxDelayMs, retry.baseDelayMs * 2 ** (attempt - 1)));
    }
  }
  throw last;
}

function defaultSleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
