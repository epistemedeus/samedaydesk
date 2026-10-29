#!/usr/bin/env node
/**
 * Local-runtime capture of an unpaid extract HTTP 402.
 * This is not live extract against agents.samedaydesk.com and is not a payment.
 */
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { packDossier } from "./pack.mjs";

export async function captureExtract402Http() {
  const payload = {
    x402Version: 2,
    error: "PAYMENT_REQUIRED",
    paid: false,
    sold: false,
    success: false,
  };
  const server = createServer((req, res) => {
    res.writeHead(402, { "content-type": "application/json" });
    res.end(JSON.stringify(payload));
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const { port } = server.address();
  try {
    const path = "/extract?url=https://example.com";
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    const status = response.status;
    const body = await response.json();
    return {
      class: "local-runtime",
      http: { method: "GET", path: "/extract", status },
      body: {
        ...body,
        expectedStatus: 402,
      },
    };
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const capture = await captureExtract402Http();
  const packed = packDossier({
    items: [
      {
        sourceKind: "extract-unpaid",
        originClass: "local-runtime",
        http: capture.http,
        body: capture.body,
      },
    ],
  });
  process.stdout.write(`${JSON.stringify({ capture, packed }, null, 2)}\n`);
  process.exit(capture.http.status === 402 && packed.ok && packed.evidence[0].observationStatus === "observed" ? 0 : 2);
}
