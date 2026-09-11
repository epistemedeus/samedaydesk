import http from "node:http";
import { URL } from "node:url";
import { refusalPayload } from "./refuse.mjs";

export function createProjectionServer({ project, host = "127.0.0.1", port = 0 } = {}) {
  if (typeof project !== "function") {
    throw new Error("createProjectionServer requires a project() function");
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://${host}`);
    if (req.method !== "GET") {
      writeJson(res, 405, {
        ok: false,
        code: "execute_refund_refused",
        message: "this projector is read-only; refund and payout methods are refused",
      });
      return;
    }
    if (url.pathname === "/health") {
      writeJson(res, 200, {
        ok: true,
        mode: "read_only",
        stripeRefundsCalled: false,
        obligationsPostedAsPaid: false,
      });
      return;
    }
    if (url.pathname === "/projection" || url.pathname === "/projection.json") {
      try {
        const result = project();
        writeJson(res, result.ok ? 200 : 400, result);
      } catch (error) {
        writeJson(res, 400, refusalPayload(error));
      }
      return;
    }
    writeJson(res, 404, { ok: false, code: "not_found", message: "unknown path" });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      resolve({
        server,
        host,
        port: address.port,
        url: `http://${host}:${address.port}`,
        close: () =>
          new Promise((done, fail) => {
            server.close((err) => (err ? fail(err) : done()));
          }),
      });
    });
  });
}

function writeJson(res, status, body) {
  const payload = `${JSON.stringify(body)}\n`;
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}
