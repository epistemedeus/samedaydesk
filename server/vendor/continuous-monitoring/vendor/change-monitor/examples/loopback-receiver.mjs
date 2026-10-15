#!/usr/bin/env node
import { createServer } from "node:http";

const events = new Map();
const server = createServer((request, response) => {
  request.on("error", () => {});
  response.on("error", () => {});
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (request.method === "GET" && url.pathname.startsWith("/events/")) {
    const key = decodeURIComponent(url.pathname.slice("/events/".length));
    const found = events.get(key);
    if (!found) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ found: false }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ found: true, idempotencyKey: key, event: found }));
    return;
  }
  if (request.method === "POST" && url.pathname === "/deliver") {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ accepted: false, error: "invalid_json" }));
        return;
      }
      const header = request.headers["idempotency-key"];
      const key = typeof header === "string" ? header : body.idempotencyKey;
      if (!key || key !== body.idempotencyKey) {
        response.writeHead(422, { "content-type": "application/json" });
        response.end(JSON.stringify({ accepted: false, error: "idempotency_mismatch" }));
        return;
      }
      const duplicate = events.has(key);
      events.set(key, body.event);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ accepted: true, duplicate, idempotencyKey: key }));
    });
    return;
  }
  response.writeHead(404);
  response.end();
});

server.on("clientError", (_error, socket) => {
  socket.destroy();
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  process.stdout.write(`${JSON.stringify({ baseUrl: `http://127.0.0.1:${address.port}`, ready: true })}\n`);
});
