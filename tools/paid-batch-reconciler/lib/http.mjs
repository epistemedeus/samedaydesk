import http from "node:http";
import { runBatch, readBatch } from "./ledger.mjs";

const MAX_BODY_BYTES = 8 * 1024 * 1024;

function readBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let failed = false;
    req.on("data", (c) => {
      if (failed) return;
      bytes += c.length;
      if (bytes > limit) {
        failed = true;
        reject(Object.assign(new Error("batch body exceeds 8 MiB"), { code: "body-too-large", status: 413 }));
        req.resume();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => { if (!failed) resolve(Buffer.concat(chunks).toString("utf8")); });
    req.on("error", reject);
    req.on("aborted", () => reject(Object.assign(new Error("Request body interrupted"), { code: "request-aborted", status: 400 })));
  });
}

function send(res, status, body) {
  if (res.destroyed || res.writableEnded) return;
  const text = `${JSON.stringify(body, null, 2)}\n`;
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(text),
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
          usefulPaidWork: false,
        });
        return;
      }
      if (req.method === "GET" && url.pathname.startsWith("/batch/")) {
        const id = decodeURIComponent(url.pathname.slice("/batch/".length).split("?")[0]);
        let ledger = null;
        try { ledger = readBatch(id, options); } catch (err) {
          send(res, 409, { ok: false, sold: false, code: err.code || "corrupt-batch-manifest", error: err.message });
          return;
        }
        ledger = ledger || store.get(id);
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
          persistKind: persist ? "postgres" : (options.storeDir ? "durable-file" : "http-memory"),
          baseDir: options.baseDir || process.cwd(),
          storeDir: options.storeDir,
          outDir: options.outDir,
          deskOptions: options.deskOptions,
        });
        if (ledger.batchId) store.set(ledger.batchId, ledger);
        const status = ledger.status === "rejected" && !ledger.items.length ? 400 : 200;
        send(res, status, ledger);
        return;
      }
      send(res, 404, { ok: false, sold: false, code: "not-found" });
    } catch (err) {
      send(res, err.status || 500, {
        ok: false,
        sold: false,
        code: err.code || "internal-error",
        error: err.message,
      });
    }
  });

  return { server, store };
}

export function listenLocal(server, { host = "127.0.0.1", port = 0 } = {}) {
  if (host !== "127.0.0.1" && host !== "localhost") {
    return Promise.reject(Object.assign(new Error("Batch HTTP binds loopback only"), { code: "loopback-required" }));
  }
  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      const addr = server.address();
      resolve({ host, port: addr.port, url: `http://${host}:${addr.port}` });
    });
    server.on("error", reject);
  });
}
