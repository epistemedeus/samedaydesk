/**
 * Unpaid w800 may POST only http loopback MCP URLs. Live apex is cite-only.
 * Stripe / cs= / buy.stripe.com refuse before any socket.
 */
import { PAYMENT_STOP_PATHS, looksLikePaymentUrl } from "./catalog.mjs";

export const LOOPBACK_HOSTS = Object.freeze(["127.0.0.1", "localhost", "::1"]);
export const MAX_MCP_BODY_BYTES = 1024 * 1024;

export function parseMcpOrigin(raw) {
  try {
    return new URL(raw);
  } catch {
    const err = new Error(`invalid MCP origin: ${raw}`);
    err.code = "USAGE";
    throw err;
  }
}

export function assertNoPaymentUrl(value) {
  if (looksLikePaymentUrl(value)) {
    const err = new Error(`refusing Stripe/checkout path in unpaid harness: ${value}`);
    err.code = "STRIPE_PATH_REFUSE";
    err.path = value;
    throw err;
  }
  return true;
}

export function assertLoopbackUnpaidOrigin(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    const err = new Error("missing MCP origin");
    err.code = "USAGE";
    throw err;
  }
  assertNoPaymentUrl(trimmed);
  const u = parseMcpOrigin(trimmed);
  assertNoPaymentUrl(u.toString());
  if (u.protocol !== "http:") {
    const err = new Error(
      `unpaid w800 harness only POSTs http loopback, not ${u.protocol}//${u.hostname}`,
    );
    err.code = "LIVE_REFUSE";
    err.origin = trimmed;
    throw err;
  }
  const host = String(u.hostname || "").replace(/^\[|\]$/g, "");
  if (!LOOPBACK_HOSTS.includes(host)) {
    const err = new Error(
      `refusing non-loopback MCP origin: ${u.hostname} (live apex is cite-only)`,
    );
    err.code = "LIVE_REFUSE";
    err.origin = trimmed;
    throw err;
  }
  const pathAndQuery = `${u.pathname}${u.search}`;
  if (looksLikePaymentUrl(pathAndQuery) || looksLikePaymentUrl(u.toString())) {
    const err = new Error(`refusing Stripe/checkout path in unpaid origin: ${pathAndQuery}`);
    err.code = "STRIPE_PATH_REFUSE";
    err.path = pathAndQuery;
    throw err;
  }
  return u;
}

export function resolveLoopbackMcpUrl(origin) {
  const u = assertLoopbackUnpaidOrigin(origin);
  const trimmed = u.pathname.replace(/\/+$/, "") || "/";
  if (trimmed === "/") u.pathname = "/mcp";
  else if (trimmed !== "/mcp") u.pathname = `${trimmed}/mcp`;
  else u.pathname = "/mcp";
  return `${u.protocol}//${u.host}${u.pathname}${u.search}`;
}

export function refuseLiveFlag() {
  const err = new Error(
    "refusing --live: unpaid w800 POSTs loopback fixture only; use cite-apex for the live URL",
  );
  err.code = "LIVE_REFUSE";
  throw err;
}

export { PAYMENT_STOP_PATHS };
