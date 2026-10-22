/**
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 SameDayDesk / Neomorphic LLC
 *
 * Bounded browser GET of SameDayDesk observatory named-source routes.
 * One shot per call. No interval. No background poll. No arbitrary URL proxy.
 * Paid-activity drilldown is reconstructed from this snapshot body; no extra GET.
 */
import { DEFAULT_BRIDGE_BASE, observatoryUrls, resolveBridgeBase } from "./contract.js";

export const DEFAULT_TIMEOUT_MS = 8000;
export const MAX_BODY_CHARS = 256 * 1024;
export const FAILURE_KINDS = Object.freeze([
  "cors",
  "network",
  "http",
  "parse",
  "timeout",
  "csp",
  "refused",
]);

export async function fetchObservatoryBoard({
  bridgeBase = DEFAULT_BRIDGE_BASE,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl,
  now,
  signal,
  cspViolations,
} = {}) {
  const urls = observatoryUrls(bridgeBase);
  const [snapshotResult, sourcesResult] = await Promise.all([
    fetchObservatoryJson({
      url: urls.snapshot,
      bridgeBase: urls.base,
      timeoutMs,
      fetchImpl,
      now,
      signal,
      cspViolations,
    }),
    fetchObservatoryJson({
      url: urls.sources,
      bridgeBase: urls.base,
      timeoutMs,
      fetchImpl,
      now,
      signal,
      cspViolations,
    }),
  ]);
  return { urls, snapshotResult, sourcesResult };
}

