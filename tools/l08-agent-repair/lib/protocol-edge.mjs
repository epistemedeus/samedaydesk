// Protocol-version header on requests after initialize.
// The apex router rejects an unsupported value. This module only observes it.
import http from "node:http";
import { createSdsApp } from "../../../server/app.js";
import { observeSellerRepairCold } from "./seller-repair-cold.mjs";

export const UNSUPPORTED_PROTOCOL_HEADER = "1999-01-01";
export const PROTOCOL_EDGE_ID = "mcp-protocol-version-header";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
    server.closeAllConnections();
  });
}

export async function postToolsList(origin, protocolHeader) {
  const response = await fetch(`${origin}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": protocolHeader,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return {
    header: `MCP-Protocol-Version: ${protocolHeader}`,
    observedStatus: response.status,
    requiredStatus: 400,
    hasResult: json?.result !== undefined,
    hasError: json?.error !== undefined,
  };
}

export async function observeApexProtocolEdge() {
  const app = createSdsApp();
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const origin = `http://127.0.0.1:${port}`;
    const init = await fetch(`${origin}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "l08-protocol-edge", version: "0" },
        },
      }),
    });
    const initBody = await init.json();
    const followUp = await postToolsList(origin, UNSUPPORTED_PROTOCOL_HEADER);
    const page = await fetch(`${origin}/agent-readiness`);
    const pageText = await page.text();
    return {
      initializeStatus: init.status,
      negotiated: initBody?.result?.protocolVersion ?? null,
      followUp,
      agentReadinessStatus: page.status,
      agentReadinessMounted: pageText.includes("Can an agent discover and call this site?"),
    };
  } finally {
    await close(server);
  }
}

export async function receiveSellerRepairRoute() {
  return observeSellerRepairCold();
}

export function protocolEdgeDocument({ apex, disposable }) {
  const apexRepaired = apex.followUp.observedStatus === 400
    && apex.followUp.requiredStatus === 400
    && apex.followUp.hasResult === false;
  return {
    id: PROTOCOL_EDGE_ID,
    status: apexRepaired ? "repaired" : "unresolved",
    notRepairedHere: !apexRepaired,
    repairedBy: apexRepaired ? "server/routes/mcp.js" : null,
    missingHeader: "accepted",
    canonicalVersion: "2025-11-25",
    spec: "An unsupported MCP-Protocol-Version on a request after initialize is HTTP 400. A missing header stays accepted. Initialize negotiates the body version. The TypeScript SDK validates the header the same way.",
    apex: {
      endpoint: "POST /mcp",
      negotiated: apex.negotiated,
      repaired: apexRepaired,
      ...apex.followUp,
    },
    disposable: {
      endpoint: "POST /mcp",
      ignoresHeader: true,
      ...disposable,
    },
    disposableIgnoresHeader: true,
    probeGap: "server/lib/agent-readiness/probe.js rpc() does not send MCP-Protocol-Version after initialize. A missing header remains valid for that client.",
    serverGap: apexRepaired ? null : "server/routes/mcp.js allows the header in CORS and does not reject an unsupported value.",
    checkerGap: "mcp.version compares initialize result.protocolVersion only.",
    document: "tools/l08-agent-repair/research/mcp-protocol-version-header.md",
  };
}
