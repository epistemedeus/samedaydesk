import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ABSENT_TOOL_NAME,
  APEX_TOOLS,
  MCP_PROTOCOL,
  SEEDED_IDS,
} from "./catalog.mjs";
import { envelope, failError } from "./envelope.mjs";
import { isJsonRpc32602, judgeApexSession, sessionChecks } from "./judge.mjs";
import { probeApex, startSeedServer, withShippedHost } from "./session.mjs";

function loadSeed(root, id) {
  const path = join(root, "tools/verify/fixtures/seeded", `${id}.json`);
  const fixture = JSON.parse(readFileSync(path, "utf8"));
  if (fixture.id !== id) {
    throw Object.assign(new Error(`seed id mismatch in ${id}.json`), { code: "USAGE" });
  }
  return fixture;
}

function sourceNotes(root) {
  let protocol = null;
  let inventory = null;
  try {
    const mcp = readFileSync(join(root, "server/routes/mcp.js"), "utf8");
    const match = mcp.match(/const PROTOCOL_VERSION = "([^"]+)"/);
    protocol = match ? match[1] : null;
  } catch {
    protocol = null;
  }
  try {
    const inventoryText = readFileSync(join(root, "server/lib/mcp-tool-inventory.js"), "utf8");
    const start = inventoryText.indexOf("[");
    const end = inventoryText.indexOf("]");
    const block = start >= 0 && end > start ? inventoryText.slice(start, end + 1) : "";
    inventory = [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  } catch {
    inventory = null;
  }
  return { protocol, inventory };
}

function resultBody(session, verdict, extra = {}) {
  return {
    protocol: session.protocol,
    tools: verdict.detail.actual,
    toolCount: verdict.detail.toolCount,
    serverInfo: session.serverInfo,
    listedBeforeCall: true,
    absentTool: {
      name: ABSENT_TOOL_NAME,
      errorCode: verdict.detail.absentErrorCode,
      jsonrpc32602: isJsonRpc32602(session?.absent),
    },
    gatewayClient: false,
    checks: sessionChecks(session, verdict),
    ...extra,
  };
}

function fromVerdict(session, verdict, { evidence, seededId, host = null, dryRun = false }) {
  const extra = seededId ? { seeded: true, seededId } : { host: host || "server/index.js" };
  const result = resultBody(session, verdict, extra);
  if (verdict.ok) {
    return envelope({
      ok: true,
      command: "mcp",
      feature: "apex-mcp",
      dryRun,
      evidence,
      result,
    });
  }
  return envelope({
    ok: false,
    command: "mcp",
    feature: "apex-mcp",
    dryRun,
    evidence,
    error: failError(verdict.code, verdict.message, {
      ...verdict.detail,
      ...(seededId ? { seeded: true, seededId } : {}),
    }),
    result,
  });
}

function transportFailure(probe) {
  if (probe.initialize.status !== 200 || !probe.initialize.json) {
    return "initialize did not return JSON";
  }
  if (probe.listed.status !== 200 || !probe.listed.json) {
    return "tools/list did not return JSON";
  }
  if (!probe.absent.json) {
    return "absent tools/call did not return JSON";
  }
  return null;
}

export function commandKind(tokens) {
  const rest = tokens[0] === "mcp" ? tokens.slice(1) : tokens.slice();
  if (rest.length === 0) return { kind: "probe" };
  const head = rest[0];
  if (head === "cite-pilot" || head === "live-gateway" || head === "gateway") {
    return { kind: "gateway-refuse" };
  }
  if (head === "tools/list" || head === "list" || (head === "tools" && (rest[1] == null || rest[1] === "list"))) {
    return { kind: "probe" };
  }
  if (head === "tools/call" || (head === "tools" && rest[1] === "call")) {
    const name = head === "tools/call" ? rest[1] : rest[2];
    return { kind: "call", name: name || "" };
  }
  return { kind: "usage", message: `unknown mcp command ${tokens.join(" ")}` };
}

