import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { APEX_TOOLS, MCP_PROTOCOL, RPC_REQUEST_ID } from "./lib/catalog.mjs";
import { isJsonRpc32602, judgeApexSession, sessionFromProbeResponses } from "./lib/judge.mjs";
import { originDecision } from "./lib/origin.mjs";
import { main } from "./cli.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const here = dirname(fileURLToPath(import.meta.url));

function goldenSession(overrides = {}) {
  return {
    protocol: MCP_PROTOCOL,
    serverInfo: { name: "samedaydesk-agent-tools", version: "1.2.0" },
    tools: APEX_TOOLS.map((name) => ({ name, inputSchema: { type: "object" } })),
    absent: {
      jsonrpc: "2.0",
      id: 3,
      error: { code: -32602, message: "Unknown tool: absent_tool_not_on_apex_host" },
    },
    ...overrides,
  };
}

function runCli(args, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(here, "cli.mjs"), ...args], {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        LANG: process.env.LANG || "C",
        TMPDIR: process.env.TMPDIR || "/tmp",
      },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`timeout: ${args.join(" ")}\n${stderr}`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      let json = null;
      try {
        json = JSON.parse(stdout);
      } catch {
        json = null;
      }
      resolve({ code, stdout, stderr, json });
    });
  });
}

test("judge accepts the apex five, protocol 2024-11-05, and absent -32602", () => {
  const verdict = judgeApexSession(goldenSession());
  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.detail.actual, [...APEX_TOOLS]);
  assert.equal(verdict.detail.protocol, "2024-11-05");
  assert.equal(verdict.detail.toolCount, 5);
});

test("judge rejects an absent tool that is not JSON-RPC -32602", () => {
  const isError = judgeApexSession(goldenSession({
    absent: {
      jsonrpc: "2.0",
      id: 3,
      result: { content: [{ type: "text", text: "unknown" }], isError: true },
    },
  }));
  assert.equal(isError.ok, false);
  assert.equal(isError.code, "ABSENT_TOOL_NOT_32602");

  const wrongCode = judgeApexSession(goldenSession({
    absent: { jsonrpc: "2.0", id: 3, error: { code: -32601, message: "Method not found" } },
  }));
  assert.equal(wrongCode.ok, false);
  assert.equal(wrongCode.code, "ABSENT_TOOL_NOT_32602");

  const both = judgeApexSession(goldenSession({
    absent: {
      jsonrpc: "2.0",
      id: 3,
      error: { code: -32602, message: "Unknown tool" },
      result: { isError: true },
    },
  }));
  assert.equal(both.ok, false);
  assert.equal(both.code, "ABSENT_TOOL_NOT_32602");
});

test("judge does not accept a 24-tool list as this host", () => {
  const tools = Array.from({ length: 24 }, (_, index) => ({
    name: `gateway_tool_${String(index + 1).padStart(2, "0")}`,
  }));
  const verdict = judgeApexSession(goldenSession({ tools }));
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, "GATEWAY_SURFACE");
  assert.equal(verdict.detail.toolCount, 24);
  assert.equal(verdict.detail.toolCount === 24 && verdict.ok, false);
});

test("judge rejects a non-apex protocol even when the five names match", () => {
  const verdict = judgeApexSession(goldenSession({ protocol: "2025-11-25" }));
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, "PROTOCOL");
});

test("origin policy refuses the gateway host before any client would run", () => {
  const gateway = originDecision("https://agents.samedaydesk.com/mcp");
  assert.equal(gateway.allow, false);
  assert.equal(gateway.code, "GATEWAY_CLIENT_REFUSE");
  const remote = originDecision("https://samedaydesk.com/mcp");
  assert.equal(remote.allow, false);
  assert.equal(remote.code, "REMOTE_CLIENT_REFUSE");
  const loop = originDecision("http://127.0.0.1:9/mcp");
  assert.equal(loop.allow, true);
});

test("session client source does not target the gateway", () => {
  const session = readFileSync(join(here, "lib/session.mjs"), "utf8");
  const mcp = readFileSync(join(here, "lib/mcp.mjs"), "utf8");
  assert.equal(session.includes("agents.samedaydesk.com"), false);
  assert.equal(mcp.includes("agents.samedaydesk.com"), false);
  assert.equal(session.includes("cite-pilot"), false);
  assert.equal(session.includes("generate_complete_fix_pack"), false);
});

