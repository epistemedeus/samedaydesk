import dns from "node:dns/promises";
import net from "node:net";
import { isPrivateIp } from "../agent-readiness/ssrf.js";
import { WatchError } from "./errors.mjs";
import { loadPinnedMonitor, pinnedUrls } from "./runtime.mjs";

const BLOCKED_NAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.google.com",
]);

export function pinnedSnapshotUrl() {
  return pinnedUrls().publicSnapshotUrl;
}

export async function assertResolvablePublic(urlText, lookup = dns.lookup) {
  let url;
  try {
    url = new URL(urlText);
  } catch {
    throw new WatchError("ssrf", "source target is not a URL the reader can accept");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new WatchError("ssrf", "source target credentials and redirects are refused");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || BLOCKED_NAMES.has(host) || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new WatchError("ssrf", "private-network source targets are refused");
  }
  const addresses = [];
  if (net.isIP(host)) addresses.push(host);
  else {
    const looked = await lookup(host, { all: true });
    const list = Array.isArray(looked) ? looked : [looked];
    for (const record of list) addresses.push(record.address);
  }
  if (addresses.length === 0 || addresses.some((address) => isPrivateIp(address))) {
    throw new WatchError("ssrf", "source host is not a public address");
  }
  return url;
}

export async function refuseCallerTarget(urlText, fetchImpl) {
  let calls = 0;
  const counting = async (...args) => {
    calls += 1;
    return fetchImpl(...args);
  };
  try {
    await assertResolvablePublic(urlText);
  } catch (error) {
    if (calls !== 0) throw new WatchError("ssrf", "private target was contacted");
    void counting;
    throw error;
  }
  void counting;
  throw new WatchError("ssrf", "caller-supplied target was not refused");
}

function abortError(code, message) {
  const error = new WatchError(code, message);
  return error;
}

function raceSignal(promise, signal, code, message) {
  const fail = () => abortError(typeof code === "function" ? code() : code, message);
  if (signal?.aborted) return Promise.reject(fail());
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(fail());
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then((value) => {
      signal?.removeEventListener("abort", onAbort);
      resolve(value);
    }, (error) => {
      signal?.removeEventListener("abort", onAbort);
      reject(error);
    });
  });
}

function cancelBody(body) {
  // Initiate cleanup, but an uncooperative cancellation must not extend the deadline.
  try {
    if (typeof body?.cancel === "function") void Promise.resolve(body.cancel()).catch(() => {});
  } catch { /* preserve the refusal */ }
}

