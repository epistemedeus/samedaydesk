import { createServer } from "node:http";
import { runRace } from "./race.mjs";

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8") || "{}";
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

export function startRaceServer({ host = "127.0.0.1", port = 0 } = {}) {
  const server = createServer(async (req, res) => {
    try {
      if (req.method === "POST" && (req.url === "/race" || req.url === "/execute")) {
        const body = await readBody(req);
        const result = await runRace(body);
        const status = result.kind === "transport-failure" ? 500 : 200;
        res.writeHead(status, { "content-type": "application/json" });
        res.end(`${JSON.stringify(result)}\n`);
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end(`${JSON.stringify({ ok: false, code: "not-found" })}\n`);
    } catch (err) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(`${JSON.stringify({ ok: false, code: "http-error", error: err.message || String(err) })}\n`);
    }
  });
  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      const addr = server.address();
      resolve({
        server,
        host: addr.address,
        port: addr.port,
        url: `http://${addr.address}:${addr.port}`,
      });
    });
    server.on("error", reject);
  });
}
