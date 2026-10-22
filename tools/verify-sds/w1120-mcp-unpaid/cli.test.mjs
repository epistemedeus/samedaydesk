import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { readFileSync } from "node:fs";
import { MCP_TOOL_NAMES } from "../../../server/lib/mcp-tool-inventory.js";
import { MCP_TOOLS, FEATURE, WINDOW, SEEDED, looksLikePaymentUrl } from "./lib/catalog.mjs";
import { listTools, postMcp, getMcp, resolveMcpUrl, toolNames } from "./lib/client.mjs";
import { startFixtureServer } from "./lib/fixture-server.mjs";

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
  assert.equal(result.json.window, WINDOW);
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
  assert.equal(result.json.result.unpaidGet, true);
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

test("seeded cs-query exit ≠ 0 with STRIPE_PATH_REFUSE", () => {
  const result = run(["--seeded-failure", "cs-query", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "STRIPE_PATH_REFUSE");
  assert.equal(result.json.result.seed, "cs-query");
  assert.equal(result.json.result.refused, true);
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.toolsCalled, false);
});

test("fixture pointer yields paid-tool refuse", () => {
  const result = run([
    "--fixture",
    "tools/verify-sds/w1120-mcp-unpaid/fixtures/seeded/paid-tool-call.json",
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
  assert.equal(json.window, WINDOW);
  assert.equal(json.boundary.paymentSent, false);
  assert.equal(json.boundary.toolsCalled, false);
  const seedSteps = json.result.steps.filter((s) => s.step.startsWith("seeded:"));
  assert.equal(seedSteps.length, Object.keys(SEEDED).length);
});

test("apex-tools fixture matches catalog five", () => {
  const apex = JSON.parse(
    readFileSync(join(here, "fixtures/apex-tools.json"), "utf8"),
  );
  assert.equal(apex.tools.length, 5);
  assert.equal(apex.paidTool, "generate_complete_fix_pack");
  assert.ok(apex.tools.includes("check_ai_readiness"));
  assert.equal(apex.window, WINDOW);
  assert.equal(apex.feature, FEATURE);
});

test("window pin matches catalog and shipped inventory", () => {
  const pin = JSON.parse(readFileSync(join(here, "fixtures/window.json"), "utf8"));
  assert.equal(pin.window, WINDOW);
  assert.equal(pin.job, "W0-X319");
  assert.deepEqual(pin.tools, [...MCP_TOOLS]);
  assert.deepEqual(pin.tools, [...MCP_TOOL_NAMES]);
  assert.equal(pin.paidTool, "generate_complete_fix_pack");
  assert.equal(pin.protocol, "2024-11-05");
});

test("cite-apex documents live URL without calling tools", () => {
  const result = run(["cite-apex", "--json"]);
  assert.equal(result.status, 0);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.boundary.toolsCalled, false);
  assert.equal(result.json.boundary.paymentSent, false);
  assert.match(result.json.result.url, /samedaydesk\.com\/mcp/);
  assert.equal(result.json.window, WINDOW);
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
    "https://buy.stripe.com/w1120-unpaid-refuse",
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

test("getMcp refuses cs= URL before any socket", () => {
  assert.throws(
    () => getMcp("http://127.0.0.1:1/mcp?cs=cs_test_fake"),
    (e) => e.code === "STRIPE_PATH_REFUSE",
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
    assert.equal(session.get.status, 200);
    assert.match(session.get.body, /samedaydesk agent tools MCP server/);
    assert.equal(session.initialize.status, 200);
    assert.equal(session.listed.status, 200);
    assert.deepEqual(toolNames(session.listed), [...MCP_TOOLS]);
  } finally {
    await handle.close();
  }
});

test("fixture GET ?cs= is 400 STRIPE_PATH_REFUSE (client never follows)", async () => {
  const handle = await startFixtureServer();
  try {
    assert.equal(looksLikePaymentUrl(`${handle.url}?cs=cs_test_fake`), true);
    const res = await new Promise((resolve, reject) => {
      const u = new URL(`${handle.url}?cs=cs_test_fake`);
      const req = http.request(
        {
          hostname: u.hostname,
          port: u.port,
          path: `${u.pathname}${u.search}`,
          method: "GET",
        },
        (r) => {
          const chunks = [];
          r.on("data", (c) => chunks.push(c));
          r.on("end", () => {
            resolve({
              status: r.statusCode,
              body: Buffer.concat(chunks).toString("utf8"),
            });
          });
        },
      );
      req.on("error", reject);
      req.end();
    });
    assert.equal(res.status, 400);
    const json = JSON.parse(res.body);
    assert.equal(json.error, "STRIPE_PATH_REFUSE");
  } finally {
    await handle.close();
  }
});
