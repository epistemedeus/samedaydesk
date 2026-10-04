import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { classifyRetrieval } from "../lib/agent-readiness/retrieval.js";
import { runChecks } from "../lib/agent-readiness/checks.js";
import { publicDeploymentBody } from "../lib/public-readiness-mount.js";
import { buildTaskMarketDelegationPlan } from "../lib/taskmarket.js";
import { NOT_FOUND_SHELL, ROUTE_SHELL_DIR, shellFileName } from "../lib/spa-route-shells.js";
import { pulseSnapshot } from "../lib/pulse.js";
import { createSdsApp } from "../app.js";
import {
  assertMachineDeclarationContract,
  machineDeclarationProblems,
  planToolArguments,
} from "../lib/apex-declarations.js";
import { TOOLS } from "../routes/mcp.js";

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

function request(port, { method = "GET", path, headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, method, path, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let json = null;
        if (raw) {
          try { json = JSON.parse(raw); } catch { json = null; }
        }
        resolve({ status: res.statusCode, headers: res.headers, body: raw, json });
      });
    });
    req.on("error", reject);
    if (body !== undefined) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

function lookup(value, path) {
  return String(path).split(".").reduce((current, key) => (current == null ? undefined : current[key]), value);
}

function problemsFor(expect, response, openapi) {
  const problems = [];
  if (expect.status !== undefined && response.status !== expect.status) problems.push(`status ${response.status} != ${expect.status}`);
  const type = String(response.headers["content-type"] || "");
  if (expect.contentTypeIncludes && !type.includes(expect.contentTypeIncludes)) problems.push(`content-type ${type}`);
  if (expect.bodyIncludes && !response.body.includes(expect.bodyIncludes)) problems.push(`body missing ${expect.bodyIncludes}`);
  for (const [path, expected] of Object.entries(expect.equals || {})) {
    const actual = lookup(response.json, path);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) problems.push(`${path} = ${JSON.stringify(actual)}`);
  }
  for (const path of expect.absent || []) {
    if (lookup(response.json, path) !== undefined) problems.push(`${path} should be absent`);
  }
  if (expect.toolsMatchPublished) {
    const listed = response.json?.result?.tools;
    const published = openapi["x-mcp-tools"];
    if (!Array.isArray(listed) || listed.length !== published.length) problems.push("tool count");
    else {
      for (let i = 0; i < published.length; i += 1) {
        const left = published[i];
        const right = listed[i];
        if (left.name !== right.name || left.description !== right.description) problems.push(`tool text ${left.name}`);
        if (JSON.stringify(left.inputSchema) !== JSON.stringify(right.inputSchema)) problems.push(`schema ${left.name}`);
        if (JSON.stringify(left.annotations) !== JSON.stringify(right.annotations)) problems.push(`annotations ${left.name}`);
      }
    }
  }
  return problems;
}

