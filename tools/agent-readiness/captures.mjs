// Structural captures for the known hosts and the held-out fixtures.
// Bodies are reduced from the 2026-09-30 public read (and the 2026-09-03
// presence pin for the gateway server name). They are not a byte archive.
// Item counts and server versions are evidence, not score inputs.

import { APEX_ORIGIN, APEX_SERVER_NAME, GATEWAY_ORIGIN, GATEWAY_SERVER_NAME } from "./shape.mjs";

export const GATEWAY_TOOL_NAMES = Object.freeze([
  "extract",
  "extract_batch",
  "lockfile_pin_delta",
  "read",
  "scan",
  "schemaforge",
  "enrich",
  "wallet_enrich",
  "deep_audit",
  "morpho_position",
  "morpho_protection",
  "morpho_market_underwrite",
  "morpho_preliquidation_replay",
  "opportunity_preflight",
  "agent_discoverability_audit",
  "payment_offer_preflight",
  "seller_integrity_audit",
  "contract_qualified_search",
  "agent_surface_budget_audit",
  "settlement_proof",
  "transaction_receipt",
  "solana_transaction_receipt",
  "wallet_policy_conformance",
  "stateful_wallet_policy_conformance",
  "page_change",
]);

export const APEX_TOOL_NAMES = Object.freeze([
  "check_ai_readiness",
  "generate_complete_fix_pack",
  "plan_taskmarket_delegation",
  "browse_taskmarket_tasks",
  "track_taskmarket_task",
]);

const ROBOTS = "User-agent: *\nAllow: /\nSitemap: https://samedaydesk.com/sitemap.xml\n";
const APEX_LLMS = "# SameDayDesk\n\n- https://samedaydesk.com/mcp\n- https://agents.samedaydesk.com/mcp\n";
const GATEWAY_LLMS = "# SameDayDesk machine commerce gateway\n\nPayment-offer preflight and x402 routes.\n";
const EIN_LLMS = "# EIN.LLC\n\nForm a US LLC and get an EIN.\n";
const NEO_LLMS = "# Neomorphic\n\nNeomorphic LLC operates the public laboratory at neomorphic.io.\n";

function text(body, contentType = "text/plain; charset=utf-8") {
  return { status: 200, contentType, body };
}

function json(body, extra = {}) {
  return { status: 200, contentType: "application/json; charset=utf-8", body, ...extra };
}

function missing() {
  return { status: 404, contentType: "text/plain", body: "Not found\n" };
}

function toolsDocument(names, id = 2) {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      tools: names.map((name) => ({
        name,
        description: `${name} advertised tool`,
        inputSchema: { type: "object", properties: {} },
      })),
    },
  };
}

function sse(payload) {
  return {
    status: 200,
    contentType: "text/event-stream",
    body: `event: message\ndata: ${JSON.stringify(payload)}\n\n`,
  };
}

function initialize({ id = 1, protocolVersion, name, version }) {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      protocolVersion,
      capabilities: { tools: {} },
      serverInfo: { name, version },
    },
  };
}

const AGENT_CARD = {
  name: "SameDayDesk machine commerce storefront",
  description: "Discovers exact-price x402 data and risk actions that settle USDC on Base.",
  version: "1.23.49",
  supportedInterfaces: [
    { url: "https://agents.samedaydesk.com/a2a", protocolBinding: "HTTP+JSON", protocolVersion: "1.0" },
  ],
  provider: { organization: "Neomorphic LLC", url: "https://samedaydesk.com" },
  capabilities: { streaming: true },
  skills: [{ id: "extract", name: "Extract" }],
};

const X402_MANIFEST = {
  x402Version: 2,
  items: [
    {
      resource: { url: "https://agents.samedaydesk.com/extract" },
      accepts: [{ scheme: "exact", network: "eip155:8453", amount: "5000" }],
    },
    {
      resource: { url: "https://agents.samedaydesk.com/read" },
      accepts: [{ scheme: "exact", network: "eip155:8453", amount: "5000" }],
    },
  ],
};

const APEX_CORS = {
  status: 204,
  contentType: "",
  body: "",
  headers: {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version",
  },
};

const GATEWAY_CORS = {
  status: 204,
  contentType: "",
  body: "",
  headers: {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  },
};

