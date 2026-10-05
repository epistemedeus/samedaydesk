import http from "node:http";
import { URL } from "node:url";

/**
 * Local loopback adapter around the desk library.
 * Not an Express mount on the live SameDayDesk app. Not a daemon product.
 * Later binding: W4-commerce-20 may consume this shape; W4-02 mailbox uses resultUri.
 */
export function createLocalDeskServer(desk, { host = "127.0.0.1", port = 0 } = {}) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${host}`);
    const send = (status, body) => {
      const payload = JSON.stringify(body);
      res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "content-length": Buffer.byteLength(payload),
      });
      res.end(payload);
    };

    try {
      if (req.method === "POST" && url.pathname === "/v1/requests") {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
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
      send(500, { ok: false, refused: true, code: "internal-error", error: err.message, sold: false });
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
