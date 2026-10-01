import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { MCP_TOOL_NAMES } from "../lib/mcp-tool-inventory.js";
import { SUPPORTED_PROTOCOL_VERSIONS } from "../routes/mcp.js";
import { resetRateLimits } from "../lib/agent-readiness/rate-limit.js";
import { createSdsApp } from "../app.js";
import { MAX_BYTES } from "../../tools/l08-agent-repair/lib/supplied-row.mjs";

const CHECKER_COMMIT = "00267aeb03c3ce01b9b318f5ee0172aee34d7e34";
const CHECKER_VERSION = "0.1.0-candidate.12";
const coldClient = fileURLToPath(new URL("../../tools/l08-agent-repair/public-cold-client.mjs", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const SENTINEL = "EXAMPLE_SENTINEL_NOT_A_SCHEMA";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function post(origin, path, body, headers = {}) {
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: response.status, json, text, headers: response.headers };
}

function objectSchema(property, required) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["data"],
    properties: {
      data: {
        type: "object",
        additionalProperties: false,
        required: required ? [property] : [],
        properties: { [property]: { type: "string" } },
      },
    },
  };
}

function suppliedRow({ route, property, required = false, method = "POST", schema, example, catalogSchema }) {
  const catalogRow = {
    origin: "https://seller.example",
    method,
    route,
    requiredPaths: [`data.${property}`],
  };
  if (catalogSchema !== undefined) catalogRow.schema = catalogSchema;
  const responseContract = { schema: schema === undefined ? objectSchema(property, required) : schema };
  if (example !== undefined) responseContract.example = example;
  return { catalogRow, responseContract };
}

function runClient(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [coldClient, ...args], { cwd: repoRoot });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 20_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status: status ?? 1, stdout, stderr });
    });
  });
}

function lastJson(stdout) {
  const line = stdout.trim().split("\n").filter(Boolean).at(-1);
  return JSON.parse(line);
}

