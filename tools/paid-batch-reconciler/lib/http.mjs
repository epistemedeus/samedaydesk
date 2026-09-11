import http from "node:http";
import { runBatch } from "./ledger.mjs";

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res, status, body) {
  const text = `${JSON.stringify(body, null, 2)}\n`;
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(text);
}

/**
 * Local non-settling HTTP. Bind 127.0.0.1. Not a public payment endpoint.
 */
export function createPaidBatchServer(options = {}) {
  const persist = options.persist || null;
  const store = options.store || new Map();

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/health") {
        send(res, 200, {
          ok: true,
          sold: false,
          liveSettlement: "out-of-scope",
          purchaseAuthority: false,
        });
        return;
      }
      if (req.method === "GET" && url.pathname.startsWith("/batch/")) {
        const id = url.pathname.slice("/batch/".length);
        const ledger = store.get(id);
        if (!ledger) {
          send(res, 404, { ok: false, sold: false, code: "batch-not-found" });
          return;
        }
        send(res, 200, ledger);
        return;
      }
      if (req.method === "POST" && url.pathname === "/batch") {
        const rawText = await readBody(req);
        let raw;
        try {
          raw = JSON.parse(rawText || "{}");
        } catch {
          send(res, 400, { ok: false, sold: false, code: "invalid-json" });
          return;
        }
        const ledger = await runBatch(raw, {
          persist,
          persistKind: persist ? "postgres" : "http-memory",
          baseDir: options.baseDir || process.cwd(),
          f08Root: options.f08Root,
        });
        store.set(ledger.batchId, ledger);
        send(res, ledger.status === "rejected" && !ledger.items.length ? 400 : 200, ledger);
        return;
      }
      send(res, 404, { ok: false, sold: false, code: "not-found" });
    } catch (err) {
      send(res, 500, {
        ok: false,
        sold: false,
        code: "internal-error",
        error: err.message,
      });
    }
  });

  return { server, store };
}

export function listenLocal(server, { host = "127.0.0.1", port = 0 } = {}) {
  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      const addr = server.address();
      resolve({ host, port: addr.port, url: `http://${host}:${addr.port}` });
    });
    server.on("error", reject);
  });
}