test("seeded absent isError is rejected by the CLI", async () => {
  const result = await runCli(["--seeded-failure", "absent-tool-not-32602", "--json"]);
  assert.equal(result.code, 1);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "ABSENT_TOOL_NOT_32602");
  assert.equal(result.json.result.checks.positive.toolsExact, true);
  assert.equal(result.json.result.checks.positive.protocolOk, true);
  assert.equal(result.json.result.checks.negative.absentToolIs32602, false);
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.toolsCalled, false);
  assert.equal(result.json.result.gatewayClient, false);
});

test("seeded -32601 absent tool is rejected by the CLI", async () => {
  const result = await runCli(["--seeded-failure", "absent-tool-32601", "--json"]);
  assert.equal(result.code, 1);
  assert.equal(result.json.error.code, "ABSENT_TOOL_NOT_32602");
  assert.equal(result.json.result.checks.negative.absentToolCode, -32601);
});

test("seeded 24-tool list is not accepted as this host", async () => {
  const result = await runCli(["--seeded-failure", "gateway-24-tool-list", "--json"]);
  assert.equal(result.code, 1);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "GATEWAY_SURFACE");
  assert.equal(result.json.result.toolCount, 24);
  assert.equal(result.json.result.checks.negative.twentyFourToolListAccepted, false);
  assert.equal(result.json.result.gatewayClient, false);
});

test("cite-pilot and a gateway origin are refused without a pass", async () => {
  const cited = await runCli(["mcp", "cite-pilot", "--json"], 5_000);
  assert.equal(cited.code, 1);
  assert.equal(cited.json.error.code, "GATEWAY_CLIENT_REFUSE");
  const origin = await runCli(["mcp", "tools/list", "--origin", "https://agents.samedaydesk.com/mcp", "--json"], 5_000);
  assert.equal(origin.code, 1);
  assert.equal(origin.json.error.code, "GATEWAY_CLIENT_REFUSE");
});

test("named tools/call is refused", async () => {
  const result = await runCli(["mcp", "tools/call", "generate_complete_fix_pack", "--json"], 5_000);
  assert.equal(result.code, 1);
  assert.equal(result.json.error.code, "TOOL_CALL_REFUSE");
});

test("shipped server/index.js lists the apex five on protocol 2024-11-05", async () => {
  const result = await runCli(["mcp", "tools/list", "--json"], 30_000);
  assert.equal(result.code, 0, result.stderr + result.stdout);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.result.protocol, "2024-11-05");
  assert.deepEqual(result.json.result.tools, [...APEX_TOOLS]);
  assert.equal(result.json.result.toolCount, 5);
  assert.equal(result.json.result.absentTool.errorCode, -32602);
  assert.equal(result.json.result.absentTool.jsonrpc32602, true);
  assert.equal(result.json.result.checks.negative.twentyFourToolListAccepted, false);
  assert.equal(result.json.result.gatewayClient, false);
  assert.equal(result.json.result.host, "server/index.js");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.toolsCalled, false);
});

test("in-process main agrees with the shipped CLI contract", async () => {
  const previous = process.cwd();
  process.chdir(root);
  try {
    const env = await main(["mcp", "tools/list"]);
    assert.equal(env.ok, true);
    assert.deepEqual(env.result.tools, [...APEX_TOOLS]);
    assert.equal(env.result.protocol, MCP_PROTOCOL);
  } finally {
    process.chdir(previous);
  }
});

function probeMessages(overrides = {}) {
  const messages = {
    initialize: {
      jsonrpc: "2.0",
      id: RPC_REQUEST_ID.initialize,
      result: {
        protocolVersion: MCP_PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: "samedaydesk-agent-tools", version: "1.2.0" },
      },
    },
    listed: {
      jsonrpc: "2.0",
      id: RPC_REQUEST_ID.toolsList,
      result: {
        tools: APEX_TOOLS.map((name) => ({ name, inputSchema: { type: "object" } })),
      },
    },
    absent: {
      jsonrpc: "2.0",
      id: RPC_REQUEST_ID.absent,
      error: { code: -32602, message: "Invalid params" },
    },
  };
  return { ...messages, ...overrides };
}

test("probe request ids stay 1, 2, and 3", () => {
  assert.deepEqual(RPC_REQUEST_ID, { initialize: 1, toolsList: 2, absent: 3 });
});

test("bound initialize, tools/list, and absent -32602 still pass", () => {
  const messages = probeMessages();
  const session = sessionFromProbeResponses(messages.initialize, messages.listed, messages.absent);
  assert.equal(session.protocol, "2024-11-05");
  assert.equal(session.serverInfo.name, "samedaydesk-agent-tools");
  assert.equal(session.tools.length, 5);
  const verdict = judgeApexSession(session);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.code, null);
});

