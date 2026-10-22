import { createServer } from "node:http";
import { describeSelectedOffer } from "./describe.mjs";
import { loadSources } from "./sources.mjs";
import { OFFER_SCHEMA } from "./schema.mjs";

function send(res, status, body) {
  const text = `${JSON.stringify(body, null, 2)}\n`;
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

export async function createOfferServer({ sources = null } = {}) {
  const loaded = sources || (await loadSources());
  const offer = describeSelectedOffer(loaded);
  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/health") {
      send(res, 200, {
        ok: true,
        schema: OFFER_SCHEMA,
        offerId: offer.offerId,
        liveSettlement: "out-of-scope",
      });
      return;
    }
    if (req.method === "GET" && (url.pathname === "/offer" || url.pathname === "/")) {
      send(res, 200, offer);
      return;
    }
    send(res, 404, { ok: false, code: "not-found" });
  });
  return { server, offer };
}

export function listenOfferServer(server, { host = "127.0.0.1", port = 0 } = {}) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const addr = server.address();
      resolve({ host: addr.address, port: addr.port });
    });
  });
}
