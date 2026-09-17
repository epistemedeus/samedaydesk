import { envelope, failError } from "./envelope.mjs";
import {
  GATEWAY_ORIGIN,
  MCP_PROTOCOL,
  MCP_SERVER_INFO,
  MCP_TOOLS,
  PILOT_MCP_PROBE,
  SEEDED,
} from "./catalog.mjs";
import { httpRequest, previewBody } from "./http.mjs";
import { hasNodeModules } from "./repo.mjs";
import { readServeState, withHost } from "./serve.mjs";

function rpc(id, method, params) {
  const body = { jsonrpc: "2.0", id, method };
  if (params !== undefined) body.params = params;
  return body;
}

async function postMcp(url, payload) {
  const encoded = JSON.stringify(payload);
  if (encoded.includes('"tools/call"')) {
    const error = new Error("verify must not POST tools/call");
    error.code = "USAGE";
    throw error;
  }
  return httpRequest(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: encoded,
  });
}

async function listOnOrigin(origin) {
  const url = `${origin.replace(/\/$/, "")}/mcp`;
  const initialize = await postMcp(
    url,
    rpc(1, "initialize", {
      protocolVersion: MCP_PROTOCOL,
      capabilities: {},
      clientInfo: { name: "samedaydesk-verify", version: "1.0.0" },
    }),
  );
  const listed = await postMcp(url, rpc(2, "tools/list", {}));
  return { url, initialize, listed };
}

function toolNames(listed) {
  const tools = listed?.json?.result?.tools;
  if (!Array.isArray(tools)) return [];
  return tools.map((tool) => tool.name);
}

function normalizeTokens(tokens) {
  if (tokens[0] === "tools/list") return ["tools", "list", ...tokens.slice(1)];
  if (tokens[0] === "tools/call") return ["tools", "call", ...tokens.slice(1)];
  return tokens;
}