test("discovery documents are acquired over HTTP and a free tool returns a useful plan", async (t) => {
  const app = createSdsApp();
  const { server, port } = await listen(app);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const beforePulse = pulseSnapshot();

  const openapiResponse = await request(port, { path: "/openapi.json", headers: { accept: "application/json", "user-agent": "Mozilla/5.0 discovery-replay" } });
  const skillResponse = await request(port, { path: "/skill.md", headers: { accept: "text/markdown", "user-agent": "Mozilla/5.0 discovery-replay" } });
  const catalogResponse = await request(port, { path: "/.well-known/api-catalog", headers: { accept: "application/linkset+json", "user-agent": "Mozilla/5.0 discovery-replay" } });
  assert.equal(openapiResponse.status, 200);
  assert.match(openapiResponse.headers["content-type"], /^application\/openapi\+json/);
  assert.match(skillResponse.headers["content-type"], /^text\/markdown/);
  assert.match(catalogResponse.headers["content-type"], /^application\/linkset\+json/);
  assert.match(catalogResponse.headers["content-type"], /profile="https:\/\/www\.rfc-editor\.org\/info\/rfc9727"/);
  assert.equal(openapiResponse.headers["access-control-allow-origin"], "*");
  assert.match(openapiResponse.headers.link, /rel="api-catalog"/);
  assert.equal(openapiResponse.body.trim().startsWith("{"), true);
  assert.equal(skillResponse.body.includes("<!doctype html"), false);
  assert.equal(catalogResponse.body.includes("<!doctype html"), false);

  for (const path of ["/openapi.json", "/skill.md", "/.well-known/api-catalog"]) {
    const head = await request(port, { method: "HEAD", path });
    assert.equal(head.status, 200, path);
    assert.equal(head.body, "", path);
    assert.equal(Number(head.headers["content-length"]) > 0, true, path);
    const options = await request(port, { method: "OPTIONS", path, headers: { origin: "https://example.com", "access-control-request-method": "GET" } });
    assert.equal(options.status, 204, path);
    assert.equal(options.headers["access-control-allow-origin"], "*");
    assert.match(options.headers["access-control-allow-methods"], /GET/);
    assert.match(options.headers["access-control-allow-methods"], /HEAD/);
    assert.match(options.headers["access-control-allow-methods"], /OPTIONS/);
  }

  const openapi = openapiResponse.json;
  const catalog = catalogResponse.json;
  assertMachineDeclarationContract(openapi, skillResponse.body, catalog, TOOLS);
  const acquisition = {
    source: "server/lib/apex-declarations.js",
    responses: {
      "/openapi.json": { status: openapiResponse.status, sha256: createHash("sha256").update(openapiResponse.body).digest("hex") },
      "/skill.md": { status: skillResponse.status, sha256: createHash("sha256").update(skillResponse.body).digest("hex") },
      "/.well-known/api-catalog": { status: catalogResponse.status, sha256: createHash("sha256").update(catalogResponse.body).digest("hex") },
    },
  };

  const examples = openapi["x-copyable-no-key-examples"];
  assert.ok(examples.length >= 4);
  const servedExamples = new Map();
  for (const example of examples) {
    const response = await request(port, { method: example.method, path: example.path, headers: example.headers, body: example.body });
    const problems = problemsFor(example.expect, response, openapi);
    assert.deepEqual(problems, [], `${example.id}: ${response.status} ${response.body.slice(0, 400)}`);
    servedExamples.set(example.id, response);
    acquisition[example.id] = { status: response.status, sha256: createHash("sha256").update(response.body).digest("hex") };
  }

  const planExample = examples.find((example) => example.id === "plan_taskmarket_delegation");
  const changedArguments = {
    ...planExample.body.params.arguments,
    request: "CHANGED-INPUT-discovery-replay-1004 list the sections that differ",
    deliverable: "CHANGED-OUTPUT-discovery-replay-1004 two markdown bullets",
  };
  const changedBody = {
    ...planExample.body,
    id: "plan-changed",
    params: { ...planExample.body.params, arguments: changedArguments },
  };
  const changed = await request(port, { method: "POST", path: "/mcp", headers: { "content-type": "application/json" }, body: changedBody });
  assert.equal(changed.status, 200);
  const structured = changed.json?.result?.structuredContent;
  const expectedPlan = buildTaskMarketDelegationPlan(changedArguments);
  assert.equal(structured.plan_id, expectedPlan.plan_id);
  assert.equal(structured.request.executed, false);
  assert.equal(structured.official_cli.executed, false);
  assert.equal(structured.authorization.state, "approval_required");
  assert.match(structured.request.body.description, /CHANGED-INPUT-discovery-replay-1004/);
  assert.notEqual(structured.plan_id, buildTaskMarketDelegationPlan(planToolArguments()).plan_id);
  acquisition.changedPlan = { plan_id: structured.plan_id, executed: structured.request.executed };

  const servedNegatives = new Map();
  for (const example of openapi["x-useful-negatives"]) {
    const response = await request(port, { method: example.method, path: example.path, headers: example.headers, body: example.body });
    const problems = problemsFor(example.expect, response, openapi);
    assert.deepEqual(problems, [], `${example.id}: ${response.status} ${response.body.slice(0, 400)}`);
    servedNegatives.set(example.id, response);
  }

  const mutated = structuredClone(openapi);
  mutated["x-mcp-tools"][0].inputSchema = { type: "object", properties: { url: { type: "number" } }, required: ["url"] };
  const drift = machineDeclarationProblems(mutated, skillResponse.body, catalog, TOOLS);
  assert.ok(drift.some((problem) => problem.includes("drifted")));
  assert.throws(() => assertMachineDeclarationContract(mutated, skillResponse.body, catalog, TOOLS));

  const correspondence = await request(port, { path: "/api/correspondence/healthz" });
  assert.deepEqual(correspondence.json, { ok: false, enabled: false, reason: "unconfigured" });
  const hosted = await request(port, { path: "/api/hosted-useful/healthz" });
  assert.equal(hosted.json.productionReady, false);
  assert.equal(hosted.json.publicationVerified, false);
  assert.equal(hosted.json.enabled, false);
  const readiness = await request(port, { path: "/api/public-readiness/healthz" });
  assert.deepEqual(readiness.json.publicDeployment, publicDeploymentBody());
  assert.match(openapi.info.description, /not a hosted consumer|do not become a hosted consumer/i);

  const card = await request(port, { path: "/.well-known/agent-card.json" });
  assert.equal(card.status, 200);
  assert.equal(card.json.skills.some((skill) => skill.id === "check_ai_readiness"), true);
  assert.match(card.json.description, /agents\.samedaydesk\.com/);
  const cardOptions = await request(port, { method: "OPTIONS", path: "/.well-known/agent-card.json" });
  assert.equal(cardOptions.status, 204);
  const mcp = await request(port, { path: "/mcp" });
  assert.equal(mcp.status, 200);
  assert.match(mcp.body, /samedaydesk agent tools/);
  const missingApi = await request(port, { path: "/api/not-a-route" });
  assert.equal(missingApi.status, 404);
  assert.equal(missingApi.json.error, "Not found");

  const publishedLlms = readFileSync(new URL("../../client/public/llms.txt", import.meta.url), "utf8");
  assert.match(publishedLlms, /https:\/\/samedaydesk\.com\/openapi\.json/);
  assert.match(publishedLlms, /https:\/\/samedaydesk\.com\/skill\.md/);
  assert.match(publishedLlms, /https:\/\/samedaydesk\.com\/\.well-known\/api-catalog/);
  assert.match(publishedLlms, /https:\/\/samedaydesk\.com\/\.well-known\/agent-card\.json/);

  function probeResponse(response) {
    return {
      status: response.status,
      body: response.body,
      contentType: String(response.headers["content-type"] || ""),
      headers: response.headers,
    };
  }
  const corsPreflight = {};
  for (const path of ["/openapi.json", "/.well-known/api-catalog", "/.well-known/agent-card.json", "/mcp"]) {
    const options = await request(port, {
      method: "OPTIONS",
      path,
      headers: { origin: "https://agent.example", "access-control-request-method": "GET" },
    });
    corsPreflight[path] = { status: options.status, headers: options.headers };
  }
  const bundle = {
    schema: "agent-readiness.probe.v1",
    host: "samedaydesk.com",
    probedAt: "2026-10-04T00:00:00.000Z",
    responses: {
      "/openapi.json": probeResponse(openapiResponse),
      "/skill.md": probeResponse(skillResponse),
      "/.well-known/api-catalog": probeResponse(catalogResponse),
      "/.well-known/agent-card.json": probeResponse(card),
      "/mcp": probeResponse(mcp),
    },
    corsPreflight,
    mcp: {
      url: "https://samedaydesk.com/mcp",
      offeredVersion: servedExamples.get("mcp_initialize").json.result.protocolVersion,
      initialize: servedExamples.get("mcp_initialize").json,
      toolsList: servedExamples.get("mcp_tools_list").json,
      unknownToolCall: servedNegatives.get("unknown_tool").json,
    },
  };
  const checks = runChecks(bundle).checks;
  const byId = Object.fromEntries(checks.map((check) => [check.id, check]));
  const mustPass = [
    "openapi.parses",
    "openapi.version",
    "openapi.operationId",
    "openapi.summary",
    "openapi.security",
    "openapi.public",
    "discovery.skill",
    "apiCatalog.present",
    "apiCatalog.contentType",
    "mcp.initialize",
    "mcp.version",
    "mcp.tools",
    "mcp.inputSchema",
    "mcp.annotations",
    "mcp.unknownTool",
    "agentCard.present",
    "agentCard.skills",
    "cors.preflight",
    "usability.openapi.examples",
    "usability.openapi.idempotency",
    "usability.openapi.pagination",
  ];
  for (const id of mustPass) assert.equal(byId[id]?.status, "pass", `${id}: ${byId[id]?.status} ${byId[id]?.reason}`);
  assert.equal(byId["usability.openapi.errors"].status, "warn");
  assert.doesNotMatch(byId["usability.openapi.errors"].reason, /check_ai_readiness|check_agent_readiness|generate_llms_txt|mcpJsonRpc/);
  assert.equal(byId["apiCatalog.links"].status, "warn");
  acquisition.checker = {
    warn: checks.filter((check) => check.status === "warn").map((check) => `${check.id}: ${check.reason}`),
    fail: checks.filter((check) => check.status === "fail").map((check) => `${check.id}: ${check.reason}`),
  };

  const afterPulse = pulseSnapshot();
  assert.equal(afterPulse.humans, beforePulse.humans);
  assert.ok(afterPulse.declarationFetch.counts["/openapi.json"] > beforePulse.declarationFetch.counts["/openapi.json"]);
  assert.ok(afterPulse.declarationFetch.counts["/skill.md"] > beforePulse.declarationFetch.counts["/skill.md"]);
  assert.ok(afterPulse.declarationFetch.counts["/.well-known/api-catalog"] > beforePulse.declarationFetch.counts["/.well-known/api-catalog"]);
  assert.ok(afterPulse.mcpProtocol.toolCallsByName.counts.plan_taskmarket_delegation > (beforePulse.mcpProtocol.toolCallsByName.counts.plan_taskmarket_delegation || 0));
  assert.equal(JSON.stringify(afterPulse).includes("CHANGED-INPUT-discovery-replay-1004"), false);
  assert.match(afterPulse.declarationFetch.meaning, /not later usefulness/i);
  assert.match(afterPulse.mcpProtocol.meaning, /Not unique agents/i);
  acquisition.pulse = {
    declarationFetchDelta: {
      "/openapi.json": afterPulse.declarationFetch.counts["/openapi.json"] - beforePulse.declarationFetch.counts["/openapi.json"],
      "/skill.md": afterPulse.declarationFetch.counts["/skill.md"] - beforePulse.declarationFetch.counts["/skill.md"],
      "/.well-known/api-catalog": afterPulse.declarationFetch.counts["/.well-known/api-catalog"] - beforePulse.declarationFetch.counts["/.well-known/api-catalog"],
    },
    toolAttemptDelta: afterPulse.mcpProtocol.toolCallsByName.counts.plan_taskmarket_delegation - (beforePulse.mcpProtocol.toolCallsByName.counts.plan_taskmarket_delegation || 0),
    humansUnchanged: afterPulse.humans === beforePulse.humans,
    deliveryStoredInPulse: false,
  };
  assert.equal(acquisition.pulse.toolAttemptDelta, 4);
  assert.equal(acquisition.pulse.humansUnchanged, true);
  t.diagnostic(JSON.stringify(acquisition));
});

