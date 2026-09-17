import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { readFileSync } from "node:fs";
import { MCP_TOOL_NAMES } from "../../../server/lib/mcp-tool-inventory.js";
import { MCP_TOOLS, PAID_TOOL } from "./lib/catalog.mjs";
import { listTools, postMcp, resolveMcpUrl, toolNames } from "./lib/client.mjs";
import { startFixtureServer } from "./lib/fixture-server.mjs";
import {
  PINNED_TOOLS_BLOCK_SHA256,
  assertSourcePin,
  extractNegotiationSha,
  readPinnedSource,
} from "./lib/source-pin.mjs";

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

test("cold unpaid tools/list exit 0 against loopback fixture + source pin", () => {
  const result = run(["tools/list", "--json"]);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.command, "tools/list");
  assert.equal(result.json.wave, "w820");
  assert.equal(result.json.feature, "w820-mcp-unpaid");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.toolsCalled, false);
  assert.deepEqual(result.json.result.tools, [
    "check_ai_readiness",
    "generate_complete_fix_pack",
    "plan_taskmarket_delegation",
    "browse_taskmarket_tasks",
    "track_taskmarket_task",
  ]);
  assert.equal(result.json.result.listedBeforeCall, true);
  assert.equal(result.json.result.paidToolListedNotCalled, "generate_complete_fix_pack");
  assert.equal(result.json.result.protocol, "2024-11-05");
  assert.equal(result.json.result.toolsBlockSha256, PINNED_TOOLS_BLOCK_SHA256);
});

test("tools/call refuse is non-zero; toolsCalled false; never pays", () => {
  const result = run(["tools/call", "generate_complete_fix_pack", "--json"]);
  assert.notEqual(result.status, 0, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "PAID_REFUSE");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.toolsCalled, false);
  assert.equal(result.json.result.refused, true);
});

test("seeded paid-tool-call exit ≠ 0 with PAID_REFUSE", () => {
  const result = run(["--seeded-failure", "paid-tool-call", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "PAID_REFUSE");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.toolsCalled, false);
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
  assert.equal(result.json.boundary.toolsCalled, false);
  assert.equal(result.json.result.neverOpenedCheckout, true);
});

test("seeded tools-sha-mismatch exit ≠ 0 against committed mcp.js", () => {
  const result = run(["--seeded-failure", "tools-sha-mismatch", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "TOOLS_SHA_MISMATCH");
  assert.equal(result.json.result.refused, true);
  assert.equal(result.json.result.got, PINNED_TOOLS_BLOCK_SHA256);
  assert.equal(
    result.json.result.want,
    "0000000000000000000000000000000000000000000000000000000000000000",
  );
  assert.equal(result.json.boundary.paymentSent, false);
});

test("seeded paid-as-unpaid exit ≠ 0; never posts paid call", () => {
  const result = run(["--seeded-failure", "paid-as-unpaid", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "PAID_AS_UNPAID");
  assert.equal(result.json.result.refused, true);
  assert.equal(result.json.result.neverPostedCall, true);
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.toolsCalled, false);
});

test("fixture pointer yields paid-tool refuse", () => {
  const result = run([
    "--fixture",
    "tools/verify-sds/w820-mcp-unpaid/fixtures/seeded/paid-tool-call.json",
    "--json",
  ]);
  assert.equal(result.status, 1);
  assert.equal(result.json.error.code, "PAID_REFUSE");
});

test("fixture pointer yields tools-sha-mismatch refuse", () => {
  const result = run([
    "--fixture",
    "tools/verify-sds/w820-mcp-unpaid/fixtures/seeded/tools-sha-mismatch.json",
    "--json",
  ]);
  assert.equal(result.status, 1);
  assert.equal(result.json.error.code, "TOOLS_SHA_MISMATCH");
});

test("cold run-harness exit 0 (list ok + seeds refuse)", () => {
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
  assert.equal(json.result.listOk, true);
  assert.equal(json.result.seedsOk, true);
  assert.equal(json.boundary.paymentSent, false);
  assert.equal(json.boundary.toolsCalled, false);
  const seedSteps = json.result.steps.filter((s) => s.step.startsWith("seeded:"));
  assert.equal(seedSteps.length, 5);
});

test("apex-tools fixture matches catalog five", () => {
  const apex = JSON.parse(readFileSync(join(here, "fixtures/apex-tools.json"), "utf8"));
  assert.equal(apex.tools.length, 5);
  assert.equal(apex.paidTool, "generate_complete_fix_pack");
  assert.ok(apex.tools.includes("check_ai_readiness"));
  assert.equal(apex.cite.toolsBlockSha256, PINNED_TOOLS_BLOCK_SHA256);
});

test("cite-apex documents live URL without calling tools", () => {
  const result = run(["cite-apex", "--json"]);
  assert.equal(result.status, 0);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.boundary.toolsCalled, false);
  assert.equal(result.json.boundary.paymentSent, false);
  assert.match(result.json.result.url, /samedaydesk\.com\/mcp/);
});

