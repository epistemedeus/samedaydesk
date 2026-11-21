/**
 * One live price quote for /x402: the unpaid challenge the gateway returns for one fixed request.
 * The gateway's paid routes send no CORS headers, so the page asks this same-origin route, which
 * makes exactly that request and returns what came back. Not a proxy: the URL is fixed, nothing
 * from the caller is forwarded, and no payment is ever made. A result is reused for 30 seconds.
 */

import { Router } from "express";

export const QUOTE_URL = "https://agents.samedaydesk.com/extract?url=https%3A%2F%2Fexample.com";
const REUSE_MS = 30_000;
const TIMEOUT_MS = 8_000;

function decode(header) {
  if (!header) return null;
  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

export function createX402QuoteRouter({ fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  const router = Router();
  let last = null;

  router.get("/", async (_req, res) => {
    res.set("Cache-Control", "no-store");
    if (last && now() - last.at < REUSE_MS) return res.status(200).json(last.body);
    try {
      const upstream = await fetchImpl(QUOTE_URL, { method: "GET", headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      const text = await upstream.text();
      let body = null;
      try { body = JSON.parse(text); } catch { body = null; }
      const paymentRequired = upstream.headers.get("payment-required");
      const result = {
        requestedAt: new Date(now()).toISOString(),
        request: { method: "GET", url: QUOTE_URL },
        status: upstream.status,
        headers: {
          "content-type": upstream.headers.get("content-type"),
          "payment-required": paymentRequired,
          "www-authenticate": upstream.headers.get("www-authenticate"),
        },
        paymentRequired: decode(paymentRequired),
        body,
      };
      last = { at: now(), body: result };
      return res.status(200).json(result);
    } catch (error) {
      return res.status(502).json({ error: "gateway_unreachable", detail: String(error?.name || "error"), url: QUOTE_URL });
    }
  });

  return router;
}