async function readAtMost(response, maxBodyBytes, signal, codeFor = () => "timeout") {
  const declared = Number(response?.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > maxBodyBytes) {
    cancelBody(response?.body);
    const error = abortError("body_limit", "declared source body exceeds the check budget");
    error.bytes = 0;
    error.declaredBytes = declared;
    throw error;
  }
  const reader = response?.body?.getReader?.();
  if (!reader) {
    if (typeof response?.text !== "function") return Buffer.alloc(0);
    const text = await raceSignal(response.text(), signal, codeFor, "source body timed out");
    const bytes = Buffer.from(text);
    if (bytes.length > maxBodyBytes) {
      const error = abortError("body_limit", "source body exceeded the check budget");
      error.bytes = bytes.length;
      throw error;
    }
    return bytes;
  }
  const chunks = [];
  let total = 0;
  while (true) {
    const next = await raceSignal(reader.read(), signal, codeFor, "source body timed out");
    if (next.done) break;
    const value = Buffer.from(next.value);
    total += value.length;
    if (total > maxBodyBytes) {
      cancelBody(reader);
      const error = abortError("body_limit", "source body exceeded the check budget");
      error.bytes = total;
      throw error;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function readPinnedSnapshot({
  fetchImpl,
  timeoutMs = 8000,
  maxBodyBytes = 262144,
  now,
  lookup,
  signal,
} = {}) {
  const started = performance.now();
  const url = pinnedSnapshotUrl();
  if (url !== "https://samedaydesk.com/api/observatory/snapshot") {
    throw new WatchError("monitor_pin", "snapshot pin moved", 503);
  }
  const suppliedFetch = typeof fetchImpl === "function";
  const impl = suppliedFetch ? fetchImpl : globalThis.fetch;
  if (typeof impl !== "function") {
    return {
      failure: { code: "source_unreachable", message: "snapshot fetch is not available" },
      bytes: 0,
      calls: 0,
      runtimeMs: Math.round(performance.now() - started),
    };
  }
  const budget = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 8000;
  const budgetController = new AbortController();
  const budgetTimer = setTimeout(() => budgetController.abort(), budget);
  try {
    const timeoutSignal = budgetController.signal;
    const combined = signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal;
    const fail = (code, message, calls, bytes = 0) => ({
      failure: { code, message },
      bytes,
      calls,
      runtimeMs: Math.round(performance.now() - started),
    });
    const codeForAbort = (phase) => {
      if (signal?.aborted) return "cancelled";
      return phase === "dns" ? "dns_timeout" : "timeout";
    };
    let calls = 0;
    let refusal = null;
    const boundedLookup = async (host, options) => {
      try {
        return await raceSignal(
          (lookup || dns.lookup)(host, options),
          combined,
          () => codeForAbort("dns"),
          "snapshot DNS did not answer inside the check budget",
        );
      } catch (error) {
        if (error instanceof WatchError) throw error;
        throw error;
      }
    };
    try {
      await assertResolvablePublic(url, boundedLookup);
    } catch (error) {
      if (error instanceof WatchError && (error.code === "dns_timeout" || error.code === "cancelled" || error.code === "timeout")) {
        return fail(error.code, error.message, 1, 0);
      }
      if (error instanceof WatchError) {
        error.calls = 0;
        error.runtimeMs = Math.round(performance.now() - started);
        throw error;
      }
      return fail("source_unreachable", "snapshot DNS failed", 1, 0);
    }
    if (combined.aborted) return fail(codeForAbort("dns"), "snapshot check budget ended before the request", 1, 0);

    const wrapped = async (requested) => {
      if (requested !== url) throw new WatchError("ssrf", "snapshot reader received an unpinned URL");
      if (combined.aborted) {
        const error = abortError(codeForAbort("body"), "snapshot check was cancelled before the request");
        error.calls = calls;
        throw error;
      }
      calls += 1;
      const response = await raceSignal(
        Promise.resolve(impl(requested, { redirect: "manual", signal: combined })),
        combined,
        () => codeForAbort("body"),
        "snapshot request timed out",
      );
      if (response?.status >= 300 && response.status < 400) {
        cancelBody(response?.body);
        refusal = { code: "redirect_refused", message: "snapshot redirect was refused" };
        budgetController.abort();
        const error = abortError("redirect_refused", refusal.message);
        error.calls = calls;
        throw error;
      }
      let bytes;
      try {
        bytes = await readAtMost(response, maxBodyBytes, combined, () => codeForAbort("body"));
      } catch (error) {
        if (error instanceof WatchError) {
          refusal = { code: error.code, message: error.message, bytes: Number(error.bytes) || 0 };
          budgetController.abort();
          error.calls = calls;
          error.bytes = error.bytes || 0;
          throw error;
        }
        throw error;
      }
      const headers = new Headers();
      const contentType = response?.headers?.get?.("content-type");
      if (contentType) headers.set("content-type", contentType);
      headers.set("content-length", String(bytes.length));
      return new Response(bytes, { status: response?.status || 200, headers });
    };

    const { monitor } = await loadPinnedMonitor();
    let result;
    try {
      result = await monitor.readMaintainedProjection({
        fetchImpl: wrapped,
        timeoutMs: budget,
        now: () => now,
        capture: suppliedFetch ? "injected" : "live",
      });
    } catch (error) {
      if (refusal) return fail(refusal.code, refusal.message, calls, refusal.bytes || 0);
      if (error instanceof WatchError) {
        error.calls = calls;
        error.runtimeMs = Math.round(performance.now() - started);
        throw error;
      }
      return fail(codeForAbort("body"), "snapshot read failed", calls, 0);
    }
    if (refusal) return fail(refusal.code, refusal.message, calls, refusal.bytes || 0);
    const fetchBytes = Number(result?.fetch?.bytes) || 0;
    const runtimeMs = Math.round(performance.now() - started);
    if (fetchBytes > maxBodyBytes) {
      return { failure: { code: "body_limit", message: "source body exceeded the check budget" }, bytes: fetchBytes, calls, runtimeMs };
    }
    if (!result || result.status === "source_failure" || result.projection == null) {
      const code = result?.failureCode && result.failureCode !== "source_unreachable"
        ? result.failureCode
        : (result?.fetch?.failureKind === "timeout" ? "timeout" : (result?.failureCode || "source_unreachable"));
      return {
        failure: { code, message: result?.reason || "source unavailable" },
        bytes: fetchBytes,
        calls: Math.max(calls, 1),
        runtimeMs,
      };
    }
    const capture = result.capture === "live" ? "live" : "injected";
    const document = {
      capture,
      integration: "maintained",
      projection: result.projection,
      publicSourceChanged: false,
    };
    const bytes = Buffer.byteLength(JSON.stringify(document));
    if (bytes > maxBodyBytes) {
      return { failure: { code: "body_limit", message: "source body exceeded the check budget" }, bytes, calls, runtimeMs };
    }
    return { document, bytes, calls, runtimeMs };
  } finally {
    clearTimeout(budgetTimer);
  }
}