test("createSdsApp serves a visitor supplied row and keeps unrelated routes", { timeout: 60_000 }, async () => {
  resetRateLimits();
  const app = createSdsApp();
  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;
  const scratch = mkdtempSync(join(tmpdir(), "supplied-row-"));
  const canary = join(scratch, "command-canary");
  try {
    const health = await fetch(`${origin}/api/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).service, "samedaydesk");

    const correspondence = await fetch(`${origin}/api/correspondence/healthz`);
    assert.equal(correspondence.status, 200);
    assert.deepEqual(await correspondence.json(), { ok: false, enabled: false, reason: "unconfigured" });

    const checkout = await post(origin, "/api/checkout/seller-repair-session", { finding_id: "not-a-real-finding" });
    assert.notEqual(checkout.status, 404);
    assert.ok(checkout.status === 400 || checkout.status === 503);
    assert.equal(checkout.json?.url, undefined);

    for (const version of SUPPORTED_PROTOCOL_VERSIONS) {
      const initialize = await post(origin, "/mcp", {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: version, capabilities: {}, clientInfo: { name: "supplied-row", version: "0" } },
      });
      assert.equal(initialize.status, 200, version);
      assert.equal(initialize.json.result.protocolVersion, version);
      const tools = await post(origin, "/mcp", { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, { "mcp-protocol-version": version });
      assert.equal(tools.status, 200, version);
      assert.deepEqual(tools.json.result.tools.map((tool) => tool.name), [...MCP_TOOL_NAMES]);
    }
    const unsupported = await post(origin, "/mcp", { jsonrpc: "2.0", id: 4, method: "tools/list", params: {} }, { "mcp-protocol-version": "1999-01-01" });
    assert.equal(unsupported.status, 400);
    assert.equal(unsupported.json.error.code, -32000);
    assert.equal(unsupported.json.result, undefined);

    const quote = await post(origin, "/api/public-readiness/supplied-row", suppliedRow({ route: "/quote", property: "quote" }));
    assert.equal(quote.status, 200);
    assert.equal(quote.json.mode, "supplied-input");
    assert.equal(quote.json.visitorSupplied, true);
    assert.equal(quote.json.fixtureDemonstration, false);
    assert.equal(quote.json.versions.checker, CHECKER_VERSION);
    assert.equal(quote.json.versions.commit, CHECKER_COMMIT);
    assert.equal(quote.json.versions.license, "MIT");
    assert.equal(quote.json.versions.auditSchema, "agent-payment-integrity.audit.v5");
    assert.equal(quote.json.observation.decision, "admissible");
    assert.deepEqual(quote.json.observation.mismatch, ["seller_response_required_path_missing:data.quote"]);
    assert.equal(quote.json.observation.checkerOk, false);
    assert.equal(quote.json.observation.machineBuyable, false);
    assert.equal(quote.json.observation.readinessClaimed, false);
    assert.ok(quote.json.observation.uncertainty.includes("runtime_not_observed"));
    assert.equal(quote.json.repair.complete, false);
    assert.equal(quote.json.repair.output.catalogRow.schema.properties.data.required.includes("quote"), true);
    assert.equal(quote.json.repair.input.schema.properties.data.required.includes("quote"), false);
    assert.equal(quote.json.repair.boundary.schemaMutationApplied, false);
    assert.equal(quote.json.repair.boundary.propertyTypesInferred, false);
    assert.equal(quote.json.nextAction.checker.length > 0, true);
    assert.equal(quote.json.nextAction.executable.path, "/api/public-readiness/supplied-row");
    assert.equal(quote.json.network.fetched, false);
    assert.equal(quote.json.network.requestImplCalls, 0);
    assert.equal(quote.json.checkerSafety.paymentSent, false);
    assert.equal(quote.json.checkerSafety.credentialsUsed, false);
    assert.equal(quote.json.publicDeployment.activated, false);
    assert.equal(quote.json.checked.route, "/quote");

    const invoice = await post(origin, "/api/public-readiness/supplied-row", suppliedRow({ route: "/invoice", property: "total" }));
    assert.equal(invoice.status, 200);
    assert.deepEqual(invoice.json.observation.mismatch, ["seller_response_required_path_missing:data.total"]);
    assert.notEqual(invoice.json.observation.schemaDigest, quote.json.observation.schemaDigest);
    assert.equal(invoice.json.repair.output.catalogRow.route, "/invoice");
    assert.equal(invoice.json.checked.route, "/invoice");

    const absent = await post(origin, "/api/public-readiness/supplied-row", suppliedRow({
      route: "/quote",
      property: "quote",
      schema: null,
      example: { data: { quote: SENTINEL } },
    }));
    assert.equal(absent.status, 200);
    assert.equal(absent.json.observation.decision, "absent");
    assert.equal(absent.json.observation.checkerOk, false);
    assert.equal(absent.json.observation.readinessClaimed, false);
    assert.equal(absent.json.observation.exampleIgnored, true);
    assert.equal(absent.json.repair.output, null);
    assert.equal(absent.json.nextAction.executable, null);
    assert.equal(absent.text.includes(SENTINEL), false);
    assert.ok(absent.json.observation.uncertainty.includes("response_schema_absent"));
    assert.ok(absent.json.observation.mismatch.includes("seller_response_contract_absent"));

    const disagreed = await post(origin, "/api/public-readiness/supplied-row", suppliedRow({
      route: "/quote",
      property: "quote",
      catalogSchema: null,
    }));
    assert.equal(disagreed.status, 200);
    assert.equal(disagreed.json.observation.schemaDisagreement, true);
    assert.equal(disagreed.json.repair.output, null);
    assert.ok(disagreed.json.observation.uncertainty.includes("catalog_row_schema_differs_from_response_contract"));

    const liveGet = await post(origin, "/api/public-readiness/supplied-row", suppliedRow({
      route: "/quote",
      property: "quote",
      method: "GET",
      required: true,
    }));
    assert.equal(liveGet.status, 200);
    assert.equal(liveGet.json.network.fetched, false);
    assert.equal(liveGet.json.network.requestImplCalls, 1);
    assert.equal(liveGet.json.observation.readinessClaimed, false);
    assert.equal(liveGet.json.observation.checkerOk, false);
    assert.ok(liveGet.json.observation.findings.includes("credential_free_probe_failed"));
    assert.ok(liveGet.json.observation.uncertainty.includes("supplied_input_does_not_fetch"));

    const demonstrated = await post(origin, "/api/public-readiness/catalog-row", { fixture: "catalog-row-repair-add-required.json" });
    assert.equal(demonstrated.status, 200);
    assert.equal(demonstrated.json.mode, "fixture-demonstration");
    assert.equal(demonstrated.json.visitorSupplied, false);
    assert.equal(demonstrated.json.decision.ok, false);

    const fixtureOnSupplied = await post(origin, "/api/public-readiness/supplied-row", {
      fixture: "catalog-row-repair-complete.json",
      ...suppliedRow({ route: "/quote", property: "quote", required: true }),
    });
    assert.equal(fixtureOnSupplied.status, 400);
    assert.equal(fixtureOnSupplied.json.error.code, "fixture_demonstration_is_distinct");

    const malformed = await post(origin, "/api/public-readiness/supplied-row", "{");
    assert.equal(malformed.status, 400);
    const empty = await post(origin, "/api/public-readiness/supplied-row", {});
    assert.equal(empty.status, 400);
    assert.equal(empty.json.error.code, "invalid_shape");
    const arrayBody = await post(origin, "/api/public-readiness/supplied-row", []);
    assert.equal(arrayBody.status, 400);
    const unknown = await post(origin, "/api/public-readiness/supplied-row", {
      ...suppliedRow({ route: "/quote", property: "quote" }),
      extra: true,
    });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.json.error.code, "unknown_property");

    let deep = { end: true };
    for (let i = 0; i < 10; i += 1) deep = { nest: deep };
    const tooDeep = await post(origin, "/api/public-readiness/supplied-row", suppliedRow({
      route: "/quote",
      property: "quote",
      schema: deep,
    }));
    assert.equal(tooDeep.status, 413);
    assert.equal(tooDeep.json.error.code, "oversized_input");

    const longString = await post(origin, "/api/public-readiness/supplied-row", {
      catalogRow: {
        origin: `https://${"a".repeat(3000)}.example`,
        method: "POST",
        route: "/quote",
        requiredPaths: ["data.quote"],
      },
      responseContract: { schema: null },
    });
    assert.equal(longString.status, 413);

    const oversized = await post(origin, "/api/public-readiness/supplied-row", suppliedRow({
      route: "/quote",
      property: "quote",
      schema: null,
      example: "y".repeat(MAX_BYTES),
    }));
    assert.equal(oversized.status, 413);
    assert.equal(oversized.json.error.code, "oversized_input");
    const huge = await fetch(`${origin}/api/public-readiness/supplied-row`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: `{"pad":"${"x".repeat(1_500_000)}"}`,
    });
    assert.equal(huge.status, 413);

    resetRateLimits();
    const proto = await post(origin, "/api/public-readiness/supplied-row", "{\"catalogRow\":{\"origin\":\"https://seller.example\",\"method\":\"POST\",\"route\":\"/quote\",\"requiredPaths\":[\"data.quote\"],\"__proto__\":{\"visitorReadinessPolluted\":true}},\"responseContract\":{\"schema\":null}}");
    assert.equal(proto.status, 400);
    assert.equal(proto.json.error.code, "hostile_input");
    assert.equal(Object.prototype.visitorReadinessPolluted, undefined);

    const command = await post(origin, "/api/public-readiness/supplied-row", {
      command: `touch ${canary}`,
      catalogRow: {
        origin: "https://seller.example",
        method: "POST",
        route: "/quote",
        requiredPaths: ["data.quote"],
      },
      responseContract: { schema: { type: "object", command: `touch ${canary}` } },
    });
    assert.equal(command.status, 400);
    assert.equal(command.json.error.code, "hostile_input");
    assert.equal(existsSync(canary), false);

    const pathInput = await post(origin, "/api/public-readiness/supplied-row", suppliedRow({
      route: "/../../etc/passwd",
      property: "quote",
      schema: null,
    }));
    assert.equal(pathInput.status, 400);
    assert.equal(pathInput.json.error.code, "hostile_input");
    const privateOrigin = await post(origin, "/api/public-readiness/supplied-row", {
      catalogRow: {
        origin: "http://127.0.0.1/latest",
        method: "POST",
        route: "/quote",
        requiredPaths: ["data.quote"],
      },
      responseContract: { schema: null },
    });
    assert.equal(privateOrigin.status, 400);
    assert.equal(privateOrigin.json.error.code, "origin_refused");

    resetRateLimits();
    const concurrent = await Promise.all([
      post(origin, "/api/public-readiness/supplied-row", suppliedRow({ route: "/quote", property: "quote" })),
      post(origin, "/api/public-readiness/supplied-row", suppliedRow({ route: "/invoice", property: "total" })),
      post(origin, "/api/public-readiness/supplied-row", suppliedRow({ route: "/quote", property: "quote" })),
      post(origin, "/api/public-readiness/supplied-row", suppliedRow({ route: "/invoice", property: "total" })),
    ]);
    assert.deepEqual(concurrent.map((item) => item.status), [200, 200, 200, 200]);
    assert.deepEqual(concurrent[0].json.observation.mismatch, ["seller_response_required_path_missing:data.quote"]);
    assert.deepEqual(concurrent[1].json.observation.mismatch, ["seller_response_required_path_missing:data.total"]);

    resetRateLimits();
    const previousLimit = process.env.AGENT_READINESS_RATE_LIMIT;
    process.env.AGENT_READINESS_RATE_LIMIT = "2";
    try {
      const first = await post(origin, "/api/public-readiness/supplied-row", suppliedRow({ route: "/quote", property: "quote" }));
      const second = await post(origin, "/api/public-readiness/supplied-row", suppliedRow({ route: "/invoice", property: "total" }));
      const third = await post(origin, "/api/public-readiness/supplied-row", suppliedRow({ route: "/quote", property: "quote" }));
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.equal(third.status, 429);
      assert.equal(third.json.error.code, "rate_limit");
      assert.equal(third.headers.get("retry-after") > 0, true);
    } finally {
      if (previousLimit === undefined) delete process.env.AGENT_READINESS_RATE_LIMIT;
      else process.env.AGENT_READINESS_RATE_LIMIT = previousLimit;
      resetRateLimits();
    }

    const state = join(scratch, "state.json");
    const rowFile = join(scratch, "quote.json");
    writeFileSync(rowFile, JSON.stringify(suppliedRow({ route: "/quote", property: "quote" })));
    const began = await runClient(["begin", "--origin", origin, "--in", rowFile, "--state", state]);
    assert.equal(began.status, 0, `${began.stdout}\n${began.stderr}`);
    const beganJson = lastJson(began.stdout);
    assert.equal(beganJson.repair, true);
    assert.equal(beganJson.readinessClaimed, false);
    assert.equal(beganJson.commit, CHECKER_COMMIT);
    const persisted = JSON.parse(readFileSync(state, "utf8"));
    assert.equal(persisted.response.repair.output.catalogRow.route, "/quote");
    assert.equal(persisted.response.observation.schemaDigest, quote.json.observation.schemaDigest);

    const resumed = await runClient(["resume", "--state", state, "--route", "/quote-rechecked"]);
    assert.equal(resumed.status, 0, `${resumed.stdout}\n${resumed.stderr}`);
    const resumedJson = lastJson(resumed.stdout);
    assert.equal(resumedJson.route, "/quote-rechecked");
    assert.equal(resumedJson.checkerOk, true);
    assert.equal(resumedJson.repairComplete, true);
    assert.equal(resumedJson.readinessClaimed, false);
    assert.equal(resumedJson.fetched, false);
    assert.deepEqual(resumedJson.findings, []);
    assert.notEqual(resumedJson.schemaDigest, quote.json.observation.schemaDigest);
    assert.equal(JSON.parse(readFileSync(state, "utf8")).response.checked.route, "/quote");

    const unchanged = await runClient(["resume", "--state", state, "--route", "/quote"]);
    assert.equal(unchanged.status, 2);

    const offline = await runClient(["offline", "--state", state, "--route", "/offline-recheck"]);
    assert.equal(offline.status, 0, `${offline.stdout}\n${offline.stderr}`);
    const offlineJson = lastJson(offline.stdout);
    assert.equal(offlineJson.route, "/offline-recheck");
    assert.equal(offlineJson.checkerOk, true);
    assert.equal(offlineJson.repairComplete, true);
    assert.equal(offlineJson.readinessClaimed, false);
    assert.equal(offlineJson.fetched, false);
    assert.equal(offlineJson.commit, CHECKER_COMMIT);
    assert.deepEqual(offlineJson.findings, []);
    assert.equal(offlineJson.schemaDigest, resumedJson.schemaDigest);

    const rejected = await runClient(["offline", "--state", state, "--route", "/negative-target", "--required", "data.absent"]);
    assert.equal(rejected.status, 0, `${rejected.stdout}\n${rejected.stderr}`);
    const rejectedJson = lastJson(rejected.stdout);
    assert.equal(rejectedJson.checkerOk, false);
    assert.equal(rejectedJson.readinessClaimed, false);
    assert.ok(rejectedJson.findings.includes("seller_response_required_path_missing:data.absent"));

    const footer = readFileSync(join(repoRoot, "client/src/components/Footer.tsx"), "utf8");
    const llms = readFileSync(join(repoRoot, "client/public/llms.txt"), "utf8");
    const sitemap = readFileSync(join(repoRoot, "client/public/sitemap.xml"), "utf8");
    assert.equal(footer.includes("Agent readiness checker"), false);
    assert.equal(llms.includes("Free Agent Readiness Checker"), false);
    assert.equal(sitemap.includes("https://samedaydesk.com/agent-readiness"), false);
    const preview = readFileSync(join(repoRoot, "tools/l08-agent-repair/preview/WITHHELD-HUMAN-DELTA.md"), "utf8");
    assert.match(preview, /Agent readiness checker/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    if (typeof server.closeAllConnections === "function") server.closeAllConnections();
    await close(server);
  }
});

test("supplied-row limits overlapping checker work", async () => {
  resetRateLimits();
  let release = () => {};
  let entered = () => {};
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const enteredPromise = new Promise((resolve) => {
    entered = resolve;
  });
  const app = createSdsApp({
    publicReadiness: {
      maxInFlight: 1,
      runSupplied() {
        entered();
        return gate.then(() => ({ held: true }));
      },
    },
  });
  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;
  try {
    const first = post(origin, "/api/public-readiness/supplied-row", suppliedRow({ route: "/quote", property: "quote" }));
    await enteredPromise;
    const second = await post(origin, "/api/public-readiness/supplied-row", suppliedRow({ route: "/invoice", property: "total" }));
    assert.equal(second.status, 429);
    assert.equal(second.json.error.code, "busy");
    assert.equal(second.headers.get("retry-after"), "1");
    release();
    const finished = await first;
    assert.equal(finished.status, 200);
    assert.equal(finished.json.held, true);
  } finally {
    release();
    if (typeof server.closeAllConnections === "function") server.closeAllConnections();
    await close(server);
    resetRateLimits();
  }
});
