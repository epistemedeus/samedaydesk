import http from "node:http";
import { runCreateOrder } from "./create-order.mjs";

const MAX_BODY = 1_048_576;
const CREATE_PATHS = new Set(["/managed/useful-jobs/v1/orders", "/v1/orders"]);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error("payload too large"), { code: "payload-too-large", httpStatus: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function send(res, status, body) {
  const json = `${JSON.stringify(body, null, 2)}\n`;
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(json);
}

/**
 * Ephemeral 127.0.0.1 test listener. Not a production Express mount.
 * Does not POST to samedaydesk.com.
 */
export function createListener(options = {}) {
  const host = options.host || "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error("listener host must be 127.0.0.1 (local test only)");
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${host}`);
    if (req.method === "GET" && url.pathname === "/healthz") {
      send(res, 200, {
        ok: true,
        bind: host,
        productionExpress: false,
        liveCatalogItem: false,
        sold: false,
      });
      return;
    }
    if (req.method === "POST" && CREATE_PATHS.has(url.pathname)) {
      try {
        const buf = await readBody(req);
        let raw;
        try {
          raw = JSON.parse(buf.toString("utf8") || "{}");
        } catch {
          send(res, 400, {
            ok: false,
            sold: false,
            charged: false,
            code: "invalid-json",
            error: "request body must be JSON",
          });
          return;
        }
        const result = await runCreateOrder(raw, options);
        const status = result.ok ? (result.replayed ? 200 : 201) : result.httpStatus || 400;
        send(res, status, result);
      } catch (err) {
        send(res, err.httpStatus || 500, {
          ok: false,
          sold: false,
          charged: false,
          code: err.code || "internal-error",
          error: String(err.message || err),
        });
      }
      return;
    }
    send(res, 404, { ok: false, sold: false, charged: false, code: "not-found" });
  });

  return {
    server,
    listen(port = 0) {
      return new Promise((resolve) => {
        server.listen(port, host, () => {
          const addr = server.address();
          const origin = `http://${host}:${addr.port}`;
          resolve({ origin, port: addr.port, host });
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
