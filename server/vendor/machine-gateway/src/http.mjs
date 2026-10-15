import http from "node:http";
import { boundedJson } from "./util.mjs";
import { fail, GatewayError, publicError } from "./errors.mjs";
import { validate } from "./schemas.mjs";

function json(res, status, value, headers = {}) {
  if (res.destroyed) return;
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
    "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", ...headers });
  res.end(JSON.stringify(value));
}

function readBody(req, limit) {
  if (req.body !== undefined || req.readableEnded) fail("mount_requires_raw_body", 503);
  if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers["content-type"] || "")) fail("json_content_type_required", 415);
  if (req.headers["content-encoding"] && req.headers["content-encoding"] !== "identity") fail("content_encoding_unsupported", 415);
  if (Number(req.headers["content-length"]) > limit) fail("body_too_large", 413);
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const timer = setTimeout(() => done(new GatewayError("body_timeout", 408)), 3000);
    function done(error) {
      clearTimeout(timer);
      req.off("data", data); req.off("end", end); req.off("error", broken); req.off("aborted", broken);
      if (error) { req.pause(); reject(error); }
      else { try { resolve(boundedJson(Buffer.concat(chunks).toString("utf8"), limit)); } catch (e) { reject(e); } }
    }
    function data(chunk) { size += chunk.length; if (size > limit) done(new GatewayError("body_too_large", 413)); else chunks.push(chunk); }
    function end() { done(); }
    function broken() { done(new GatewayError("request_aborted", 400)); }
    req.on("data", data); req.once("end", end); req.once("error", broken); req.once("aborted", broken);
  });
}

// Bounded table; forwarded IP headers cannot create arbitrary limiter keys.
function rateLimiter({ perMinute = 120, capacity = 1024, now = Date.now } = {}) {
  const entries = new Map();
  return ip => {
    const time = now();
    for (const [key, entry] of entries) if (entry.until <= time) entries.delete(key);
    if (!entries.has(ip)) {
      if (entries.size >= capacity) fail("rate_limit", 429);
      entries.set(ip, { until: time + 60000, count: 0 });
    }
    if (++entries.get(ip).count > perMinute) fail("rate_limit", 429);
  };
}

export function createHttpHandler(gateway, { stripPrefix = gateway.prefix, bodyLimit = 131072, rateLimit = {} } = {}) {
  const admitRate = rateLimiter(rateLimit);
  return async (req, res) => {
    const controller = new AbortController();
    const onClose = () => { if (!res.writableEnded) controller.abort(new GatewayError("execution_aborted", 499)); };
    res.once("close", onClose);
    try {
      admitRate(req.socket.remoteAddress || "unknown");
      if (req.url.includes("?")) fail("query_not_supported");
      if (stripPrefix && !(req.url === stripPrefix || req.url.startsWith(`${stripPrefix}/`))) fail("route_not_found", 404);
      const path = req.url.slice(stripPrefix.length);
      if (!["GET", "POST"].includes(req.method)) fail("method_not_allowed", 405);
      const readPaths = path === "/healthz" || path === "/v1/discover" || path.startsWith("/v1/routes/") || path.startsWith("/v1/receipts/");
      const writePaths = ["/v1/quote", "/v1/test", "/v1/execute"].includes(path);
      if ((readPaths && req.method !== "GET") || (writePaths && req.method !== "POST")) fail("method_not_allowed", 405);
      if (path === "/healthz") return json(res, 200, gateway.health());
      if (path === "/v1/discover") return json(res, 200, gateway.registry.discover(gateway.prefix, gateway.paymentsEnabled));
      const schemaMatch = /^\/v1\/routes\/([A-Za-z0-9_.-]+)\/(input|output)\.schema\.json$/.exec(path);
      if (schemaMatch) return json(res, 200, gateway.registry.get(schemaMatch[1])[`${schemaMatch[2]}Schema`]);
      const receiptMatch = /^\/v1\/receipts\/([a-f0-9-]{36})$/.exec(path);
      if (receiptMatch) {
        const tenant = gateway.authenticate(req.headers.authorization);
        const receipt = gateway.store.receipt(tenant.id, receiptMatch[1]);
        gateway.allow(tenant, receipt.routeId);
        return json(res, 200, receipt);
      }
      if (!writePaths) fail("route_not_found", 404);
      const tenant = path === "/v1/execute" ? gateway.authenticate(req.headers.authorization)
        : path === "/v1/quote" ? gateway.authenticate(req.headers.authorization, true) : null;
      const body = await readBody(req, bodyLimit);
      if (path === "/v1/quote") return json(res, 200, gateway.quote(body, tenant));
      if (path === "/v1/test") return json(res, 200, await gateway.test(body, AbortSignal.any([controller.signal, AbortSignal.timeout(5000)])));
      const result = await gateway.execute(body, { tenant, idempotencyKey: req.headers["idempotency-key"],
        paymentHeader: req.headers["payment-signature"] || "", signal: controller.signal });
      const receipt = validate("receipt", result.receipt, { response: true });
      return json(res, receipt.status === "running" ? 202 : 200, receipt, {
        "idempotency-replayed": String(result.replay), location: receipt.readbackPath,
      });
    } catch (error) {
      const safe = publicError(error);
      const close = !req.complete || [408, 413, 415].includes(safe.status);
      if (close) res.once("finish", () => req.socket.destroy());
      return json(res, safe.status, validate("error", safe.body, { response: true }), close ? { connection: "close" } : {});
    } finally { res.off("close", onClose); }
  };
}

export function createGatewayServer(gateway, options) {
  return http.createServer({ maxHeaderSize: 24576, headersTimeout: 5000, requestTimeout: 15000, keepAliveTimeout: 5000 }, createHttpHandler(gateway, options));
}