test("published response variants match the actual HTTP transports", async (t) => {
  const { server, port } = await listen(createSdsApp());
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { json: spec } = await request(port, { path: "/openapi.json" });
  const transport = spec.paths["/mcp"].post;
  assert.equal(transport.requestBody.content["application/json"].schema.anyOf[1].type, "array");
  const variants = transport.responses["200"].content["application/json"].schema.anyOf;
  assert.equal(variants.some((schema) => schema.$ref?.endsWith("/JsonRpcError")), true);
  assert.equal(variants.some((schema) => schema.type === "array"), true);

  const batch = await request(port, { method: "POST", path: "/mcp",
    headers: { "content-type": "application/json" },
    body: [{ jsonrpc: "2.0", id: 1, method: "ping" },
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "unknown" } }] });
  assert.equal(batch.status, 200);
  assert.equal(Array.isArray(batch.json), true);
  assert.deepEqual(batch.json[0].result, {});
  assert.equal(batch.json[1].error.code, -32602);
  const notification = await request(port, { method: "POST", path: "/mcp",
    headers: { "content-type": "application/json" },
    body: { jsonrpc: "2.0", method: "notifications/initialized" } });
  assert.equal(notification.status, 202);
  assert.equal(notification.body, "");
  const malformed = await request(port, { method: "POST", path: "/mcp",
    headers: { "content-type": "application/json" }, body: "{" });
  assert.equal(malformed.status, 400);
  // JSON-RPC parse errors have a distinct -32700 machine error; MCP parser
  // failures must not fall through to Express's HTML/default logging boundary.
  assert.match(malformed.headers["content-type"], /application\/json/);
  assert.equal(malformed.json.error.code, -32700);
  assert.ok(transport.responses["400"].content["application/json"]);
  assert.ok(transport.responses["413"].content["application/json"]);

  const form = await request(port, { path: "/agent-readiness" });
  assert.equal(form.status, 200);
  assert.match(form.headers["content-type"], /text\/html/);
  const readiness = spec.paths["/agent-readiness"].get.responses;
  assert.ok(readiness["200"].content["text/html"]);
  assert.ok(readiness["200"].content["text/markdown"]);
  assert.ok(readiness["400"].content["text/html"]);
  const selfExample = spec.paths["/openapi.json"].get.responses["200"].content["application/openapi+json"];
  for (const key of selfExample.schema.required) assert.ok(key in selfExample.example);
});

