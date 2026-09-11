import http from "node:http";
import { SCHEMA, SDS52 } from "./pins.mjs";
import {
  applyProtectedSurface,
  consumeLatest,
  invokeSelectedOffer,
  reportError,
  runJourney,
  submitContribution,
} from "./integrate.mjs";
import { collectEvents, selectContribution } from "./events.mjs";

export function createDistributionServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const send = (status, body) => {
      const json = JSON.stringify(body);
      res.writeHead(status, {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(json),
      });
      res.end(json);
    };

    try {
      if (req.method === "GET" && url.pathname === "/health") {
        send(200, { ok: true, schema: SCHEMA, testedSha: SDS52, contract: SCHEMA });
        return;
      }
      if (req.method !== "POST") {
        send(405, { ok: false, code: "method-not-allowed" });
        return;
      }

      const raw = await readBody(req);
      let payload = {};
      if (raw.length) {
        try {
          payload = JSON.parse(raw);
        } catch {
          send(400, { ok: false, code: "invalid-json" });
          return;
        }
      }

      if (url.pathname === "/events") {
        send(200, await collectEvents());
        return;
      }
      if (url.pathname === "/select") {
        const events = await collectEvents();
        send(200, await selectContribution(events, payload));
        return;
      }
      if (url.pathname === "/submit") {
        if (payload.surface && payload.surface !== "mcp-registry") {
          send(200, await applyProtectedSurface(payload.surface));
          return;
        }
        const events = await collectEvents();
        const contribution = await selectContribution(events);
        send(200, await submitContribution(contribution, payload));
        return;
      }
      if (url.pathname === "/consume") {
        send(200, await consumeLatest(payload));
        return;
      }
      if (url.pathname === "/invoke") {
        send(200, invokeSelectedOffer(payload));
        return;
      }
      if (url.pathname === "/journey") {
        send(200, await runJourney(payload));
        return;
      }
      if (url.pathname === "/scan") {
        send(200, await runJourney({ scan: true, scanKind: payload.kind || "multi-surface-blast" }));
        return;
      }
      send(404, { ok: false, code: "not-found" });
    } catch (err) {
      send(200, reportError(err));
    }
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function listenDistributionServer(port = 0, host = "127.0.0.1") {
  const server = createDistributionServer();
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const addr = server.address();
      resolve({ server, url: `http://${addr.address}:${addr.port}` });
    });
  });
}
