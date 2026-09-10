/**
 * Bounded GET of a fixed https upstream.
 *
 * Not a URL proxy. Callers cannot supply an arbitrary URL through this
 * module's public router path; adapters pass a registry-fixed URL.
 * Authorization, Cookie, and API keys are never forwarded.
 */

export const USER_AGENT = "SameDayDeskObservatory/0.1";
export const DEFAULT_TIMEOUT_MS = 8000;
export const MAX_RESPONSE_BYTES = 256 * 1024;
export const CACHE_TTL_MS = 30000;
export const MAX_REDIRECTS = 3;

const FORBIDDEN_FORWARD_HEADERS = new Set([
  "authorization",
  "cookie",
  "cookie2",
  "proxy-authorization",
  "x-api-key",
  "api-key",
]);

export function createBoundedFetcher(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const nowMs = typeof options.now === "function" ? options.now : () => Date.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_RESPONSE_BYTES;
  const ttlMs = options.cacheTtlMs ?? CACHE_TTL_MS;

  const cache = new Map();
  const inFlight = new Map();

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

  function emptyCapture(extra) {
    return {
      fetchedAt: extra.fetchedAt,
      fetchedAtMs: extra.fetchedAtMs,
      sourceId: extra.sourceId,
      sourceUrl: extra.sourceUrl,
      httpStatus: extra.httpStatus ?? null,
      body: null,
      rawText: null,
      bytes: extra.bytes ?? null,
      headers: extra.headers ?? { lastModified: null, retryAfter: null, contentType: null },
      error: extra.error ?? null,
    };
  }

  async function fetchOnce(sourceId, url) {
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
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      redirect: "manual",
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
    };
    assertNoForwardedSecrets(init.headers);

    try {
      const httpsCheck = assertHttpsUrl(url);
      if (!httpsCheck.ok) {
        return emptyCapture({
          fetchedAt,
          fetchedAtMs,
          sourceId,
          sourceUrl: url,
          error: { code: "invalid_url", kind: "error", message: httpsCheck.message },
        });
      }

      let currentUrl = httpsCheck.url;
      for (let hops = 0; ; hops += 1) {
        const response = await fetchImpl(currentUrl, init);
        const httpStatus = Number.isInteger(response.status) ? response.status : null;
        const headers = snapshotHeaders(response.headers);

        if (isRedirectStatus(httpStatus)) {
          await cancelBody(response);
          const location = headers.location;
          const resolved = resolveRedirect(currentUrl, location);
          if (!resolved.ok) {
            return emptyCapture({
              fetchedAt,
              fetchedAtMs,
              sourceId,
              sourceUrl: url,
              httpStatus,
              headers,
              error: {
                code: resolved.code,
                kind: "redirect",
                message: resolved.message,
                location: resolved.location ?? location ?? null,
              },
            });
          }
          if (hops >= MAX_REDIRECTS) {
            return emptyCapture({
              fetchedAt,
              fetchedAtMs,
              sourceId,
              sourceUrl: url,
              httpStatus,
              headers,
              error: {
                code: "redirect_limit",
                kind: "redirect",
                message: `exceeded ${MAX_REDIRECTS} same-host redirects`,
                location: resolved.url,
              },
            });
          }
          currentUrl = resolved.url;
          continue;
        }

        if (httpStatus === 429) {
          await cancelBody(response);
          return emptyCapture({
            fetchedAt,
            fetchedAtMs,
            sourceId,
            sourceUrl: url,
            httpStatus,
            headers,
            error: {
              code: "rate_limited",
              kind: "unavailable",
              message: "upstream returned 429",
              retryAfter: headers.retryAfter,
            },
          });
        }

        const bounded = await readBoundedBody(response, maxBytes);
        if (bounded.oversized) {
          return emptyCapture({
            fetchedAt,
            fetchedAtMs,
            sourceId,
            sourceUrl: url,
            httpStatus,
            headers,
            bytes: bounded.bytes,
            error: {
              code: "oversized_body",
              kind: "error",
              message: `upstream body exceeds ${maxBytes} bytes`,
              maxBytes,
            },
          });
        }

        const rawText = bounded.text;
        const parsed = parseJsonBody(rawText);
        return {
          fetchedAt,
          fetchedAtMs,
          sourceId,
          sourceUrl: url,
          httpStatus,
          body: parsed.ok ? parsed.value : rawText,
          rawText,
          bytes: bounded.bytes,
          headers,
          error: parsed.ok
            ? null
            : {
                code: "malformed_json",
                kind: "error",
                message: parsed.message || "upstream body is not JSON",
              },
        };
      }
    } catch (error) {
      const classified = classifyFetchError(error, { timedOut, timeoutMs });
      return emptyCapture({
        fetchedAt,
        fetchedAtMs,
        sourceId,
        sourceUrl: url,
        error: classified,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async function getCapture(sourceId, url) {
    const atMs = clockMs();
    const cached = cache.get(sourceId);
    if (cached && atMs - cached.fetchedAtMs < ttlMs) {
      return { ...cached, cache: cacheMeta(cached, true, atMs) };
    }
    let pending = inFlight.get(sourceId);
    if (!pending) {
      pending = fetchOnce(sourceId, url)
        .then((capture) => {
          cache.set(sourceId, capture);
          return capture;
        })
        .finally(() => {
          inFlight.delete(sourceId);
        });
      inFlight.set(sourceId, pending);
    }
    const capture = await pending;
    const doneMs = clockMs();
    return { ...capture, cache: cacheMeta(capture, false, doneMs) };
  }

  return {
    getCapture,
    reset() {
      cache.clear();
      inFlight.clear();
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

function assertHttpsUrl(url) {
  try {
    const parsed = new URL(String(url));
    if (parsed.protocol !== "https:") {
      return { ok: false, message: "upstream URL must be https" };
    }
    return { ok: true, url: parsed.toString() };
  } catch {
    return { ok: false, message: "upstream URL is not a valid URL" };
  }
}

function resolveRedirect(currentUrl, location) {
  if (!location) {
    return { ok: false, code: "redirect_missing_location", message: "redirect missing Location" };
  }
  let next;
  try {
    next = new URL(String(location), currentUrl);
  } catch {
    return {
      ok: false,
      code: "redirect_invalid_location",
      message: "redirect Location is not a valid URL",
      location: String(location),
    };
  }
  const current = new URL(currentUrl);
  if (next.protocol !== "https:" || next.protocol !== current.protocol || next.host !== current.host) {
    return {
      ok: false,
      code: "off_host_redirect",
      message: "upstream redirect left the fixed host",
      location: next.toString(),
    };
  }
  return { ok: true, url: next.toString() };
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

function snapshotHeaders(headers) {
  return {
    lastModified: headerGet(headers, "last-modified"),
    retryAfter: headerGet(headers, "retry-after"),
    contentType: headerGet(headers, "content-type"),
    location: headerGet(headers, "location"),
  };
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
