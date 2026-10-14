import { createServer } from "node:http";
import { runMaintenanceOccurrence } from "./occurrence.mjs";
import { finish } from "./result.mjs";

const MAX_BYTES = 1_048_576;

export async function runHttpBody(body) {
  return runMaintenanceOccurrence(body);
}

export function listenLocal() {
  const server = createServer(async (req, res) => {
    if (req.method !== "POST") {
      const result = finish({
        ok: false,
        code: "method_refused",
        message: "only POST runs one occurrence",
        httpStatusIsNotUsefulWork: true,
      });
      res.writeHead(405, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(result));
      return;
    }
    const chunks = [];
    let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > MAX_BYTES) {
        res.writeHead(413, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, code: "body_too_large" }));
        return;
      }
      chunks.push(chunk);
    }
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, code: "invalid_json" }));
      return;
    }
    const result = await runHttpBody(body);
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(result));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