test("unknown seeded-failure is rejected", () => {
  const result = run(["--seeded-failure", "not-a-real-seed", "--json"]);
  assert.equal(result.status, 2, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "USAGE");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.toolsCalled, false);
});

test("bare --seeded-failure does not consume --json as seed id", () => {
  const result = run(["--seeded-failure", "--json"]);
  assert.equal(result.status, 2, result.stderr + result.stdout);
  assert.equal(result.json.error.code, "USAGE");
  assert.match(result.json.error.message, /missing value for --seeded-failure/);
});

test("origin buy.stripe.com is STRIPE_PATH_REFUSE before any live POST", () => {
  const result = run([
    "tools/list",
    "--origin",
    "https://buy.stripe.com/8x24gA0xA9DF9dd13YeZ20h",
    "--json",
  ]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.error.code, "STRIPE_PATH_REFUSE");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.result.neverOpenedCheckout, true);
});

test("origin mcp?cs= is STRIPE_PATH_REFUSE and does not rewrite query", () => {
  const result = run([
    "tools/list",
    "--origin",
    "https://samedaydesk.com/mcp?cs=cs_test_fake",
    "--json",
  ]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.error.code, "STRIPE_PATH_REFUSE");
  assert.equal(result.json.boundary.paymentSent, false);
});

test("catalog five tools match shipped mcp-tool-inventory", () => {
  assert.deepEqual([...MCP_TOOLS], [...MCP_TOOL_NAMES]);
  assert.equal(PAID_TOOL, "generate_complete_fix_pack");
});

test("source pin matches committed mcp.js and negotiation test", () => {
  const pin = assertSourcePin();
  assert.equal(pin.sha256, PINNED_TOOLS_BLOCK_SHA256);
  assert.deepEqual(pin.names, [...MCP_TOOL_NAMES]);
  const negotiationSrc = readFileSync(
    join(root, "server/scripts/test-mcp-protocol-negotiation.js"),
    "utf8",
  );
  assert.equal(extractNegotiationSha(negotiationSrc), PINNED_TOOLS_BLOCK_SHA256);
  const fixturePin = JSON.parse(readFileSync(join(here, "fixtures/source-pin.json"), "utf8"));
  assert.equal(fixturePin.toolsBlockSha256, pin.sha256);
  assert.equal(readPinnedSource().paidToolInSource, true);
});

test("postMcp refuses PAYMENT-SIGNATURE before any socket", () => {
  assert.throws(
    () =>
      postMcp(
        "http://127.0.0.1:1/mcp",
        { jsonrpc: "2.0", id: 1, method: "initialize" },
        { headers: { "PAYMENT-SIGNATURE": "seeded-fake-sig" } },
      ),
    (e) => e.code === "PAYMENT_HEADER_REFUSE",
  );
});

test("postMcp refuses paid tools/call before any socket", () => {
  assert.throws(
    () =>
      postMcp("http://127.0.0.1:1/mcp", {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "generate_complete_fix_pack" },
      }),
    (e) => e.code === "PAID_REFUSE",
  );
});

test("resolveMcpUrl joins /mcp without appending onto query strings", () => {
  assert.equal(resolveMcpUrl("http://127.0.0.1:9"), "http://127.0.0.1:9/mcp");
  assert.equal(resolveMcpUrl("http://127.0.0.1:9/mcp/"), "http://127.0.0.1:9/mcp");
  assert.throws(
    () => resolveMcpUrl("https://samedaydesk.com/mcp?cs=cs_test_fake"),
    (e) => e.code === "STRIPE_PATH_REFUSE",
  );
});

test("listTools against loopback origin via resolveMcpUrl", async () => {
  const handle = await startFixtureServer();
  try {
    const url = resolveMcpUrl(handle.origin);
    assert.equal(url, handle.url);
    const session = await listTools(url);
    assert.equal(session.initialize.status, 200);
    assert.equal(session.listed.status, 200);
    assert.deepEqual(toolNames(session.listed), [...MCP_TOOLS]);
  } finally {
    await handle.close();
  }
});