export async function runMcp(parsed, { root, dryRun = false } = {}) {
  const tokens = normalizeTokens(parsed.tokens);
  if (tokens[0] === "tools" && tokens[1] === "call") {
    return envelope({
      ok: false,
      command: "mcp",
      status: "usage",
      feature: "apex-mcp",
      error: failError("USAGE", "tools/call is out of verify scope; tools/list only, never POST payment"),
      boundary: { paymentSent: false, toolsCalled: false },
    });
  }

  const cite = tokens[0] === "cite-pilot" || tokens[0] === "live-gateway" || parsed.flags.citePilot;
  if (cite) {
    const evidence = [
      {
        kind: "pilot-probe",
        path: PILOT_MCP_PROBE,
        url: `${GATEWAY_ORIGIN}/mcp`,
        note: "Live gateway MCP stays on Pilot; this verifier cites it and does not fork a second platform.",
      },
    ];
    if (dryRun) {
      return envelope({
        ok: true,
        command: "mcp",
        dryRun: true,
        feature: "apex-mcp",
        evidence,
        boundary: { paymentSent: false, toolsCalled: false },
        result: { would: "cite-pilot", toolsCalled: false },
      });
    }
    return envelope({
      ok: true,
      command: "mcp",
      feature: "apex-mcp",
      evidence,
      boundary: { paymentSent: false, toolsCalled: false },
      result: {
        liveOwnerProbe: PILOT_MCP_PROBE,
        url: `${GATEWAY_ORIGIN}/mcp`,
        toolsCalled: false,
        forkedPlatform: false,
      },
    });
  }

  const listOnly =
    tokens.length === 0 ||
    (tokens[0] === "tools" && (tokens[1] == null || tokens[1] === "list")) ||
    tokens[0] === "list";
  if (!listOnly) {
    return envelope({
      ok: false,
      command: "mcp",
      status: "usage",
      error: failError("USAGE", "mcp tools/list  |  mcp cite-pilot"),
    });
  }

  const required = parsed.seededFailure
    ? [...MCP_TOOLS, SEEDED["missing-required-mcp-tool"].extraTool]
    : MCP_TOOLS;
  const evidence = [
    {
      kind: "argv",
      argv: ["node", "server/index.js", "POST /mcp initialize", "POST /mcp tools/list"],
    },
  ];

  if (dryRun) {
    return envelope({
      ok: true,
      command: "mcp",
      dryRun: true,
      feature: "apex-mcp",
      evidence,
      boundary: { paymentSent: false, toolsCalled: false },
      result: { would: "tools/list", required },
    });
  }

  if (!hasNodeModules(root)) {
    return envelope({
      ok: false,
      command: "mcp",
      feature: "apex-mcp",
      evidence,
      error: failError("HOST_BUILD", "root node_modules missing; npm ci before mcp tools/list"),
    });
  }

  const origin = parsed.flags.origin || readServeState(root)?.origin || null;

  async function evaluate(session) {
    evidence.push({
      kind: "http",
      initialize: {
        status: session.initialize.status,
        protocol: session.initialize.json?.result?.protocolVersion || null,
        serverInfo: session.initialize.json?.result?.serverInfo || null,
        preview: previewBody(session.initialize.body),
      },
      list: {
        status: session.listed.status,
        preview: previewBody(session.listed.body, 400),
      },
    });
    if (session.initialize.kind === "network" || session.listed.kind === "network") {
      return envelope({
        ok: false,
        command: "mcp",
        feature: "apex-mcp",
        evidence,
        error: failError("HOST_BUILD", "MCP HTTP failed", {
          initialize: session.initialize.body,
          list: session.listed.body,
        }),
        boundary: { paymentSent: false, toolsCalled: false },
      });
    }
    if (session.initialize.kind === "cdn_challenge" || session.listed.kind === "cdn_challenge") {
      return envelope({
        ok: false,
        command: "mcp",
        feature: "apex-mcp",
        evidence,
        error: failError("cdn_challenge", "MCP HTTP returned hcdn challenge, not product 200"),
        boundary: { paymentSent: false, toolsCalled: false },
      });
    }
    const names = toolNames(session.listed);
    evidence.push({ kind: "mcp-tools", names, listedBeforeCall: true, required });
    const missing = required.filter((name) => !names.includes(name));
    const protocol = session.initialize.json?.result?.protocolVersion;
    const info = session.initialize.json?.result?.serverInfo;
    if (protocol !== MCP_PROTOCOL) {
      return envelope({
        ok: false,
        command: "mcp",
        feature: "apex-mcp",
        evidence,
        error: failError("HOST_BUILD", `apex MCP protocol must be ${MCP_PROTOCOL}`, { protocol }),
        boundary: { paymentSent: false, toolsCalled: false },
      });
    }
    if (info?.name !== MCP_SERVER_INFO.name) {
      return envelope({
        ok: false,
        command: "mcp",
        feature: "apex-mcp",
        evidence,
        error: failError("HOST_BUILD", "unexpected MCP serverInfo", { info }),
        boundary: { paymentSent: false, toolsCalled: false },
      });
    }
    if (missing.length) {
      return envelope({
        ok: false,
        command: "mcp",
        feature: "apex-mcp",
        evidence,
        error: failError("SEED_REJECT", "missing required MCP tool", { missing, names }),
        boundary: { paymentSent: false, toolsCalled: false },
        result: { tools: names, missing, listedBeforeCall: true },
      });
    }
    return envelope({
      ok: true,
      command: "mcp",
      feature: "apex-mcp",
      evidence,
      boundary: { paymentSent: false, toolsCalled: false },
      result: {
        tools: names,
        protocol,
        serverInfo: info,
        listedBeforeCall: true,
        toolsCalled: false,
        shippedProcess: "server/index.js",
      },
    });
  }

  try {
    if (origin) {
      return await evaluate(await listOnOrigin(origin));
    }
    return await withHost(root, async (handle) => evaluate(await listOnOrigin(handle.origin)));
  } catch (error) {
    return envelope({
      ok: false,
      command: "mcp",
      feature: "apex-mcp",
      evidence,
      status: error.code === "USAGE" ? "usage" : "error",
      error: failError(error.code === "USAGE" ? "USAGE" : "RUNTIME", error.message, error.detail),
      boundary: { paymentSent: false, toolsCalled: false },
    });
  }
}