test("Sol counterexample: absent -32602 with id 999 does not pass", () => {
  const absent = { jsonrpc: "2.0", id: 999, error: { code: -32602, message: "Invalid params" } };
  assert.equal(isJsonRpc32602(absent), false);
  const direct = judgeApexSession(goldenSession({ absent }));
  assert.equal(direct.ok, false);
  assert.equal(direct.code, "ABSENT_TOOL_NOT_32602");

  const messages = probeMessages({ absent });
  const session = sessionFromProbeResponses(messages.initialize, messages.listed, messages.absent);
  const verdict = judgeApexSession(session);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, "RPC_RESPONSE_BIND");
  assert.equal(verdict.detail.rpc.failures[0].response, "absent");
  assert.equal(verdict.detail.rpc.failures[0].reason, "id");
  assert.equal(verdict.detail.rpc.failures[0].id, 999);
  assert.equal(verdict.detail.rpc.failures[0].expectedId, 3);
});

test("absent -32602 with a null id or a missing id does not pass", () => {
  const nullId = { jsonrpc: "2.0", id: null, error: { code: -32602, message: "Invalid params" } };
  assert.equal(isJsonRpc32602(nullId), false);
  const nullSession = sessionFromProbeResponses(
    probeMessages().initialize,
    probeMessages().listed,
    nullId,
  );
  const nullVerdict = judgeApexSession(nullSession);
  assert.equal(nullVerdict.ok, false);
  assert.equal(nullVerdict.code, "RPC_RESPONSE_BIND");
  assert.equal(nullVerdict.detail.rpc.failures[0].present, true);
  assert.equal(nullVerdict.detail.rpc.failures[0].id, null);

  const missingId = { jsonrpc: "2.0", error: { code: -32602, message: "Invalid params" } };
  assert.equal(Object.prototype.hasOwnProperty.call(missingId, "id"), false);
  assert.equal(isJsonRpc32602(missingId), false);
  const missingSession = sessionFromProbeResponses(
    probeMessages().initialize,
    probeMessages().listed,
    missingId,
  );
  const missingVerdict = judgeApexSession(missingSession);
  assert.equal(missingVerdict.ok, false);
  assert.equal(missingVerdict.code, "RPC_RESPONSE_BIND");
  assert.equal(missingVerdict.detail.rpc.failures[0].present, false);
  assert.equal(missingVerdict.detail.rpc.failures[0].reason, "id");
});

test("malformed initialize or tools/list identity is not trusted", () => {
  const wrongInit = probeMessages({
    initialize: {
      jsonrpc: "2.0",
      id: 999,
      result: {
        protocolVersion: MCP_PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: "samedaydesk-agent-tools", version: "1.2.0" },
      },
    },
  });
  const initSession = sessionFromProbeResponses(wrongInit.initialize, wrongInit.listed, wrongInit.absent);
  assert.equal(initSession.protocol, null);
  assert.equal(initSession.serverInfo, null);
  const initVerdict = judgeApexSession(initSession);
  assert.equal(initVerdict.ok, false);
  assert.equal(initVerdict.code, "RPC_RESPONSE_BIND");
  assert.equal(initVerdict.detail.rpc.failures[0].response, "initialize");
  assert.equal(initVerdict.detail.rpc.failures[0].id, 999);

  const errorInit = probeMessages({
    initialize: {
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32603, message: "internal" },
      result: {
        protocolVersion: MCP_PROTOCOL,
        serverInfo: { name: "samedaydesk-agent-tools", version: "1.2.0" },
      },
    },
  });
  const errorSession = sessionFromProbeResponses(errorInit.initialize, errorInit.listed, errorInit.absent);
  assert.equal(errorSession.protocol, null);
  const errorVerdict = judgeApexSession(errorSession);
  assert.equal(errorVerdict.ok, false);
  assert.equal(errorVerdict.detail.rpc.failures[0].reason, "error");

  const wrongList = probeMessages({
    listed: {
      jsonrpc: "2.0",
      id: 1,
      result: { tools: APEX_TOOLS.map((name) => ({ name })) },
    },
  });
  const listSession = sessionFromProbeResponses(wrongList.initialize, wrongList.listed, wrongList.absent);
  assert.equal(listSession.tools, null);
  const listVerdict = judgeApexSession(listSession);
  assert.equal(listVerdict.ok, false);
  assert.equal(listVerdict.code, "RPC_RESPONSE_BIND");
  assert.equal(listVerdict.detail.rpc.failures[0].response, "tools/list");
  assert.equal(listVerdict.detail.rpc.failures[0].reason, "id");
  assert.equal(listVerdict.detail.rpc.failures[0].expectedId, 2);

  const missingList = probeMessages({
    listed: {
      jsonrpc: "2.0",
      result: { tools: APEX_TOOLS.map((name) => ({ name })) },
    },
  });
  const missingListSession = sessionFromProbeResponses(
    missingList.initialize,
    missingList.listed,
    missingList.absent,
  );
  assert.equal(missingListSession.tools, null);
  const missingListVerdict = judgeApexSession(missingListSession);
  assert.equal(missingListVerdict.ok, false);
  assert.equal(missingListVerdict.detail.rpc.failures[0].present, false);

  const badVersion = probeMessages({
    listed: {
      jsonrpc: "1.0",
      id: 2,
      result: { tools: APEX_TOOLS.map((name) => ({ name })) },
    },
  });
  const versionSession = sessionFromProbeResponses(badVersion.initialize, badVersion.listed, badVersion.absent);
  assert.equal(versionSession.tools, null);
  const versionVerdict = judgeApexSession(versionSession);
  assert.equal(versionVerdict.ok, false);
  assert.equal(versionVerdict.detail.rpc.failures[0].reason, "jsonrpc");
});

