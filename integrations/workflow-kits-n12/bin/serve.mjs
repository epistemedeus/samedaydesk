#!/usr/bin/env node
// Minimal HTTP wrapper around the SameDayDesk client endpoint, for a VM run with a
// self-hosted n8n. Binds to 127.0.0.1 by default. Not a production service.
import { createServer } from "node:http";

import { createClientEndpoint } from "../src/client-endpoint.mjs";

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
const endpoint = createClientEndpoint();

createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    let body = null;
    try {
      body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_json" }));
      return;
    }
    const url = new URL(req.url, `http://${host}`);
    const reply = endpoint.handle({ method: req.method, path: url.pathname, headers: req.headers, body });
    res.writeHead(reply.status, { "content-type": "application/json" });
    res.end(JSON.stringify(reply.body));
  });
}).listen(port, host, () => {
  process.stdout.write(`samedaydesk workflow-kits-n12 client endpoint on http://${host}:${port}\n`);
});