test("production fallback keeps declarations out of the HTML shell and preserves old routes", async (t) => {
  const dist = mkdtempSync(join(tmpdir(), "apex-decl-"));
  t.after(() => rmSync(dist, { recursive: true, force: true }));
  writeFileSync(join(dist, "index.html"), "<!doctype html><html><body>spa-shell</body></html>");
  writeFileSync(join(dist, "openapi.json"), "{\"openapi\":\"static-decoy\"}");
  mkdirSync(join(dist, ROUTE_SHELL_DIR), { recursive: true });
  writeFileSync(
    join(dist, ROUTE_SHELL_DIR, shellFileName(NOT_FOUND_SHELL.path)),
    "<!doctype html><html><body>requested page does not exist</body></html>",
  );
  // isProd and the client dist are read when server/app.js loads, so this has
  // to be a process whose environment is already production.
  const child = spawn(process.execPath, ["--input-type=module", "--eval", `
    import { createSdsApp } from "./server/app.js";
    const server = createSdsApp().listen(0, "127.0.0.1", () => {
      process.send({ port: server.address().port });
    });
  `], {
    cwd: new URL("../../", import.meta.url).pathname,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: "production",
      SAMEDAYDESK_CLIENT_DIST: dist,
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 1000);
    try { await exited; } finally { clearTimeout(timer); }
  });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(output || "production child did not listen")), 8000);
    child.once("message", (message) => { clearTimeout(timer); resolve(message.port); });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`child exited ${code}: ${output}`)); });
  });

  const openapi = await request(port, { path: "/openapi.json" });
  assert.equal(openapi.status, 200);
  assert.equal(openapi.json.openapi, "3.1.0");
  assert.equal(openapi.body.includes("static-decoy"), false);
  const skill = await request(port, { path: "/skill.md" });
  assert.match(skill.headers["content-type"], /text\/markdown/);
  assert.equal(skill.body.includes("spa-shell"), false);
  const unknownMachine = await request(port, { path: "/this-path-does-not-exist.json" });
  assert.equal(unknownMachine.status, 404);
  assert.match(unknownMachine.headers["content-type"], /text\/plain/);
  assert.equal(unknownMachine.body, "Not found\n");
  assert.equal(unknownMachine.body.includes("spa-shell"), false);
  const unknownCatalog = await request(port, { path: "/.well-known/not-a-catalog" });
  assert.equal(unknownCatalog.status, 404);
  assert.match(unknownCatalog.headers["content-type"], /text\/plain/);
  const login = await request(port, { path: "/login" });
  assert.equal(login.status, 200);
  assert.match(login.headers["content-type"], /html/);
  assert.match(login.body, /spa-shell/);
  const unknownHuman = await request(port, { path: "/this-path-does-not-exist-xyz" });
  assert.equal(unknownHuman.status, 404);
  assert.match(unknownHuman.headers["content-type"], /html/);
  assert.match(unknownHuman.body, /requested page does not exist/);
  assert.notEqual(unknownHuman.status, 200);
});

