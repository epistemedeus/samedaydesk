/**
 * Unpaid w7 may POST only http loopback MCP URLs. Live apex is cite-only.
 */
import { PAYMENT_STOP_PATHS } from "./catalog.mjs";

export const LOOPBACK_HOSTS = Object.freeze(["127.0.0.1", "localhost", "::1"]);
export const MAX_MCP_BODY_BYTES = 1024 * 1024;

function looksLikePaymentPath(pathAndQuery) {
  const matched = PAYMENT_STOP_PATHS.some(
    (p) =>
      pathAndQuery === p ||
      pathAndQuery.startsWith(p) ||
      (p.endsWith("=") && pathAndQuery.includes(p)),
  );
  if (matched) return true;
  return (
    /stripe|checkout|cs_test_|cs_live_/i.test(pathAndQuery) ||
    pathAndQuery.includes("cs=")
  );
}

export function parseMcpOrigin(raw) {
  try {
    return new URL(raw);
  } catch {
    const err = new Error(`invalid MCP origin: ${raw}`);
    err.code = "USAGE";
    throw err;
  }
}

export function assertLoopbackUnpaidOrigin(raw) {
  const u = parseMcpOrigin(raw);
  if (u.protocol !== "http:") {
    const err = new Error(
      `unpaid w7 harness only POSTs http loopback, not ${u.protocol}//${u.hostname}`,
    );
    err.code = "LIVE_REFUSE";
    err.origin = String(raw);
    throw err;
  }
  const host = String(u.hostname || "").replace(/^\[|\]$/g, "");
  if (!LOOPBACK_HOSTS.includes(host)) {
    const err = new Error(
      `refusing non-loopback MCP origin: ${u.hostname} (live apex is cite-only)`,
    );
    err.code = "LIVE_REFUSE";
    err.origin = String(raw);
    throw err;
  }
  const pathAndQuery = `${u.pathname}${u.search}`;
  if (looksLikePaymentPath(pathAndQuery)) {
    const err = new Error(
      `refusing Stripe/checkout path in unpaid origin: ${pathAndQuery}`,
    );
    err.code = "STRIPE_PATH_REFUSE";
    err.path = pathAndQuery;
    throw err;
  }
  return u;
}

export function resolveLoopbackMcpUrl(origin) {
  const u = assertLoopbackUnpaidOrigin(origin);
  const trimmed = u.pathname.replace(/\/$/, "") || "/";
  if (trimmed === "/") u.pathname = "/mcp";
  else if (trimmed !== "/mcp") u.pathname = `${trimmed}/mcp`;
  else u.pathname = "/mcp";
  return `${u.protocol}//${u.host}${u.pathname}${u.search}`;
}

export function refuseLiveFlag() {
  const err = new Error(
    "refusing --live: unpaid w7 POSTs loopback fixture only; use cite-apex for the live URL",
  );
  err.code = "LIVE_REFUSE";
  throw err;
}
