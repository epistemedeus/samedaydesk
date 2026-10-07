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

export async function readPinnedSnapshot({ fetchImpl, timeoutMs, maxBodyBytes, now, lookup }) {
  const url = pinnedSnapshotUrl();
  if (url !== "https://samedaydesk.com/api/observatory/snapshot") {
    throw new WatchError("monitor_pin", "snapshot pin moved", 503);
  }
  await assertResolvablePublic(url, lookup);
  let calls = 0;
  let refusal = null;
  const wrapped = async (requested, init) => {
    if (requested !== url) throw new WatchError("ssrf", "snapshot reader received an unpinned URL");
    calls += 1;
    const response = await fetchImpl(requested, { ...init, redirect: "manual" });
    if (response?.status >= 300 && response.status < 400) {
      refusal = { code: "redirect_refused", message: "snapshot redirect was refused" };
      const error = new WatchError("redirect_refused", refusal.message);
      error.calls = calls;
      throw error;
    }
    return response;
  };
  const { monitor } = await loadPinnedMonitor();
  let result;
  try {
    result = await monitor.readMaintainedProjection({
      fetchImpl: wrapped,
      timeoutMs,
      now: () => now,
    });
  } catch (error) {
    if (refusal) return { failure: refusal, bytes: 0, calls };
    if (error instanceof WatchError) {
      error.calls = calls;
      throw error;
    }
    return { failure: { code: "source_unreachable", message: "snapshot read failed" }, bytes: 0, calls };
  }
  if (refusal) return { failure: refusal, bytes: 0, calls };
  const fetchBytes = Number(result?.fetch?.bytes) || 0;
  if (fetchBytes > maxBodyBytes) {
    return { failure: { code: "body_limit", message: "source body exceeded the check budget" }, bytes: fetchBytes, calls };
  }
  if (!result || result.status === "source_failure" || result.projection == null) {
    return {
      failure: { code: result?.failureCode || "source_unreachable", message: result?.reason || "source unavailable" },
      bytes: fetchBytes,
      calls,
    };
  }
  const document = {
    capture: result.capture === "live" ? "live" : "injected",
    integration: "maintained",
    projection: result.projection,
    publicSourceChanged: false,
  };
  const bytes = Buffer.byteLength(JSON.stringify(document));
  if (bytes > maxBodyBytes || fetchBytes > maxBodyBytes) {
    return { failure: { code: "body_limit", message: "source body exceeded the check budget" }, bytes: Math.max(bytes, fetchBytes), calls };
  }
  return { document, bytes, calls };
}
