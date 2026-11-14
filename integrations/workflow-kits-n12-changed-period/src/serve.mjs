import { createServer } from "node:http";
import { CLIENT_ENDPOINT, createChangedPeriodEndpoint } from "./client-endpoint.mjs";
import { openDurableApplyReceipts } from "./durable-receipts.mjs";

const MAX_BYTES = 256 * 1024;
const ROUTES = new Set(["/evaluate", "/apply", "/replay"]);

export function serveLocalChangedPeriod(file, { port = 8788, now = () => new Date().toISOString(), faults = [] } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("invalid port");
  const receipts = openDurableApplyReceipts(file);
  const endpoint = createChangedPeriodEndpoint({ clock: now(), faults, receipts });
  const send = (res, status, body) => {
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  };
  const server = createServer({ requestTimeout: 15000 }, async (req, res) => {
    if (req.method !== "POST" || !ROUTES.has(req.url)) {
      req.resume();
      return send(res, 404, { error: "not_found" });
    }
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] ?? "")) {
      req.resume();
      return send(res, 415, { error: "json_required" });
    }
    const chunks = [];
    let size = 0;
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BYTES) {
          // No partial capture is retained or evaluated.
          send(res, 413, { error: "request_too_large" });
          return;
        }
        chunks.push(chunk);
      }
    } catch { return; }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks)); }
    catch { return send(res, 400, { error: "invalid_json" }); }
    try {
      endpoint.setClock(now());
      const result = endpoint.handle({
        method: req.method, url: CLIENT_ENDPOINT + req.url, body,
        headers: { "Idempotency-Key": req.headers["idempotency-key"] },
      });
      if (result.transportError) return req.socket.destroy();
      return send(res, result.status, result.body);
    } catch {
      // An unavailable store is not evidence that an earlier apply never landed.
      return send(res, 503, { error: "result_unavailable", next: "recover using the same request and key" });
    }
  });
  server.on("close", () => receipts.close());
  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(JSON.stringify({ ready: true, host: "127.0.0.1", port: server.address().port }) + "\n");
  });
  return server;
}
