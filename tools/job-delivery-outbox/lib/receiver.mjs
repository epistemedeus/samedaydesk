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
} = {}) {
  if (storeDir) mkdirSync(storeDir, { recursive: true });

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
        const ack = {
          schema: ACK_SCHEMA,
          ack: true,
          eventId,
          buyerAccepted: false,
          sale: false,
          receivedAt: new Date().toISOString(),
        };
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
      const url = `http://${host}:${addr.port}/callback`;
      resolve({
        url,
        port: addr.port,
        server,
        async close() {
          await new Promise((done) => server.close(done));
        },
      });
    });
  });
}