test("refusal and truncated retrieval stay distinct from a missing declaration", () => {
  const base = {
    schema: "agent-readiness.probe.v1",
    host: "fixture.example",
    probedAt: "2026-10-04T00:00:00Z",
    responses: {
      "/llms.txt": { status: 404 },
      "/skill.md": { status: 404 },
      "/openapi.json": { status: 404 },
      "/.well-known/agent-card.json": { status: 404 },
      "/.well-known/api-catalog": { status: 404 },
      "/.well-known/x402": { status: 404 },
      "/mcp": { status: 404 },
      "/robots.txt": { status: 404 },
    },
  };
  assert.equal(classifyRetrieval({ status: 200, body: "{", truncated: true, contentType: "application/json" }).kind, "budget");
  const truncated = {
    ...base,
    responses: {
      ...base.responses,
      "/openapi.json": { status: 200, body: "{\"openapi\":\"3.1.0\"", truncated: true, contentType: "application/openapi+json" },
    },
  };
  const truncatedCheck = runChecks(truncated).checks.find((check) => check.id === "openapi.parses");
  assert.match(truncatedCheck.reason, /cut/);
  assert.match(truncatedCheck.fix, /missing file/);
  assert.doesNotMatch(truncatedCheck.reason, /No OpenAPI document at/);

  const refused = {
    ...base,
    responses: {
      ...base.responses,
      "/openapi.json": {
        status: 403,
        contentType: "text/html",
        headers: { "cf-mitigated": "challenge" },
        body: "<!doctype html><title>Just a moment</title>",
      },
    },
  };
  const refusedCheck = runChecks(refused).checks.find((check) => check.id === "openapi.parses");
  assert.match(refusedCheck.reason, /refused/);
  assert.match(refusedCheck.reason, /not evidence it is absent/);
  assert.equal(classifyRetrieval(refused.responses["/openapi.json"]).kind, "blocked");
});
