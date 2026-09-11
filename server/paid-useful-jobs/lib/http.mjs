/**
 * Thin local HTTP adapter over the D01 execution contract.
 * Not a second runner and not a public deploy. D14 owns an independent consumer.
 */
import { createServer } from "node:http";
import { EXECUTION_CONTRACT_VERSION } from "./contract.mjs";
import { runPaidOffer } from "./wrapper.mjs";

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function createExecutionServer({ execute = runPaidOffer } = {}) {
  const store = new Map();
  const server = createServer((req, res) => {
    const url = req.url || "/";
    const end = (status, body) => {
      const text = JSON.stringify(body);
      res.writeHead(status, {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(text),
      });
      res.end(text);
    };

    if (req.method === "GET" && url === "/health") {
      end(200, { ok: true, contract: EXECUTION_CONTRACT_VERSION });
      return;
    }

    if (req.method === "GET" && url.startsWith("/results/")) {
      const id = decodeURIComponent(url.slice("/results/".length).split("?")[0]);
      const row = store.get(id);
      if (!row) {
        end(404, { ok: false, code: "not-found", contract: EXECUTION_CONTRACT_VERSION });
        return;
      }
      end(200, row);
      return;
    }

    if (req.method === "POST" && (url === "/execute" || url === "/execute/")) {
      readBody(req)
        .then(async (raw) => {
          let request;
          try {
            request = JSON.parse(raw || "{}");
          } catch (err) {
            end(400, {
              ok: false,
              code: "invalid-json",
              error: err.message,
              contract: EXECUTION_CONTRACT_VERSION,
            });
            return;
          }
          const result = await execute(request);
          const id = result.executionId || result.receipt?.inputsDigest || result.jobId || "anonymous";
          store.set(id, result);
          end(200, { ...result, retrieval: { id, path: `/results/${id}` } });
        })
        .catch((err) => {
          end(500, {
            ok: false,
            code: "internal-error",
            error: err.message,
            contract: EXECUTION_CONTRACT_VERSION,
          });
        });
      return;
    }

    end(404, { ok: false, code: "not-found", contract: EXECUTION_CONTRACT_VERSION });
  });
  return { server, store };
}

export function listenExecutionServer(server, { host = "127.0.0.1", port = 0 } = {}) {
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const addr = server.address();
      resolve({ host, port: addr.port, origin: `http://${host}:${addr.port}` });
    });
  });
}
