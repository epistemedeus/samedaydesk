import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { MCP_TOOL_NAMES } from "../../../server/lib/mcp-tool-inventory.js";
import { MCP_TOOLS, FEATURE, PAID_TOOL, looksLikePaymentUrl } from "./lib/catalog.mjs";
import { listTools, postMcp, getMcp, toolNames } from "./lib/client.mjs";
import { startFixtureServer } from "./lib/fixture-server.mjs";
import { envelope } from "./lib/envelope.mjs";
import {
  assertLoopbackUnpaidOrigin,
  resolveLoopbackMcpUrl,
} from "./lib/origin.mjs";
import {
  assertSourcePin,
  PINNED_TOOLS_BLOCK_SHA256,
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

test("cold unpaid tools/list exit 0 against loopback fixture", () => {
  const result = run(["tools/list", "--json"]);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.command, "tools/list");
  assert.equal(result.json.feature, FEATURE);
  assert.equal(result.json.window, "w1040");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.toolsCalled, false);
  assert.deepEqual(result.json.result.tools, [...MCP_TOOLS]);
  assert.equal(result.json.result.listedBeforeCall, true);
  assert.equal(result.json.result.paidToolListedNotCalled, PAID_TOOL);
  assert.equal(result.json.result.protocol, "2024-11-05");
  assert.equal(result.json.result.toolsBlockSha256, PINNED_TOOLS_BLOCK_SHA256);
  assert.match(result.json.result.mcpUrl, /^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
});

test("tools/call paid refuse is non-zero; toolsCalled false; never pays", () => {
  const result = run(["tools/call", "generate_complete_fix_pack", "--json"]);
  assert.notEqual(result.status, 0, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "PAID_REFUSE");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.toolsCalled, false);
  assert.equal(result.json.result.refused, true);
  assert.equal(result.json.result.neverPostedCall, true);
});

test("tools/call of a free tool is still list-only USAGE refuse", () => {
  const result = run(["tools/call", "check_ai_readiness", "--json"]);
  assert.equal(result.status, 2, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "USAGE");
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

test("seeded cs-query exit ≠ 0 with STRIPE_PATH_REFUSE", () => {
  const result = run(["--seeded-failure", "cs-query", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "STRIPE_PATH_REFUSE");
  assert.equal(result.json.result.seed, "cs-query");
  assert.equal(result.json.result.refused, true);
  assert.equal(result.json.boundary.paymentSent, false);
});

test("seeded tools-sha-mismatch exit ≠ 0 against committed source", () => {
  const result = run(["--seeded-failure", "tools-sha-mismatch", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "TOOLS_SHA_MISMATCH");
  assert.equal(result.json.result.refused, true);
  assert.equal(result.json.result.got, PINNED_TOOLS_BLOCK_SHA256);
  assert.equal(result.json.boundary.paymentSent, false);
});

test("fixture pointer yields paid-tool refuse", () => {
  const result = run([
    "--fixture",
    "tools/verify-sds/w1040-mcp-unpaid/fixtures/seeded/paid-tool-call.json",
    "--json",
  ]);
  assert.equal(result.status, 1);
  assert.equal(result.json.error.code, "PAID_REFUSE");
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
});

test("apex-tools fixture matches catalog five", () => {
  const apex = JSON.parse(
    readFileSync(join(here, "fixtures/apex-tools.json"), "utf8"),
  );
  assert.equal(apex.tools.length, 5);
  assert.equal(apex.paidTool, PAID_TOOL);
  assert.ok(apex.tools.includes("check_ai_readiness"));
  assert.equal(apex.feature, FEATURE);
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
    "https://buy.stripe.com/w1040-unpaid-refuse",
    "--json",
  ]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.error.code, "STRIPE_PATH_REFUSE");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.result.neverOpenedCheckout, true);
  assert.equal(result.json.result.neverPostedCall, true);
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

test("--live refuses LIVE_REFUSE; never posts", () => {
  const result = run(["tools/list", "--live", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "LIVE_REFUSE");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.result.neverPostedCall, true);
});

test("--origin live apex refuses without POST", () => {
  const result = run(["tools/list", "--origin", "https://samedaydesk.com", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.error.code, "LIVE_REFUSE");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.result.neverPostedCall, true);
});

test("malformed --fixture JSON is USAGE not RUNTIME", () => {
  const dir = mkdtempSync(join(tmpdir(), "w1040-fix-"));
  const bad = join(dir, "bad.json");
  writeFileSync(bad, "{not json");
  const result = run(["--fixture", bad, "--json"]);
  assert.equal(result.status, 2, result.stderr + result.stdout);
  assert.equal(result.json.error.code, "USAGE");
  assert.match(result.json.error.message, /parse failed/);
});

test("catalog five tools match shipped mcp-tool-inventory", () => {
  assert.deepEqual([...MCP_TOOLS], [...MCP_TOOL_NAMES]);
});

test("committed tools-block sha matches negotiation pin", () => {
  const pin = assertSourcePin();
  assert.equal(pin.sha256, PINNED_TOOLS_BLOCK_SHA256);
  assert.deepEqual(pin.names, [...MCP_TOOLS]);
});

test("envelope hard-forces paymentSent=false even if caller tries to set it", () => {
  const env = envelope({
    ok: true,
    command: "probe",
    boundary: { paymentSent: true, toolsCalled: true, extra: "kept" },
  });
  assert.equal(env.boundary.paymentSent, false);
  assert.equal(env.boundary.toolsCalled, false);
  assert.equal(env.boundary.extra, "kept");
});

test("looksLikePaymentUrl covers checkout, cs_, and stripe hosts", () => {
  assert.equal(looksLikePaymentUrl("/api/checkout"), true);
  assert.equal(looksLikePaymentUrl("https://buy.stripe.com/x"), true);
  assert.equal(looksLikePaymentUrl("https://samedaydesk.com/mcp?cs=cs_test_x"), true);
  assert.equal(looksLikePaymentUrl("http://127.0.0.1:9/mcp"), false);
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

test("resolveLoopbackMcpUrl joins /mcp without appending onto query strings", () => {
  assert.equal(resolveLoopbackMcpUrl("http://127.0.0.1:9"), "http://127.0.0.1:9/mcp");
  assert.equal(resolveLoopbackMcpUrl("http://127.0.0.1:9/mcp/"), "http://127.0.0.1:9/mcp");
  assert.throws(
    () => resolveLoopbackMcpUrl("https://samedaydesk.com/mcp?cs=cs_test_fake"),
    (e) => e.code === "STRIPE_PATH_REFUSE",
  );
  assert.throws(() => assertLoopbackUnpaidOrigin("https://agents.samedaydesk.com/mcp"), {
    code: "LIVE_REFUSE",
  });
});

test("listTools against loopback origin via resolveLoopbackMcpUrl", async () => {
  const handle = await startFixtureServer();
  try {
    const url = resolveLoopbackMcpUrl(handle.origin);
    assert.equal(url, handle.url);
    const banner = await getMcp(url);
    assert.equal(banner.status, 200);
    assert.match(banner.body, /w1040-mcp-unpaid/);
    const session = await listTools(url);
    assert.equal(session.initialize.status, 200);
    assert.equal(session.listed.status, 200);
    assert.deepEqual(toolNames(session.listed), [...MCP_TOOLS]);
  } finally {
    await handle.close();
  }
});
