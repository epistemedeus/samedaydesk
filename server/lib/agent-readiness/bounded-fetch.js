// Bounded public fetch for generators. Every hop:
//   1. resolves through the shared guard (ssrf.js resolvePublicAddresses, 4s DNS bound),
//   2. connects through probe.js rawExchange pinned to the admitted address
//      (Host header, TLS servername and default certificate validation preserved),
//   3. disposes of redirect bodies before following Location,
//   4. draws from one shared total budget (DNS + redirects + bodies).
import { PublicHostError, assertPublicUrl } from "./ssrf.js";
import { rawExchange } from "./probe.js";
import { createRequestBudget } from "./request-budget.js";
export { createRequestBudget } from "./request-budget.js";

export const FETCH_FAILURE = Object.freeze({
  OFF_ORIGIN_REDIRECT: "off_origin_redirect",
  TOO_MANY_REDIRECTS: "too_many_redirects",
  BAD_REDIRECT: "bad_redirect",
  BUDGET_EXHAUSTED: "budget_exhausted",
  CONNECTION: "connection_failed",
});

export class BoundedFetchError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "BoundedFetchError";
    this.code = code;
    this.status = 502;
    Object.assign(this, detail);
  }
}

// Test seam: the transport is rawExchange (pinned). Tests may install another
// exchange with the same contract; production never changes it.
let transport = rawExchange;
export function setTransportForTests(fn) { transport = fn || rawExchange; }

const stripWww = (h) => String(h || "").toLowerCase().replace(/^www\./, "");

/**
 * fetchPublicBounded(url, opts) -> { ok, status, contentType, finalUrl, body, redirects, oversize }
 * opts: allowedOrigin | allowHostVariants, maxRedirects, maxBytes, timeoutMs, headers, budget, lookup
 */
export async function fetchPublicBounded(url, opts = {}) {
  const {
    allowedOrigin = null, allowHostVariants = false, maxRedirects = 3,
    maxBytes = 2_500_000, timeoutMs = 10_000, headers = {}, budget = null, lookup,
  } = opts;
  if (budget?.exhausted || opts.signal?.aborted) throw new BoundedFetchError(FETCH_FAILURE.BUDGET_EXHAUSTED, "Request budget exhausted");
  const parentSignal = budget && opts.signal ? AbortSignal.any([budget.signal, opts.signal]) : budget?.signal || opts.signal;
  const lifetime = createRequestBudget(timeoutMs, parentSignal);
  const redirects = [];
  try {
    let { url: current, addresses } = await assertPublicUrl(url, lookup, { signal: lifetime.signal });
    const startHost = stripWww(current.hostname);
    for (let hop = 0; ; hop += 1) {
      if (budget?.exhausted) throw new BoundedFetchError(FETCH_FAILURE.BUDGET_EXHAUSTED, "Request budget exhausted", { url: current.toString() });
      const hopTimeout = Math.max(1, lifetime.remaining());
      const res = await transport(current, {
        address: addresses[0], maxBytes: maxBytes + 1, timeoutMs: hopTimeout, headers,
        signal: lifetime.signal, discardRedirectBody: true,
      });
      if (budget?.exhausted) {
        throw new BoundedFetchError(FETCH_FAILURE.BUDGET_EXHAUSTED, "Request budget exhausted", { url: current.toString() });
      }
      if (res.error || res.status === 0 || lifetime.exhausted) throw new BoundedFetchError(FETCH_FAILURE.CONNECTION, `Fetch failed (${res.error || "connection"})`, { url: current.toString() });
      const location = res.headers?.location;
      if (res.status >= 300 && res.status < 400 && location) {
        if (hop >= maxRedirects) throw new BoundedFetchError(FETCH_FAILURE.TOO_MANY_REDIRECTS, "Too many redirects", { url: current.toString(), redirects });
        let next;
        try { next = new URL(location, current); }
        catch { throw new BoundedFetchError(FETCH_FAILURE.BAD_REDIRECT, "Invalid redirect", { url: current.toString() }); }
        const allowed = allowedOrigin
          ? next.origin === allowedOrigin
          : next.hostname === current.hostname || (allowHostVariants && stripWww(next.hostname) === startHost);
        if (!allowed) {
          throw new BoundedFetchError(FETCH_FAILURE.OFF_ORIGIN_REDIRECT, "Redirect left the site origin", { url: current.toString(), location: next.toString(), redirects });
        }
        ({ url: next, addresses } = await assertPublicUrl(next, lookup, { signal: lifetime.signal }));
        redirects.push(next.toString());
        current = next;
        continue;
      }
      const body = String(res.body || "");
      const oversize = Boolean(res.truncated) || Buffer.byteLength(body) > maxBytes;
      return {
        ok: res.status >= 200 && res.status < 300,
        status: res.status,
        contentType: String(res.headers?.["content-type"] || ""),
        finalUrl: current.toString(),
        body: oversize ? Buffer.from(body).subarray(0, maxBytes).toString("utf8") : body,
        redirects,
        oversize,
      };
    }
  } catch (err) {
    if (budget?.exhausted || opts.signal?.aborted) throw new BoundedFetchError(FETCH_FAILURE.BUDGET_EXHAUSTED, "Request budget exhausted");
    if (lifetime.exhausted) throw new BoundedFetchError(FETCH_FAILURE.CONNECTION, "Request deadline exceeded");
    throw err;
  } finally { lifetime.dispose(); }
}

export { PublicHostError };
