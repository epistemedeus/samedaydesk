import { createServer } from "node:http";
import { READOUT_CONTRACT, SDS52_SHA } from "./pins.mjs";
import { classifyCohort } from "./cohort.mjs";
import { runDryRun } from "./dry-run.mjs";

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function health() {
  return {
    ok: true,
    contract: READOUT_CONTRACT,
    testedWrapperPin: SDS52_SHA,
    liveSettlement: "out-of-scope",
  };
}

export function createReadoutServer({ classify = classifyCohort, dryRun = runDryRun } = {}) {
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

    if (req.method === "GET" && (url === "/health" || url === "/contract")) {
      end(200, health());
      return;
    }

    if (req.method === "POST" && (url === "/readout" || url === "/readout/")) {
      readBody(req)
        .then((raw) => {
          let request;
          try {
            request = JSON.parse(raw || "{}");
          } catch (err) {
            end(400, { ok: false, code: "invalid-json", error: err.message, contract: READOUT_CONTRACT });
            return;
          }
          const observations = Array.isArray(request.observations) ? request.observations : [];
          end(200, classify(observations));
        })
        .catch((err) => {
          end(500, { ok: false, code: "internal-error", error: err.message, contract: READOUT_CONTRACT });
        });
      return;
    }

    if (req.method === "POST" && (url === "/dry-run" || url === "/dry-run/")) {
      readBody(req)
        .then(async (raw) => {
          let request;
          try {
            request = JSON.parse(raw || "{}");
          } catch (err) {
            end(400, { ok: false, code: "invalid-json", error: err.message, contract: READOUT_CONTRACT });
            return;
          }
          const body = await dryRun({
            buyerClass: request.buyerClass || request["buyer-class"] || "owner-qa",
            outDir: request.outDir,
          });
          end(200, body);
        })
        .catch((err) => {
          end(500, { ok: false, code: "internal-error", error: err.message, contract: READOUT_CONTRACT });
        });
      return;
    }

    end(404, { ok: false, code: "not-found", contract: READOUT_CONTRACT });
  });
  return { server };
}

export function listenReadoutServer({ host = "127.0.0.1", port = 0 } = {}) {
  const { server } = createReadoutServer();
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const address = server.address();
      resolve({ server, host: address.address, port: address.port });
    });
  });
}
