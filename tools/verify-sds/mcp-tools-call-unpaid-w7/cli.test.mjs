import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { MCP_TOOL_NAMES } from "../../../server/lib/mcp-tool-inventory.js";
import { MCP_TOOLS, PAID_TOOL, UNPAID_CALL_TOOL } from "./lib/catalog.mjs";
import { postMcp, callUnpaidTool, assertIsErrorShape } from "./lib/client.mjs";
import { startFixtureServer } from "./lib/fixture-server.mjs";
import {
  assertLoopbackUnpaidOrigin,
  resolveLoopbackMcpUrl,
} from "./lib/origin.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const cli = join(here, "cli.mjs");
const harness = join(here, "run-harness.mjs");

function run(args, timeout = 30_000) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout,
    env: process.env,
  });
  let json = null;
  try {
    json = JSON.parse(result.stdout.trim().split("\n").at(-1));
  } catch {
    json = null;
  }
  return { ...result, json };
}

test("cold unpaid tools/call isError exit 0 against loopback fixture", () => {
  const result = run(["tools/call", "--json"]);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.command, "tools/call");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.paidToolsCallPosted, false);
  assert.equal(result.json.result.isError, true);
  assert.equal(result.json.result.tool, "check_ai_readiness");
  assert.equal(result.json.result.unpaidCallPosted, true);
  assert.equal(result.json.result.protocol, "2024-11-05");
  assert.ok(Array.isArray(result.json.result.content));
  assert.ok(result.json.result.content.some((c) => c.type === "text" && /UNPAID_ISERROR|isError/i.test(c.text)));
});

test("tools/call named free tool also yields isError exit 0", () => {
  const result = run(["tools/call", "browse_taskmarket_tasks", "--json"]);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.result.isError, true);
  assert.equal(result.json.result.tool, "browse_taskmarket_tasks");
  assert.equal(result.json.boundary.paymentSent, false);
});

test("tools/call paid tool refuse is non-zero; never pays; never posts paid", () => {
  const result = run(["tools/call", "generate_complete_fix_pack", "--json"]);
  assert.notEqual(result.status, 0, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "PAID_REFUSE");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.paidToolsCallPosted, false);
  assert.equal(result.json.result.refused, true);
});

test("seeded paid-tool-call exit ≠ 0 with PAID_REFUSE", () => {
  const result = run(["--seeded-failure", "paid-tool-call", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "PAID_REFUSE");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.paidToolsCallPosted, false);
  assert.equal(result.json.result.refused, true);
  assert.equal(result.json.result.neverPostedCall, true);
});

test("seeded payment-signature exit ≠ 0; header never sent", () => {
  const result = run(["--seeded-failure", "payment-signature", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "PAYMENT_HEADER_REFUSE");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.result.headerNeverSent, true);
});

test("seeded stripe-path exit ≠ 0 with STRIPE_PATH_REFUSE", () => {
  const result = run(["--seeded-failure", "stripe-path", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "STRIPE_PATH_REFUSE");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.paidToolsCallPosted, false);
  assert.equal(result.json.result.neverOpenedCheckout, true);
});

test("fixture pointer yields paid-tool refuse", () => {
  const result = run([
    "--fixture",
    "tools/verify-sds/mcp-tools-call-unpaid-w7/fixtures/seeded/paid-tool-call.json",
    "--json",
  ]);
  assert.equal(result.status, 1);
  assert.equal(result.json.error.code, "PAID_REFUSE");
});

test("cold run-harness exit 0 (unpaid isError ok + seeds refuse)", () => {
  const result = spawnSync(process.execPath, [harness], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
    env: process.env,
  });
  let json = null;
  try {
    json = JSON.parse(result.stdout.trim().split("\n").at(-1));
  } catch {
    json = null;
  }
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.result.callOk, true);
  assert.equal(json.result.seedsOk, true);
  assert.equal(json.boundary.paymentSent, false);
  assert.equal(json.boundary.paidToolsCallPosted, false);
});

test("apex-tools fixture matches catalog and unpaidCallTool", () => {
  const apex = JSON.parse(
    readFileSync(join(here, "fixtures/apex-tools.json"), "utf8"),
  );
  assert.equal(apex.tools.length, 5);
  assert.equal(apex.paidTool, "generate_complete_fix_pack");
  assert.equal(apex.unpaidCallTool, "check_ai_readiness");
  assert.ok(apex.tools.includes("check_ai_readiness"));
});

test("cite-apex documents live URL without payment", () => {
  const result = run(["cite-apex", "--json"]);
  assert.equal(result.status, 0);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.paidToolsCallPosted, false);
  assert.match(result.json.result.url, /samedaydesk\.com\/mcp/);
});

test("catalog tools match shipped mcp-tool-inventory", () => {
  assert.deepEqual([...MCP_TOOLS], [...MCP_TOOL_NAMES]);
  assert.equal(PAID_TOOL, "generate_complete_fix_pack");
  assert.ok(MCP_TOOL_NAMES.includes(UNPAID_CALL_TOOL));
});

test("--live refuses LIVE_REFUSE; never posts", () => {
  const result = run(["tools/call", "--live", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "LIVE_REFUSE");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.paidToolsCallPosted, false);
  assert.equal(result.json.result.neverPostedCall, true);
});

test("--origin live apex refuses without POST", () => {
  const result = run(["tools/call", "--origin", "https://samedaydesk.com", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.error.code, "LIVE_REFUSE");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.result.neverPostedCall, true);
});

test("--origin checkout-session query refuses STRIPE_PATH_REFUSE", () => {
  const result = run([
    "tools/call",
    "--origin",
    "http://127.0.0.1:9/mcp?cs=cs_live_seeded",
    "--json",
  ]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.error.code, "STRIPE_PATH_REFUSE");
  assert.equal(result.json.boundary.paymentSent, false);
});

test("malformed --fixture JSON is USAGE not RUNTIME", () => {
  const dir = mkdtempSync(join(tmpdir(), "w7-fix-"));
  const bad = join(dir, "bad.json");
  writeFileSync(bad, "{not json");
  const result = run(["--fixture", bad, "--json"]);
  assert.equal(result.status, 2, result.stderr + result.stdout);
  assert.equal(result.json.error.code, "USAGE");
  assert.match(result.json.error.message, /parse failed/);
});

test("postMcp refuses live HTTPS apex without a socket", () => {
  assert.throws(
    () =>
      postMcp("https://samedaydesk.com/mcp", {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
      }),
    (e) => e && e.code === "LIVE_REFUSE",
  );
});

test("resolveLoopbackMcpUrl accepts http loopback /mcp", () => {
  assert.equal(
    resolveLoopbackMcpUrl("http://127.0.0.1:4123/mcp"),
    "http://127.0.0.1:4123/mcp",
  );
  assert.equal(
    resolveLoopbackMcpUrl("http://127.0.0.1:4123"),
    "http://127.0.0.1:4123/mcp",
  );
  assert.throws(() => assertLoopbackUnpaidOrigin("https://agents.samedaydesk.com/mcp"), {
    code: "LIVE_REFUSE",
  });
});

test("callUnpaidTool against in-process loopback origin yields isError", async () => {
  const handle = await startFixtureServer();
  try {
    const mcpUrl = resolveLoopbackMcpUrl(handle.origin);
    const session = await callUnpaidTool(mcpUrl, UNPAID_CALL_TOOL, {});
    assert.equal(session.initialize.status, 200);
    const shape = assertIsErrorShape(session.called);
    assert.equal(shape.isError, true);
  } finally {
    await handle.close();
  }
});
