// One unresolved MCP edge: the protocol-version header on requests after initialize.
// Observed on the received apex router. This module does not change that router.
import { execFileSync } from "node:child_process";
import http from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createSdsApp } from "../../../server/app.js";
import { SELLER_REPAIR_PIN } from "./handoff.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function objectExists(rev) {
  try {
    execFileSync("git", ["cat-file", "-e", `${rev}^{commit}`], { cwd: repoRoot, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function worktreeClean(paths) {
  try {
    execFileSync("git", ["diff", "--quiet", "HEAD", "--", ...paths], { cwd: repoRoot, stdio: "ignore" });
    return true;
  } catch (err) {
    if (err.status === 1) return false;
    throw err;
  }
}

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
  const [{ default: checkoutRouter }, { isStripeConfigured }, { isValidSellerRepairFindingId, SELLER_CONTRACT_REPAIR_SLUG }, { sellerRepairFindingIds }] = await Promise.all([
    import("../../../server/routes/checkout.js"),
    import("../../../server/lib/stripe.js"),
    import("../../../server/lib/seller-repair-checkout.js"),
    import("../../../server/lib/pulse.js"),
  ]);
  const { createHash } = await import("node:crypto");
  const app = express();
  app.use(express.json());
  app.use("/api/checkout", checkoutRouter);
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/checkout/seller-repair-session`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ finding_id: "not-a-catalog-id" }),
    });
    const body = await response.json();
    const catalogIds = [...sellerRepairFindingIds].sort();
    return {
      access: "read-only",
      pin: SELLER_REPAIR_PIN,
      pinInClone: objectExists(SELLER_REPAIR_PIN),
      route: "POST /api/checkout/seller-repair-session",
      slug: SELLER_CONTRACT_REPAIR_SLUG,
      stripeConfigured: isStripeConfigured(),
      invalidFindingHttpStatus: response.status,
      invalidFindingError: body?.error ?? null,
      allowlistRejectsUnknown: isValidSellerRepairFindingId("not-a-catalog-id") === false,
      findingIsSellerBrief: isValidSellerRepairFindingId("mcp.unknownTool") === true,
      catalogCount: catalogIds.length,
      catalogSha256: createHash("sha256").update(catalogIds.join("\n")).digest("hex"),
      catalogUntouched: worktreeClean([
        "server/lib/seller-repair-checkout.js",
        "server/lib/pulse.js",
        "client/src/data/sellerRepairBriefs.ts",
      ]),
    };
  } finally {
    await close(server);
  }
}

export function protocolEdgeDocument({ apex, disposable }) {
  return {
    id: PROTOCOL_EDGE_ID,
    status: "unresolved",
    notRepairedHere: true,
    spec: "MCP 2025-11-25 Streamable HTTP requires HTTP 400 when MCP-Protocol-Version is invalid or unsupported. A stateless server that omits the header should assume 2025-03-26.",
    apex: {
      endpoint: "POST /mcp",
      negotiated: apex.negotiated,
      ...apex.followUp,
    },
    disposable: {
      endpoint: "POST /mcp",
      ...disposable,
    },
    probeGap: "server/lib/agent-readiness/probe.js rpc() does not send MCP-Protocol-Version after initialize.",
    serverGap: "server/routes/mcp.js allows the header in CORS and does not reject an unsupported value.",
    checkerGap: "mcp.version compares initialize result.protocolVersion only.",
    document: "tools/l08-agent-repair/research/mcp-protocol-version-header.md",
  };
}
