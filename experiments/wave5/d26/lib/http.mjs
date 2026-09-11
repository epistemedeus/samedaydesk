import http from "node:http";
import { runExperiment } from "./experiment.mjs";
import { ASSIGNMENT_ID, TESTED_SDS_SHA } from "./pins.mjs";

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

export function createExperimentServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const send = (status, body) => {
      const json = `${JSON.stringify(body, null, 2)}\n`;
      res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "content-length": Buffer.byteLength(json),
      });
      res.end(json);
    };

    try {
      if (req.method === "GET" && url.pathname === "/health") {
        return send(200, {
          ok: true,
          assignment: ASSIGNMENT_ID,
          liveSettleAttempted: false,
          testedSha: TESTED_SDS_SHA,
        });
      }
      if (req.method === "POST" && url.pathname === "/experiment") {
        const body = await readJson(req);
        const result = runExperiment({
          buyerClass: body.buyerClass || "owner-qa",
          jobId: body.jobId,
          railId: body.railId,
          proposedPriceUsdc: body.proposedPriceUsdc,
          example: body.example === true,
          settle: body.settle === true,
          feeTier: body.feeTier,
          citedBankedAsCostCover: body.citedBankedAsCostCover === true,
          includeOperation: body.includeOperation,
          forceUnlikeUnitsEqual: body.forceUnlikeUnitsEqual === true,
          certifyAsX402Offer: body.certifyAsX402Offer === true,
          independentDemand: body.independentDemand === true,
          confirmJob: body.confirmJob,
        });
        return send(result.ok ? 200 : 422, result);
      }
      send(404, { ok: false, code: "not-found", error: `${req.method} ${url.pathname}` });
    } catch (err) {
      send(500, {
        ok: false,
        certified: false,
        code: "wrapper-failure-is-not-cost-basis",
        error: err.message || String(err),
      });
    }
  });
}

export function listen(port = 0, host = "127.0.0.1") {
  const server = createExperimentServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(Number(port), host, () => {
      const address = server.address();
      resolve({
        server,
        host,
        port: address.port,
        url: `http://${host}:${address.port}`,
      });
    });
  });
}
