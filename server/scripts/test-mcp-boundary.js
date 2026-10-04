import assert from "node:assert/strict";
import dns from "node:dns/promises";
import http from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test, { before, after } from "node:test";

const dir = mkdtempSync(join(tmpdir(), "sds-mcp-boundary-"));
process.env.PULSE_FILE = join(dir, "pulse.json");
process.env.PULSE_FALLBACK_FILE = join(dir, "wal.json");
const savedStripeKey = process.env.STRIPE_SECRET_KEY;
process.env.STRIPE_SECRET_KEY = "sk_test_boundary_fixture_only";
const { createSdsApp } = await import("../app.js");
const { pulseSnapshot, flushPulseSnapshot } = await import("../lib/pulse.js");
const { fixPackLicenseDeps, FIXPACK_MCP_BUY_URL, clearPaymentLinkUrlCache } = await import("../lib/fixpack-license.js");
const { MCP_TOOL_NAMES } = await import("../lib/mcp-tool-inventory.js");
const { SUPPORTED_PROTOCOL_VERSIONS, admitMcpBody, mcpAdmissionForRequest } = await import("../lib/mcp-admission.js");
const { planToolArguments } = await import("../lib/apex-declarations.js");
const { stripe } = await import("../lib/stripe.js");

const saved = { fetch: globalThis.fetch, lookup: dns.lookup, ...fixPackLicenseDeps };
let server, port;
let licenseReads = 0, siteFetches = 0, linkReads = 0;
let failLicense = false;
const validLicense = "cs_test_boundary_paid";
const paidCall = (overrides = {}) => ({ jsonrpc: "2.0", id: "paid", method: "tools/call", params: { name: "generate_complete_fix_pack", arguments: { url: "https://fixture.example", license: validLicense } }, ...overrides });
const ping = { jsonrpc: "2.0", id: 1, method: "ping" };

function request({ body, path = "/mcp", method = "POST", headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path, method, headers: { "content-type": "application/json", ...headers } }, res => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString();
        let json = null;
        try { json = JSON.parse(raw); } catch { /* parser negative/empty body */ }
        resolve({ status: res.statusCode, headers: res.headers, raw, json });
      });
    });
    req.on("error", reject);
    if (body !== undefined) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

function counts() {
  const pulse = pulseSnapshot().mcpProtocol;
  return { licenseReads, siteFetches, linkReads, requests: pulse.httpRequests, messages: pulse.messages, paid: pulse.toolCallsByName.counts.generate_complete_fix_pack || 0 };
}

async function rejected(body, code, status = 400, headers = {}) {
  const before = counts();
  const result = await request({ body, headers });
  assert.equal(result.status, status);
  assert.equal(result.json?.error?.code, code, result.raw);
  const after = counts();
  assert.equal(after.licenseReads, before.licenseReads);
  assert.equal(after.siteFetches, before.siteFetches);
  assert.equal(after.linkReads, before.linkReads);
  assert.equal(after.requests, before.requests + 1);
  assert.match(result.headers["content-type"], /application\/json/);
  assert.equal(result.headers["access-control-allow-origin"], "*");
  return result;
}