function apexResponses(overrides = {}) {
  return {
    "GET /llms.txt": text(APEX_LLMS),
    "GET /robots.txt": text(ROBOTS),
    "GET /.well-known/mcp.json": missing(),
    "GET /.well-known/mcp-registry-auth": text("v=MCPv1; k=ed25519; p=fixture-public\n"),
    "GET /.well-known/agent-card.json": {
      status: 308,
      contentType: "",
      body: "",
      headers: { location: "https://agents.samedaydesk.com/.well-known/agent-card.json" },
      followed: json(AGENT_CARD, { finalUrl: "https://agents.samedaydesk.com/.well-known/agent-card.json" }),
    },
    "GET /.well-known/x402": missing(),
    "OPTIONS /mcp": APEX_CORS,
    "POST /mcp initialize": json(initialize({
      protocolVersion: "2024-11-05",
      name: APEX_SERVER_NAME,
      version: "1.2.0",
    }), { requestId: 1 }),
    "POST /mcp tools/list": json(toolsDocument(APEX_TOOL_NAMES), { requestId: 2 }),
    ...overrides,
  };
}

export const CAPTURES = Object.freeze([
  {
    id: "samedaydesk-apex",
    label: "SameDayDesk apex",
    origin: APEX_ORIGIN,
    role: "apex",
    heldOut: false,
    evidence: "2026-09-30 public read of samedaydesk.com; MCP matches server/routes/mcp.js",
    responses: apexResponses(),
  },
  {
    id: "agents-gateway",
    label: "SameDayDesk machine gateway",
    origin: GATEWAY_ORIGIN,
    role: "gateway",
    heldOut: false,
    evidence: "2026-09-30 public read. Presence pin 2026-09-03 had server version 1.23.40 and 23 x402 items; this read had 1.23.49 and 25 items. The score uses shape, not the count.",
    responses: {
      "GET /llms.txt": text(GATEWAY_LLMS),
      "GET /robots.txt": text("User-agent: *\nAllow: /\nSitemap: https://agents.samedaydesk.com/sitemap.xml\n"),
      "GET /.well-known/mcp.json": missing(),
      "GET /.well-known/mcp-registry-auth": missing(),
      "GET /.well-known/agent-card.json": json(AGENT_CARD, { finalUrl: "https://agents.samedaydesk.com/.well-known/agent-card.json" }),
      "GET /.well-known/x402": json(X402_MANIFEST, { finalUrl: "https://agents.samedaydesk.com/.well-known/x402" }),
      "OPTIONS /mcp": GATEWAY_CORS,
      "POST /mcp initialize": {
        ...sse(initialize({
          protocolVersion: "2025-03-26",
          name: GATEWAY_SERVER_NAME,
          version: "1.23.49",
        })),
        requestId: 1,
      },
      "POST /mcp tools/list": {
        ...sse(toolsDocument(GATEWAY_TOOL_NAMES)),
        requestId: 2,
      },
    },
  },
  {
    id: "ein-llc",
    label: "EIN.LLC",
    origin: "https://ein.llc",
    role: "portfolio",
    heldOut: false,
    evidence: "2026-09-30 public read. llms.txt and robots.txt are text. Agent card and MCP are 404.",
    responses: {
      "GET /llms.txt": text(EIN_LLMS),
      "GET /robots.txt": text("# robots.txt for ein.llc.\nUser-agent: *\nAllow: /\n"),
      "GET /.well-known/mcp.json": missing(),
      "GET /.well-known/mcp-registry-auth": missing(),
      "GET /.well-known/agent-card.json": missing(),
      "GET /.well-known/x402": missing(),
      "OPTIONS /mcp": { status: 404, contentType: "text/html", body: "<!doctype html><title>Error</title>", unobserved: false },
      "POST /mcp initialize": { status: 404, contentType: "text/html", body: "<!doctype html><title>Error</title>", requestId: 1 },
      "POST /mcp tools/list": { status: 404, contentType: "text/html", body: "<!doctype html><title>Error</title>", requestId: 2 },
    },
  },
  {
    id: "neomorphic-io",
    label: "Neomorphic.io",
    origin: "https://neomorphic.io",
    role: "portfolio",
    heldOut: false,
    evidence: "2026-09-30 checker read, redirects not followed. /mcp is HTTP 301 to /mcp/. /.well-known/x402 is JSON with version and resources, not x402Version and items.",
    responses: {
      "GET /llms.txt": text(NEO_LLMS),
      "GET /robots.txt": text("User-agent: *\nAllow: /\nUser-agent: GPTBot\nAllow: /\n"),
      "GET /.well-known/mcp.json": missing(),
      "GET /.well-known/mcp-registry-auth": missing(),
      "GET /.well-known/agent-card.json": missing(),
      "GET /.well-known/x402": json('{"version":1,"resources":[],"instructions":"No x402 payable resources are currently published at this origin."}\n'),
      "OPTIONS /mcp": {
        status: 301,
        contentType: "text/html",
        headers: { location: "https://neomorphic.io/mcp/" },
        body: "<!DOCTYPE html><title>301 Moved Permanently</title>",
      },
      "POST /mcp initialize": {
        status: 301,
        contentType: "text/html",
        headers: { location: "https://neomorphic.io/mcp/" },
        body: "<!DOCTYPE html><title>301 Moved Permanently</title>",
        requestId: 1,
      },
      "POST /mcp tools/list": {
        status: 301,
        contentType: "text/html",
        headers: { location: "https://neomorphic.io/mcp/" },
        body: "<!DOCTYPE html><title>301 Moved Permanently</title>",
        requestId: 2,
      },
    },
  },
  {
    id: "held-out-seed",
    label: "Held-out fixture host",
    origin: "https://held-out.fixture.invalid",
    role: "apex",
    heldOut: true,
    evidence: "Seeded. Same surfaces as the apex except the handshake version and the tools/list id.",
    responses: apexResponses({
      "POST /mcp initialize": json(initialize({
        protocolVersion: "1999-01-01",
        name: APEX_SERVER_NAME,
        version: "1.2.0",
      }), { requestId: 1 }),
      "POST /mcp tools/list": json(toolsDocument(APEX_TOOL_NAMES, 99), { requestId: 2 }),
    }),
  },
  {
    id: "malformed-discovery",
    label: "Malformed discovery fixture",
    origin: "https://malformed-discovery.fixture.invalid",
    role: "apex",
    heldOut: true,
    evidence: "Seeded. A 200 JSON array is not an MCP discovery document, and HTML is not llms.txt.",
    responses: apexResponses({
      "GET /llms.txt": { status: 200, contentType: "text/html", body: "<html>not llms</html>" },
      "GET /.well-known/mcp.json": json([]),
    }),
  },
  {
    id: "malformed-handshake",
    label: "Malformed handshake fixture",
    origin: "https://malformed-handshake.fixture.invalid",
    role: "apex",
    heldOut: true,
    evidence: "Seeded. jsonrpc 1.0 is not an MCP handshake.",
    responses: apexResponses({
      "POST /mcp initialize": json({
        jsonrpc: "1.0",
        id: 1,
        result: { protocolVersion: "2024-11-05", serverInfo: { name: APEX_SERVER_NAME, version: "1.2.0" } },
      }, { requestId: 1 }),
    }),
  },
  {
    id: "identity-conflict",
    label: "Cross-surface identity fixture",
    origin: APEX_ORIGIN,
    role: "apex",
    heldOut: true,
    evidence: "Seeded. Discovery name and serverInfo name disagree, and the apex serves an x402 manifest.",
    responses: apexResponses({
      "GET /.well-known/mcp.json": json({
        name: APEX_SERVER_NAME,
        description: "Apex discovery that does not match the handshake.",
      }),
      "GET /.well-known/x402": json({
        x402Version: 2,
        items: [{
          resource: { url: "https://samedaydesk.com/extract" },
          accepts: [{ amount: "5000" }],
        }],
      }, { finalUrl: "https://samedaydesk.com/.well-known/x402" }),
      "POST /mcp initialize": json(initialize({
        protocolVersion: "2024-11-05",
        name: GATEWAY_SERVER_NAME,
        version: "9.9.9",
      }), { requestId: 1 }),
    }),
  },
]);

export const KNOWN_HOST_IDS = Object.freeze([
  "samedaydesk-apex",
  "agents-gateway",
  "ein-llc",
  "neomorphic-io",
]);

export const SEEDED_HOST_IDS = Object.freeze([
  "held-out-seed",
  "malformed-discovery",
  "malformed-handshake",
  "identity-conflict",
]);

export function captureById(id) {
  const found = CAPTURES.find((capture) => capture.id === id);
  if (!found) throw new Error(`unknown capture ${id}`);
  return found;
}

export function knownCaptures() {
  return KNOWN_HOST_IDS.map(captureById);
}
