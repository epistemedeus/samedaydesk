import http from "node:http";
import { URL } from "node:url";

const MAX_BODY_BYTES = 8 * 1024 * 1024;

function readBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let failed = false;
    req.on("data", (chunk) => {
      if (failed) return;
      bytes += chunk.length;
      if (bytes > limit) {
        failed = true;
        reject(Object.assign(new Error("Desk request body exceeds 8 MiB"), { code: "body-too-large", status: 413 }));
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => { if (!failed) resolve(Buffer.concat(chunks).toString("utf8")); });
    req.on("error", reject);
    req.on("aborted", () => reject(Object.assign(new Error("Request body interrupted"), { code: "request-aborted", status: 400 })));
  });
}

/**
 * Local loopback adapter around the desk library.
 * Not an Express mount on the live SameDayDesk app. Not a daemon product.
 * HTTP result cache is not used here; durable state is the desk store.
 */
export function createLocalDeskServer(desk, { host = "127.0.0.1", port = 0 } = {}) {
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw Object.assign(new Error("Desk HTTP binds loopback only"), { code: "loopback-required" });
  }
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${host}`);
    const send = (status, body) => {
      if (res.destroyed || res.writableEnded) return;
      const payload = JSON.stringify(body);
      res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "content-length": Buffer.byteLength(payload),
        "cache-control": "no-store",
      });
      res.end(payload);
    };

    try {
      if (req.method === "POST" && url.pathname === "/v1/requests") {
        const raw = await readBody(req);
        let body;
        try { body = JSON.parse(raw || "{}"); }
        catch (err) { send(400, { ok: false, refused: true, code: "invalid-json", error: err.message, sold: false }); return; }
        const result = desk.createRequest(body);
        send(result.ok ? 200 : 400, result);
        return;
      }
      const getMatch = url.pathname.match(/^\/v1\/requests\/([0-9a-f]{64})$/);
      if (req.method === "GET" && getMatch) {
        send(200, desk.getRequest(getMatch[1]));
        return;
      }
      if (req.method === "GET" && url.pathname === "/v1/requests") {
        const engineId = url.searchParams.get("engineId") || undefined;
        send(200, desk.listRequests({ engineId }));
        return;
      }
      send(404, { ok: false, refused: true, code: "not-found", sold: false });
    } catch (err) {
      send(err.status || 500, { ok: false, refused: true, code: err.code || "internal-error", error: err.message, sold: false });
    }
  });

  return {
    listen() {
      return new Promise((resolve) => {
        server.listen(port, host, () => {
          const addr = server.address();
          resolve({
            server,
            host,
            port: addr.port,
            baseUrl: `http://${host}:${addr.port}`,
            close: () =>
              new Promise((done, reject) => {
                server.close((err) => (err ? reject(err) : done()));
              }),
          });
        });
      });
    },
  };
}