before(async () => {
  dns.lookup = async () => [{ address: "8.8.8.8", family: 4 }];
  globalThis.fetch = async () => {
    siteFetches++;
    return new Response('<title>Fixture</title><meta name="description" content="A controlled local fixture for paid delivery and free checks."><h1>Fixture</h1>', { status: 200 });
  };
  fixPackLicenseDeps.isConfigured = () => true;
  fixPackLicenseDeps.getStripe = () => ({
    checkout: { sessions: { retrieve: async (id) => {
      licenseReads++;
      if (failLicense) throw new Error("fixture license retrieval failure");
      return { payment_status: "paid", currency: "usd", amount_total: 3900, payment_link: "plink_boundary_fixture", metadata: id === validLicense ? {} : { offer: "different_offer" } };
    } } },
    paymentLinks: { retrieve: async () => { linkReads++; return { url: failLicense ? "https://buy.stripe.com/wrong_fixture_offer" : FIXPACK_MCP_BUY_URL }; } },
  });
  server = http.createServer(createSdsApp());
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  globalThis.fetch = saved.fetch;
  dns.lookup = saved.lookup;
  fixPackLicenseDeps.getStripe = saved.getStripe;
  fixPackLicenseDeps.isConfigured = saved.isConfigured;
  fixPackLicenseDeps.now = saved.now;
  clearPaymentLinkUrlCache();
  if (savedStripeKey === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = savedStripeKey;
  rmSync(dir, { recursive: true, force: true });
});

test("mounted invalid envelopes and IDs never select a license/site adapter", async () => {
  for (const body of [
    paidCall({ jsonrpc: undefined }), paidCall({ jsonrpc: "1.0" }),
    ...[null, true, 1.5, [], {}].map(id => paidCall({ id })),
    ...[null, 42, "", "x".repeat(129)].map(method => paidCall({ method })),
    null, 7, true, '"primitive"', {},
    { jsonrpc: "2.0", id: 1, method: "notifications/initialized" },
  ]) {
    const result = await rejected(body, -32600);
    assert.equal(result.json.id, null);
  }
  for (const id of [0, -1, ""]) {
    const result = await request({ body: { ...ping, id } });
    assert.equal(result.status, 200);
    assert.equal(result.json.id, id);
    assert.deepEqual(result.json.result, {});
  }
});

test("invalid params and supplied argument types are rejected before paid validation", async () => {
  for (const params of [null, true, 42, "bad", [], {}, { name: 42 }, { name: "" },
    ...[null, [], true, "bad"].map(argumentsValue => ({ name: "generate_complete_fix_pack", arguments: argumentsValue })),
    { name: "generate_complete_fix_pack", arguments: { url: ["https://fixture.example"], license: validLicense } },
    { name: "generate_complete_fix_pack", arguments: { url: "https://fixture.example", license: [validLicense] } },
  ]) {
    const result = await rejected(paidCall({ params }), -32602, 200);
    assert.equal(result.json.id, "paid");
  }
  const unknown = await request({ body: { ...ping, method: "unimplemented" } });
  assert.equal(unknown.json.error.code, -32601);
  assert.equal(unknown.json.id, 1);
  const unknownTool = await request({ body: paidCall({ params: { name: "not_real", arguments: {} } }) });
  assert.equal(unknownTool.status, 200);
  assert.equal(unknownTool.json.error.code, -32602);
  assert.match(unknownTool.json.error.message, /Unknown tool/);
});

test("all accepted notifications and responses have empty 202 bodies", async () => {
  const before = counts();
  for (const body of [
    ...["initialize", "ping", "tools/list", "notifications/initialized", "notifications/cancelled", "unknown"].map(method => ({ jsonrpc: "2.0", method })),
    paidCall({ id: undefined }),
    paidCall({ id: undefined, params: { name: "unknown_tool", arguments: {} } }),
    paidCall({ id: undefined, params: { name: "generate_complete_fix_pack", arguments: [] } }),
    { jsonrpc: "2.0", id: 1, result: {} },
    { jsonrpc: "2.0", id: "error", error: { code: -32603, message: "client error" } },
  ]) {
    const result = await request({ body, headers: { "mcp-protocol-version": "2025-11-25" } });
    assert.equal(result.status, 202);
    assert.equal(result.raw, "");
  }
  assert.equal(counts().licenseReads, before.licenseReads + 1, "a valid generic notification may execute, but never leaks delivery");
  failLicense = true;
  const failed = await request({ body: paidCall({ id: undefined }) });
  failLicense = false;
  assert.equal(failed.status, 202);
  assert.equal(failed.raw, "");
  await rejected({ jsonrpc: "2.0", id: 1, result: {}, error: { code: 1, message: "both" } }, -32600);
  await rejected({ jsonrpc: "2.0", id: null, result: {} }, -32600);
});

test("one 1..25 legacy bound; mixed invalid entries preserve valid execution and observation", async () => {
  for (const header of [null, "2025-03-26", "2024-11-05"]) {
    const headers = header ? { "mcp-protocol-version": header } : {};
    await rejected([], -32600, 400, headers);
    const before = counts();
    await rejected(Array.from({ length: 26 }, (_, id) => paidCall({ id })), -32600, 400, headers);
    assert.equal(counts().messages, before.messages);
    const full = await request({ body: Array.from({ length: 25 }, (_, id) => ({ ...ping, id })), headers });
    assert.equal(full.status, 200);
    assert.equal(full.json.length, 25);
  }
  const before = counts();
  const mixed = await request({ body: [paidCall(), null, false, [], { ...ping, jsonrpc: "1.0" }, { jsonrpc: "2.0", method: "ping" }, { ...ping, method: "missing_method" }] });
  assert.equal(mixed.status, 200);
  assert.equal(mixed.json.length, 6);
  assert.match(mixed.json[0].result.content[0].text, /Verified/);
  assert.deepEqual(mixed.json.slice(1, 5).map(entry => entry.error.code), [-32600, -32600, -32600, -32600]);
  assert.equal(mixed.json[5].error.code, -32601);
  assert.equal(counts().licenseReads, before.licenseReads + 1);
  assert.equal(counts().messages, before.messages + 3);
  assert.equal(counts().paid, before.paid + 1);
  const onlyNotifications = await request({ body: [{ jsonrpc: "2.0", method: "ping" }, { jsonrpc: "2.0", method: "unknown" }] });
  assert.equal(onlyNotifications.status, 202);
  assert.equal(onlyNotifications.raw, "");
});

test("initialize cannot exempt unrelated or invalid messages from version validation", async () => {
  for (const version of ["2025-06-18", "2025-11-25"]) await rejected([paidCall()], -32600, 400, { "mcp-protocol-version": version });
  await rejected([{ jsonrpc: "2.0", id: 0, method: "initialize" }, paidCall()], -32000, 400, { "mcp-protocol-version": "1999-01-01" });
  await rejected({ method: "initialize" }, -32000, 400, { "mcp-protocol-version": "1999-01-01" });
  await rejected({ jsonrpc: "2.0", method: "initialize" }, -32000, 400, { "mcp-protocol-version": "1999-01-01" });
  const before = counts();
  for (const version of SUPPORTED_PROTOCOL_VERSIONS) {
    const initialized = await request({ body: { jsonrpc: "2.0", id: "init", method: "initialize", params: { protocolVersion: version } }, headers: { "mcp-protocol-version": "1999-01-01" } });
    assert.equal(initialized.status, 200);
    assert.equal(initialized.json.result.protocolVersion, version);
    const listed = await request({ body: { jsonrpc: "2.0", id: "list", method: "tools/list" }, headers: { "mcp-protocol-version": version } });
    assert.deepEqual(listed.json.result.tools.map(tool => tool.name), [...MCP_TOOL_NAMES]);
  }
  assert.equal(counts().licenseReads, before.licenseReads);
});

test("MCP parse/budget errors are machine errors without body/query console leaks", async () => {
  const logs = [];
  const originalError = console.error;
  console.error = (...args) => logs.push(args.map(String).join(" "));
  try {
    const before = counts();
    const malformed = await rejected('{"license":"cs_test_boundary_secret",', -32700);
    assert.deepEqual(malformed.json, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    await rejected(JSON.stringify({ ...paidCall(), padding: "x".repeat(1024 * 1024) }), -32000, 413);
    await rejected("{}", -32000, 415, { "content-type": "application/json; charset=iso-8859-1" });
    await rejected("corrupt compressed body", -32000, 400, { "content-encoding": "gzip" });
    assert.equal(counts().messages, before.messages);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(logs, []);
  } finally { console.error = originalError; }
});

test("bearer returns and POST deliveries receive cache/referrer protections; pulse/WAL redact queries", async () => {
  for (const path of ["/mcp?cs=cs_test_boundary_secret&trace=secret_query", "/mcp/?cs=cs_test_boundary_secret"]) {
    const returned = await request({ method: "GET", path });
    assert.match(returned.raw, /cs_test_boundary_secret/);
    assert.equal(returned.headers["cache-control"], "no-store, private");
    assert.equal(returned.headers["referrer-policy"], "no-referrer");
    const head = await request({ method: "HEAD", path });
    assert.equal(head.raw, "");
    assert.equal(head.headers["cache-control"], "no-store, private");
  }
  const redirect = await request({ method: "GET", path: "/mcp?cs=cs_test_boundary_secret", headers: { host: "www.samedaydesk.com" } });
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers["cache-control"], "no-store, private");
  assert.equal(redirect.headers["referrer-policy"], "no-referrer");
  assert.match(redirect.headers.location, /cs_test_boundary_secret/);
  const delivered = await request({ body: paidCall() });
  assert.equal(delivered.headers["cache-control"], "no-store, private");
  assert.equal(delivered.headers["referrer-policy"], "no-referrer");
  assert.equal(JSON.stringify(pulseSnapshot()).includes("cs_test_boundary_secret"), false);
  flushPulseSnapshot();
  assert.equal(readFileSync(join(dir, "pulse.json.fallback.json"), "utf8").includes("cs_test_boundary_secret"), false);
  assert.equal(JSON.stringify(pulseSnapshot()).includes("secret_query"), false);
});

test("normal no-key planning, free check, paid and invalid-license fixtures retain useful behavior", async () => {
  const planned = await request({ body: { jsonrpc: "2.0", id: "plan", method: "tools/call", params: { name: "plan_taskmarket_delegation", arguments: planToolArguments() } } });
  assert.equal(planned.status, 200);
  assert.equal(planned.json.result.structuredContent.request.executed, false);
  assert.equal(planned.json.result.structuredContent.authorization.state, "approval_required");
  const free = await request({ body: { jsonrpc: "2.0", id: "free", method: "tools/call", params: { name: "check_ai_readiness", arguments: { url: "https://fixture.example" } } } });
  assert.equal(free.json.result.isError, undefined);
  assert.equal(typeof free.json.result.structuredContent.score, "number");
  const paid = await request({ body: paidCall() });
  assert.match(paid.json.result.content[0].text, /Verified/);
  for (const section of [/FAQPage/, /sitemap/, /Open Graph/]) assert.match(paid.json.result.content[0].text, section);
  failLicense = true;
  const denied = await request({ body: paidCall() });
  failLicense = false;
  assert.equal(denied.json.result.isError, true);
  assert.match(denied.json.result.content[0].text, /free starter/);
  assert.doesNotMatch(denied.json.result.content[0].text, /Verified/);
});

test("other API parser behavior and the signed raw-webhook bytes remain intact", async () => {
  const oldError = console.error;
  console.error = () => {};
  try {
    const unrelated = await request({ path: "/api/checkout", body: "{" });
    assert.equal(unrelated.status, 400);
    assert.match(unrelated.headers["content-type"], /text\/html/);
    const originalConstruct = stripe.webhooks.constructEvent;
    const oldSecret = process.env.STRIPE_WEBHOOK_SECRET;
    process.env.STRIPE_WEBHOOK_SECRET = "fixture_webhook_secret";
    let received;
    stripe.webhooks.constructEvent = body => { received = body; throw new Error("fixture bad signature"); };
    const raw = '{"not-even-valid-json":';
    try {
      const hook = await request({ path: "/api/stripe/webhook", body: raw });
      assert.equal(hook.status, 400);
      assert.match(hook.json.error, /fixture bad signature/);
      assert.equal(Buffer.isBuffer(received), true);
      assert.equal(received.toString(), raw);
    } finally {
      stripe.webhooks.constructEvent = originalConstruct;
      if (oldSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
      else process.env.STRIPE_WEBHOOK_SECRET = oldSecret;
    }
  } finally { console.error = oldError; }
});

test("observation and execution receive one admission object, including safe rejection decisions", () => {
  const req = { headers: {}, body: [ping, null, paidCall()] };
  const admission = mcpAdmissionForRequest(req);
  assert.equal(admission, mcpAdmissionForRequest(req));
  assert.deepEqual(admission.messages, [{ methodClass: "other" }, { methodClass: "tools/call", toolName: "generate_complete_fix_pack" }]);
  const oversized = admitMcpBody(Array(26).fill(paidCall()));
  assert.equal(oversized.entries.length, 0);
  assert.equal(oversized.messages.length, 0);
  assert.equal(oversized.error.error.code, -32600);
});

test("the actual generated OpenAPI receives the same admission limits and ID types", async () => {
  const { json: spec } = await request({ method: "GET", path: "/openapi.json" });
  const operation = spec.paths["/mcp"].post;
  const batch = operation.requestBody.content["application/json"].schema.anyOf.find(schema => schema.type === "array");
  assert.equal(batch.minItems, 1);
  assert.equal(batch.maxItems, 25);
  assert.deepEqual(spec.components.schemas.JsonRpcRequest.properties.id.type, ["string", "integer"]);
  assert.match(operation.description, /one message per POST/);
  assert.match(operation.description, /SDS extension/);
  assert.equal(operation.responses["400"].content["text/html"], undefined);
  assert.equal(operation.responses["413"].content["text/html"], undefined);
  assert.ok(operation.responses["415"].content["application/json"]);
});

test("async adapter failure retains sibling work and suppresses notification error details", async () => {
  const savedGetStripe = fixPackLicenseDeps.getStripe;
  fixPackLicenseDeps.getStripe = () => { throw new Error("cs_test_boundary_secret adapter failure"); };
  const before = counts();
  try {
    const mixed = await request({ body: [paidCall(), ping] });
    assert.equal(mixed.status, 200);
    assert.deepEqual(mixed.json[0], { jsonrpc: "2.0", id: "paid", error: { code: -32603, message: "Internal error" } });
    assert.deepEqual(mixed.json[1].result, {});
    assert.equal(counts().messages, before.messages + 2);
    assert.equal(counts().paid, before.paid + 1);
    const notification = await request({ body: paidCall({ id: undefined }) });
    assert.equal(notification.status, 202);
    assert.equal(notification.raw, "");
  } finally { fixPackLicenseDeps.getStripe = savedGetStripe; }
});