test("string id \"3\" is not the numeric absent probe id", () => {
  const absent = { jsonrpc: "2.0", id: "3", error: { code: -32602, message: "Invalid params" } };
  assert.equal(isJsonRpc32602(absent), false);
  const verdict = judgeApexSession(goldenSession({ absent }));
  assert.equal(verdict.ok, false);
});

function bindFailure(json, response) {
  const failures = json.error?.detail?.rpc?.failures || [];
  return failures.find((failure) => failure.response === response);
}

test("seeded absent -32602 wrong, null, and missing ids are rejected", async () => {
  const wrong = await runCli(["--seeded-failure", "absent-32602-wrong-id", "--json"]);
  assert.equal(wrong.code, 1, wrong.stdout + wrong.stderr);
  assert.equal(wrong.json.ok, false);
  assert.equal(wrong.json.error.code, "RPC_RESPONSE_BIND");
  assert.equal(bindFailure(wrong.json, "absent").id, 999);
  assert.equal(bindFailure(wrong.json, "absent").expectedId, 3);
  assert.equal(wrong.json.result.checks.negative.absentToolIs32602, false);
  assert.equal(wrong.json.boundary.paymentSent, false);
  assert.equal(wrong.json.boundary.toolsCalled, false);
  assert.equal(wrong.json.result.gatewayClient, false);

  const nullId = await runCli(["--seeded-failure", "absent-32602-null-id", "--json"]);
  assert.equal(nullId.code, 1, nullId.stdout);
  assert.equal(nullId.json.error.code, "RPC_RESPONSE_BIND");
  assert.equal(bindFailure(nullId.json, "absent").present, true);
  assert.equal(bindFailure(nullId.json, "absent").id, null);
  assert.equal(nullId.json.result.checks.negative.absentToolIs32602, false);

  const missing = await runCli(["--seeded-failure", "absent-32602-missing-id", "--json"]);
  assert.equal(missing.code, 1, missing.stdout);
  assert.equal(missing.json.error.code, "RPC_RESPONSE_BIND");
  assert.equal(bindFailure(missing.json, "absent").present, false);
  assert.equal(bindFailure(missing.json, "absent").reason, "id");
  assert.equal(missing.json.result.checks.negative.absentToolIs32602, false);
});

test("seeded malformed initialize and tools/list identity are rejected", async () => {
  const initialize = await runCli(["--seeded-failure", "initialize-wrong-id", "--json"]);
  assert.equal(initialize.code, 1, initialize.stdout + initialize.stderr);
  assert.equal(initialize.json.ok, false);
  assert.equal(initialize.json.error.code, "RPC_RESPONSE_BIND");
  assert.equal(initialize.json.result.protocol, null);
  assert.equal(bindFailure(initialize.json, "initialize").id, 999);
  assert.equal(bindFailure(initialize.json, "initialize").expectedId, 1);
  assert.equal(initialize.json.boundary.paymentSent, false);
  assert.equal(initialize.json.result.gatewayClient, false);

  const listed = await runCli(["--seeded-failure", "tools-list-missing-id", "--json"]);
  assert.equal(listed.code, 1, listed.stdout + listed.stderr);
  assert.equal(listed.json.ok, false);
  assert.equal(listed.json.error.code, "RPC_RESPONSE_BIND");
  assert.equal(listed.json.result.toolCount, 0);
  assert.deepEqual(listed.json.result.tools, []);
  assert.equal(bindFailure(listed.json, "tools/list").present, false);
  assert.equal(bindFailure(listed.json, "tools/list").reason, "id");
  assert.equal(listed.json.boundary.toolsCalled, false);
});
