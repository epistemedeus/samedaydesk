import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ACK_SCHEMA } from "./pins.mjs";

export function startLoopbackReceiver({
  host = "127.0.0.1",
  port = 0,
  mode = "ack",
  delayMs = 0,
  storeDir = null,
  path = "/callback",
} = {}) {
  if (storeDir) mkdirSync(storeDir, { recursive: true });
  const pathname = path.startsWith("/") ? path : `/${path}`;

  const server = createServer((req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "POST only" }));
      return;
    }
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks);
      let payload = null;
      try {
        payload = JSON.parse(raw.toString("utf8"));
      } catch {
        payload = { parseError: true, bytes: raw.length };
      }
      const eventId = payload?.eventId || req.headers["x-outbox-event-id"] || "unknown";
      const attemptId = req.headers["x-outbox-attempt-id"] || "unknown";
      if (storeDir) {
        writeFileSync(
          join(storeDir, `${String(attemptId).replace(/[^a-zA-Z0-9._-]/g, "_")}.json`),
          `${JSON.stringify({ receivedAt: new Date().toISOString(), eventId, payload }, null, 2)}\n`,
        );
      }

      if (mode === "close-after-store") {
        req.socket.destroy();
        return;
      }

      const reply = () => {
        if (mode === "empty-body") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end("");
          return;
        }
        const dest = payload?.callbackDestination || {};
        const ackPath =
          mode === "ack-wrong-path" ? "/not-the-callback" : dest.path || pathname;
        const ackDigest =
          mode === "ack-wrong-digest" ? "f".repeat(64) : payload?.outputsDigest || null;
        const ack = {
          schema: ACK_SCHEMA,
          ack: true,
          eventId,
          callbackPath: mode === "ack-event-only" ? undefined : ackPath,
          outputsDigest: mode === "ack-event-only" ? undefined : ackDigest,
          buyerAccepted: false,
          sale: false,
          receivedAt: new Date().toISOString(),
        };
        if (mode === "ack-event-only") {
          delete ack.callbackPath;
          delete ack.outputsDigest;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(ack));
      };

      if (delayMs > 0) setTimeout(reply, delayMs);
      else reply();
    });
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, host, () => {
      const addr = server.address();
      const url = `http://${host}:${addr.port}${pathname}`;
      resolve({
        url,
        port: addr.port,
        path: pathname,
        server,
        async close() {
          await new Promise((done) => server.close(done));
        },
      });
    });
  });
}
