/**
 * Bounded GET of the fixed MoltJobs /v1/stats URL.
 *
 * Not a URL proxy. Callers cannot override the upstream. Request
 * Authorization, Cookie, and API keys are never forwarded.
 */

import { MOLTJOBS_STATS_SOURCE_URL } from "./moltjobs-stats-adapter.js";

export const FIXED_UPSTREAM_URL = MOLTJOBS_STATS_SOURCE_URL;
export const DEFAULT_TIMEOUT_MS = 8000;
export const MAX_RESPONSE_BYTES = 65536;
export const CACHE_TTL_MS = 30000;

const FORBIDDEN_FORWARD_HEADERS = new Set([
  "authorization",
  "cookie",
  "cookie2",
  "proxy-authorization",
  "x-api-key",
  "api-key",
]);

export function createUpstreamFetcher(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const nowMs = typeof options.now === "function" ? options.now : () => Date.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_RESPONSE_BYTES;
  const ttlMs = options.cacheTtlMs ?? CACHE_TTL_MS;

  let cacheEntry = null;
  let inFlight = null;

  function clockMs() {
    const value = nowMs();
    return typeof value === "number" && Number.isFinite(value) ? value : Date.now();
  }

  function clockIso(ms) {
    return new Date(ms).toISOString();
  }

  function cacheMeta(entry, hit, atMs) {
    const fetchedAtMs = entry ? entry.fetchedAtMs : null;
    const ageMs = entry && fetchedAtMs != null ? Math.max(0, atMs - fetchedAtMs) : null;
    return {
      hit: Boolean(hit),
      ageMs,
      stale: ageMs != null && ageMs > ttlMs,
      fetchedAt: entry ? entry.fetchedAt : null,
      ttlMs,
    };
  }

  async function fetchOnce() {
    const fetchedAtMs = clockMs();
    const fetchedAt = clockIso(fetchedAtMs);
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    if (typeof timer.unref === "function") timer.unref();

    const init = {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "manual",
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
    };
    assertNoForwardedSecrets(init.headers);

    try {
      const response = await fetchImpl(FIXED_UPSTREAM_URL, init);
      const httpStatus = Number.isInteger(response.status) ? response.status : null;

      if (isRedirectStatus(httpStatus)) {
        await response.body?.cancel?.().catch(() => {});
        const location = headerGet(response.headers, "location");
        return {
          fetchedAt,
          fetchedAtMs,
          sourceUrl: FIXED_UPSTREAM_URL,
          httpStatus,
          body: null,
          rawText: null,
          rawProviderBody: null,
          bytes: null,
          error: {
            code: "redirect_not_followed",
            kind: "redirect",
            message: "upstream redirect was not followed",
            location: location || null,
          },
        };
      }

      const bounded = await readBoundedBody(response, maxBytes);
      if (bounded.oversized) {
        return {
          fetchedAt,
          fetchedAtMs,
          sourceUrl: FIXED_UPSTREAM_URL,
          httpStatus,
          body: null,
          rawText: null,
          rawProviderBody: null,
          bytes: bounded.bytes,
          error: {
            code: "oversized_body",
            kind: "oversized",
            message: `upstream body exceeds ${maxBytes} bytes`,
            maxBytes,
          },
        };
      }

      const rawText = bounded.text;
      const parsed = parseJsonBody(rawText);
      return {
        fetchedAt,
        fetchedAtMs,
        sourceUrl: FIXED_UPSTREAM_URL,
        httpStatus,
        body: parsed.ok ? parsed.value : rawText,
        rawText,
        rawProviderBody: parsed.ok ? parsed.value : rawText,
        bytes: bounded.bytes,
        error: parsed.ok
          ? null
          : {
              code: "malformed_json",
              kind: "parse",
              message: parsed.message || "upstream body is not JSON",
            },
      };
    } catch (error) {
      const classified = classifyFetchError(error, { timedOut, timeoutMs });
      return {
        fetchedAt,
        fetchedAtMs,
        sourceUrl: FIXED_UPSTREAM_URL,
        httpStatus: null,
        body: null,
        rawText: null,
        rawProviderBody: null,
        bytes: null,
        error: classified,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async function getCapture() {
    const atMs = clockMs();
    if (cacheEntry && atMs - cacheEntry.fetchedAtMs < ttlMs) {
      return { ...cacheEntry, cache: cacheMeta(cacheEntry, true, atMs) };
    }
    if (!inFlight) {
      inFlight = fetchOnce()
        .then((capture) => {
          cacheEntry = capture;
          return capture;
        })
        .finally(() => {
          inFlight = null;
        });
    }
    const capture = await inFlight;
    const doneMs = clockMs();
    return { ...capture, cache: cacheMeta(capture, false, doneMs) };
  }

  return {
    getCapture,
    reset() {
      cacheEntry = null;
      inFlight = null;
    },
  };
}

export function assertNoForwardedSecrets(headers) {
  if (!headers) return;
  const entries = headerEntries(headers);
  for (const [name, value] of entries) {
    if (FORBIDDEN_FORWARD_HEADERS.has(String(name).toLowerCase()) && value) {
      throw new Error(`refusing to forward ${name} to upstream`);
    }
  }
}

function isRedirectStatus(status) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function classifyFetchError(error, { timedOut, timeoutMs }) {
  const name = error && error.name ? String(error.name) : "";
  const message = String((error && error.message) || error || "upstream failed");
  if (timedOut || name === "TimeoutError" || (name === "AbortError" && timedOut)) {
    return {
      code: "timeout",
      kind: "timeout",
      message: `aborted after ${timeoutMs}ms`,
    };
  }
  if (name === "AbortError") {
    return { code: "aborted", kind: "network", message: message || "aborted" };
  }
  return { code: "network", kind: "network", message };
}

function parseJsonBody(text) {
  if (text == null) return { ok: false, value: null, message: "empty body" };
  const trimmed = String(text).trim();
  if (trimmed === "") return { ok: false, value: null, message: "empty body" };
  try {
    return { ok: true, value: JSON.parse(trimmed), message: null };
  } catch (error) {
    return { ok: false, value: null, message: error && error.message ? error.message : "invalid JSON" };
  }
}

async function readBoundedBody(response, maxBytes) {
  const declared = headerGet(response.headers, "content-length");
  if (declared != null && declared !== "") {
    const n = Number(declared);
    if (Number.isFinite(n) && n > maxBytes) {
      await cancelBody(response);
      return { oversized: true, bytes: n, text: null };
    }
  }

  if (!response.body || typeof response.body.getReader !== "function") {
    if (typeof response.arrayBuffer === "function") {
      const buf = Buffer.from(await response.arrayBuffer());
      if (buf.byteLength > maxBytes) return { oversized: true, bytes: buf.byteLength, text: null };
      return { oversized: false, bytes: buf.byteLength, text: buf.toString("utf8") };
    }
    const text = typeof response.text === "function" ? await response.text() : "";
    const bytes = Buffer.byteLength(text, "utf8");
    if (bytes > maxBytes) return { oversized: true, bytes, text: null };
    return { oversized: false, bytes, text };
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
    total += chunk.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // ignore cancel races after an oversized abort
      }
      return { oversized: true, bytes: total, text: null };
    }
    chunks.push(chunk);
  }
  const buf = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  return { oversized: false, bytes: buf.byteLength, text: buf.toString("utf8") };
}

async function cancelBody(response) {
  try {
    if (response.body && typeof response.body.cancel === "function") await response.body.cancel();
  } catch {
    // ignore
  }
}

function headerGet(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === "function") return headers.get(name);
  const want = String(name).toLowerCase();
  for (const [key, value] of headerEntries(headers)) {
    if (String(key).toLowerCase() === want) return value;
  }
  return null;
}

function headerEntries(headers) {
  if (!headers) return [];
  if (typeof headers.entries === "function") return [...headers.entries()];
  if (Array.isArray(headers)) return headers;
  return Object.entries(headers);
}