export async function runMcp({
  root,
  tokens = [],
  seeded = null,
  origin = null,
  dryRun = false,
} = {}) {
  if (seeded) {
    if (!SEEDED_IDS.includes(seeded)) {
      return envelope({
        ok: false,
        command: "mcp",
        feature: "apex-mcp",
        status: "usage",
        error: failError("USAGE", `unknown seeded failure ${seeded}`, { known: [...SEEDED_IDS] }),
      });
    }
    const fixture = loadSeed(root, seeded);
    const seed = await startSeedServer(fixture);
    try {
      const probe = await probeApex(seed.origin);
      const broken = transportFailure(probe);
      const evidence = [
        { kind: "seed-fixture", id: seeded, path: `tools/verify/fixtures/seeded/${seeded}.json` },
        {
          kind: "http",
          origin: seed.origin,
          note: "loopback fixture, not a gateway client",
          steps: probe.steps,
          statuses: {
            initialize: probe.initialize.status,
            list: probe.listed.status,
            absent: probe.absent.status,
          },
        },
      ];
      if (broken) {
        return envelope({
          ok: false,
          command: "mcp",
          feature: "apex-mcp",
          evidence,
          error: failError("HOST_BUILD", broken, { seeded: true, seededId: seeded }),
        });
      }
      const verdict = judgeApexSession(probe.session);
      if (verdict.ok) {
        return envelope({
          ok: false,
          command: "mcp",
          feature: "apex-mcp",
          evidence,
          error: failError("SEED_ACCEPT", "seeded failure was accepted as this host", {
            seeded: true,
            seededId: seeded,
          }),
          result: resultBody(probe.session, verdict, { seeded: true, seededId: seeded }),
        });
      }
      return fromVerdict(probe.session, verdict, { evidence, seededId: seeded });
    } finally {
      await seed.close();
    }
  }

  const kind = commandKind(tokens);
  if (kind.kind === "gateway-refuse") {
    return envelope({
      ok: false,
      command: "mcp",
      feature: "apex-mcp",
      error: failError(
        "GATEWAY_CLIENT_REFUSE",
        "refusing gateway client command; apex MCP verify does not call the gateway",
      ),
      result: { gatewayClient: false },
    });
  }
  if (kind.kind === "usage") {
    return envelope({
      ok: false,
      command: "mcp",
      feature: "apex-mcp",
      status: "usage",
      error: failError("USAGE", kind.message),
    });
  }
  if (kind.kind === "call") {
    return envelope({
      ok: false,
      command: "mcp",
      feature: "apex-mcp",
      error: failError(
        "TOOL_CALL_REFUSE",
        "refusing named tools/call; the verifier probes only an absent name after tools/list",
        { name: kind.name || null },
      ),
      result: { gatewayClient: false, toolsCalled: false },
    });
  }

  if (dryRun) {
    return envelope({
      ok: true,
      command: "mcp",
      feature: "apex-mcp",
      dryRun: true,
      evidence: [{ kind: "argv", argv: ["node", "server/index.js"] }],
      result: {
        would: "spawn server/index.js, initialize, tools/list, then absent tools/call",
        protocol: MCP_PROTOCOL,
        tools: [...APEX_TOOLS],
        absentToolName: ABSENT_TOOL_NAME,
        gatewayClient: false,
      },
    });
  }

  const notes = sourceNotes(root);
  const evidence = [
    {
      kind: "source",
      protocol: notes.protocol,
      inventory: notes.inventory,
      shippedProcess: "server/index.js",
    },
  ];

  try {
    const evaluate = async (handle) => {
      const probe = await probeApex(handle.origin);
      evidence.push({
        kind: "http",
        origin: handle.origin,
        mcpUrl: probe.mcpUrl,
        steps: probe.steps,
        statuses: {
          initialize: probe.initialize.status,
          list: probe.listed.status,
          absent: probe.absent.status,
        },
        gatewayClient: false,
      });
      const broken = transportFailure(probe);
      if (broken) {
        return envelope({
          ok: false,
          command: "mcp",
          feature: "apex-mcp",
          evidence,
          error: failError("HOST_BUILD", broken),
        });
      }
      return fromVerdict(probe.session, judgeApexSession(probe.session), {
        evidence,
        host: handle.host,
      });
    };

    if (origin) {
      return await evaluate({ origin, host: "loopback-origin" });
    }
    return await withShippedHost(root, (handle) => evaluate({ ...handle, host: "server/index.js" }));
  } catch (error) {
    return envelope({
      ok: false,
      command: "mcp",
      feature: "apex-mcp",
      status: error.code === "USAGE" ? "usage" : "fail",
      evidence,
      error: failError(error.code === "USAGE" ? "USAGE" : "HOST_BUILD", error.message, {
        logs: error.logs || undefined,
      }),
    });
  }
}