export async function fetchObservatoryJson({
  url,
  bridgeBase = DEFAULT_BRIDGE_BASE,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl,
  now,
  signal,
  cspViolations,
} = {}) {
  const fetchFn = fetchImpl || globalThis.fetch;
  if (typeof fetchFn !== "function") {
    throw new Error("fetch is not available");
  }
  const fetchedAt = typeof now === "function" ? now() : new Date().toISOString();
  const allowed = assertObservatoryUrl(url, bridgeBase);
  if (!allowed.ok) {
    const receipt = baseReceipt({ url, fetchedAt, timeoutMs });
    receipt.failureKind = "refused";
    receipt.finishedAt = fetchedAt;
    return fail(receipt, { kind: "refused", message: allowed.message });
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  const receipt = baseReceipt({ url, fetchedAt, timeoutMs });

  try {
    const response = await fetchFn(url, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    receipt.httpStatus = response.status;
    receipt.finishedAt = typeof now === "function" ? now() : new Date().toISOString();
    const allowOrigin =
      response.headers && typeof response.headers.get === "function"
        ? response.headers.get("access-control-allow-origin")
        : null;
    receipt.cors.allowOriginSeen = allowOrigin;
    const text = await readBoundedText(response);
    receipt.bytes = new TextEncoder().encode(text).byteLength;
    if (text.length > MAX_BODY_CHARS) {
      receipt.failureKind = "parse";
      return fail(receipt, {
        kind: "parse",
        message: `body exceeds ${MAX_BODY_CHARS} characters`,
      });
    }
    if (response.status !== 200) {
      receipt.failureKind = "http";
      return fail(receipt, {
        kind: "http",
        message: `HTTP ${response.status}`,
        httpStatus: response.status,
      });
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch (error) {
      receipt.failureKind = "parse";
      return fail(receipt, { kind: "parse", message: error.message || "invalid JSON" });
    }
    return { ok: true, receipt, body: json, error: null };
  } catch (error) {
    receipt.finishedAt = typeof now === "function" ? now() : new Date().toISOString();
    const classified = classifyFetchFailure(error, {
      url,
      timeoutMs,
      timedOut,
      cspViolations: cspViolations || [],
    });
    receipt.failureKind = classified.kind;
    return fail(receipt, classified);
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onExternalAbort);
  }
}

export function assertObservatoryUrl(url, bridgeBase) {
  if (typeof url !== "string" || !url) {
    return { ok: false, message: "missing observatory URL" };
  }
  let resolved;
  let root;
  try {
    resolved = new URL(url);
    root = new URL(resolveBridgeBase(bridgeBase));
  } catch {
    return { ok: false, message: "unparseable observatory URL" };
  }
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
    return { ok: false, message: "observatory URL must be http(s)" };
  }
  const rootHref = root.href.replace(/\/+$/, "");
  const href = resolved.href;
  if (!href.startsWith(`${rootHref}/`) && href.replace(/\/+$/, "") !== rootHref) {
    return { ok: false, message: "refusing to fetch a URL outside the observatory bridge base" };
  }
  const path = resolved.pathname.replace(/\/+$/, "") || "/";
  if (path !== root.pathname.replace(/\/+$/, "") && !path.includes("/api/observatory")) {
    return { ok: false, message: "refusing to fetch a non-observatory path" };
  }
  const tail = path.slice(root.pathname.replace(/\/+$/, "").length);
  if (resolved.username || resolved.password || resolved.search || resolved.hash ||
      !/^\/(snapshot|sources(?:\/(moltjobs|x402stats|smithery_mcp))?)$/.test(tail)) {
    return { ok: false, message: "refusing a noncanonical observatory endpoint" };
  }
  return { ok: true };
}

export function classifyFetchFailure(error, extra = {}) {
  const name = error && error.name ? String(error.name) : "";
  const message = String((error && error.message) || error || "");
  const cspHits = Array.isArray(extra.cspViolations) ? extra.cspViolations : [];
  const url = extra.url || "";

  if (cspHits.some((hit) => cspBlocks(hit, url))) {
    return {
      kind: "csp",
      message: "Content-Security-Policy connect-src blocked this request",
    };
  }
  if (extra.timedOut || name === "TimeoutError") {
    return {
      kind: "timeout",
      message: `aborted after ${extra.timeoutMs || DEFAULT_TIMEOUT_MS}ms`,
    };
  }
  if (name === "AbortError") {
    return {
      kind: extra.timedOut ? "timeout" : "network",
      message: extra.timedOut
        ? `aborted after ${extra.timeoutMs || DEFAULT_TIMEOUT_MS}ms`
        : message || "aborted",
    };
  }
  if (name === "SyntaxError") {
    return { kind: "parse", message: message || "invalid JSON" };
  }
  if (/content security policy|violates.*connect-src|csp/i.test(message)) {
    return { kind: "csp", message };
  }

  const timing = inspectResourceTiming(url);
  if (name === "TypeError" && /failed to fetch|load failed|networkerror when attempting to fetch/i.test(message)) {
    if (timing === "csp") return { kind: "csp", message };
    if (timing === "cors" || timing === "unknown") {
      return {
        kind: "cors",
        message:
          "Failed to fetch. The browser blocked the cross-origin read. The responding origin did not send Access-Control-Allow-Origin for this page, or the response was otherwise unreadable.",
      };
    }
    return { kind: "network", message };
  }
  if (name === "TypeError") {
    return { kind: "network", message };
  }
  return { kind: "network", message };
}

function cspBlocks(hit, url) {
  if (!hit) return false;
  const directive = String(hit.effectiveDirective || hit.violatedDirective || "");
  const blocked = String(hit.blockedURI || "");
  return (
    directive.includes("connect-src") &&
    (!url ||
      blocked === url ||
      blocked.includes("samedaydesk.com") ||
      blocked.includes("api.moltjobs.io") ||
      blocked.includes("x402stats.io") ||
      blocked.includes("api.smithery.ai"))
  );
}

function inspectResourceTiming(url) {
  if (typeof performance === "undefined" || typeof performance.getEntriesByName !== "function" || !url) {
    return "unknown";
  }
  const entries = performance.getEntriesByName(url);
  const last = entries[entries.length - 1];
  if (!last) return "unknown";
  if (typeof last.responseStatus === "number" && last.responseStatus > 0) return "cors";
  if (typeof last.duration === "number" && last.duration > 0) return "cors";
  return "unknown";
}

function baseReceipt({ url, fetchedAt, timeoutMs }) {
  return {
    url,
    method: "GET",
    mode: "cors",
    credentials: "omit",
    fetchedAt,
    startedAt: fetchedAt,
    finishedAt: null,
    timeoutMs,
    httpStatus: null,
    failureKind: null,
    bytes: null,
    proxyUsed: false,
    cors: {
      requestMode: "cors",
      allowOriginSeen: null,
    },
  };
}

function fail(receipt, error) {
  return {
    ok: false,
    receipt,
    body: null,
    error: {
      kind: error.kind,
      message: error.message,
      httpStatus: error.httpStatus || receipt.httpStatus,
    },
  };
}

async function readBoundedText(response) {
  const limit = MAX_BODY_CHARS; // UTF-8 bytes, bounded before retaining a stream.
  const declared = Number(response.headers?.get?.("content-length"));
  if (declared > limit) {
    await response.body?.cancel?.();
    throw new SyntaxError("bridge body exceeds byte limit");
  }
  if (!response.body?.getReader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > limit) throw new SyntaxError("bridge body exceeds byte limit");
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > limit) { await reader.cancel(); throw new SyntaxError("bridge body exceeds byte limit"); }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}
