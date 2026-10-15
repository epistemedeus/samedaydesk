// Bounded public fetch for generators. Every hop:
//   1. resolves through the shared guard (ssrf.js resolvePublicAddresses, 4s DNS bound),
//   2. connects through probe.js rawExchange pinned to the admitted address
//      (Host header, TLS servername and default certificate validation preserved),
//   3. disposes of redirect bodies before following Location,
//   4. draws from one shared total budget (DNS + redirects + bodies).
import dns from "node:dns/promises";
import { PublicHostError, assertPublicUrl } from "./ssrf.js";
import { rawExchange } from "./probe.js";

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

/** One total budget shared by every request of a generation. Call dispose() when done. */
export function createRequestBudget(totalMs) {
  const ctrl = new AbortController();
  const deadline = Date.now() + totalMs;
  const timer = setTimeout(() => ctrl.abort(), totalMs);
  if (typeof timer.unref === "function") timer.unref();
  return {
    totalMs,
    signal: ctrl.signal,
    remaining: () => Math.max(0, deadline - Date.now()),
    get exhausted() { return ctrl.signal.aborted || Date.now() >= deadline; },
    dispose() { clearTimeout(timer); if (!ctrl.signal.aborted) ctrl.abort(); },
  };
}

// Test seam: the transport is rawExchange (pinned). Tests may install another
// exchange with the same contract; production never changes it.
let transport = rawExchange;
export function setTransportForTests(fn) { transport = fn || rawExchange; }

function raceBudget(promise, budget) {
  if (!budget) return promise;
  if (budget.exhausted) return Promise.reject(new BoundedFetchError(FETCH_FAILURE.BUDGET_EXHAUSTED, "Request budget exhausted"));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new BoundedFetchError(FETCH_FAILURE.BUDGET_EXHAUSTED, "Request budget exhausted"));
    budget.signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (v) => { budget.signal.removeEventListener("abort", onAbort); resolve(v); },
      (e) => { budget.signal.removeEventListener("abort", onAbort); reject(e); },
    );
  });
}

const stripWww = (h) => String(h || "").toLowerCase().replace(/^www\./, "");

/**
 * fetchPublicBounded(url, opts) -> { ok, status, contentType, finalUrl, body, redirects, oversize }
 * opts: allowedOrigin | allowHostVariants, maxRedirects, maxBytes, timeoutMs, headers, budget, lookup
 */
export async function fetchPublicBounded(url, opts = {}) {
  const {
    allowedOrigin = null, allowHostVariants = false, maxRedirects = 3,
    maxBytes = 2_500_000, timeoutMs = 10_000, headers = {}, budget = null, lookup = dns.lookup,
  } = opts;
  let { url: current, addresses } = await raceBudget(assertPublicUrl(url, lookup), budget);
  const startHost = stripWww(current.hostname);
  const redirects = [];
  for (let hop = 0; ; hop += 1) {
    if (budget?.exhausted) throw new BoundedFetchError(FETCH_FAILURE.BUDGET_EXHAUSTED, "Request budget exhausted", { url: current.toString() });
    const hopTimeout = budget ? Math.max(1, Math.min(timeoutMs, budget.remaining())) : timeoutMs;
    const res = await transport(current, {
      address: addresses[0], maxBytes: maxBytes + 1, timeoutMs: hopTimeout, headers,
      signal: budget?.signal, discardRedirectBody: true,
    });
    if (res.error === "aborted" || (budget?.exhausted && res.status === 0)) {
      throw new BoundedFetchError(FETCH_FAILURE.BUDGET_EXHAUSTED, "Request budget exhausted", { url: current.toString() });
    }
    if (res.status === 0) throw new BoundedFetchError(FETCH_FAILURE.CONNECTION, `Fetch failed (${res.error || "connection"})`, { url: current.toString() });
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
      ({ url: next, addresses } = await raceBudget(assertPublicUrl(next, lookup), budget));
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
}

export { PublicHostError };
