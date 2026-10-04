// Mounted producer outputs only; no public probe, charge, or real license.
import dns from "node:dns/promises";
import http from "node:http";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "sds-boundary-replay-"));
process.env.PULSE_FILE = join(dir, "pulse.json");
delete process.env.AGENT_READINESS_TRUSTED_PROXIES;
const { createSdsApp } = await import("../../server/app.js");
const { pulseSnapshot } = await import("../../server/lib/pulse.js");
const { clientKey } = await import("../../server/lib/agent-readiness/rate-limit.js");
const { fixPackLicenseDeps } = await import("../../server/lib/fixpack-license.js");
const { planToolArguments } = await import("../../server/lib/apex-declarations.js");
let licenseReads = 0;
let siteFetches = 0;
const saved = { fetch: globalThis.fetch, lookup: dns.lookup, ...fixPackLicenseDeps };
fixPackLicenseDeps.isConfigured = () => true;
fixPackLicenseDeps.getStripe = () => ({ checkout: { sessions: { retrieve: async (id) => {
  licenseReads++;
  return { payment_status: id === "cs_test_boundary_denied" ? "unpaid" : "paid", currency: "usd", amount_total: 3900, metadata: { offer: "ai_fix_pack" } };
} } } });
dns.lookup = async () => [{ address: "8.8.8.8", family: 4 }];
globalThis.fetch = async (url, options) => {
  if (String(url).startsWith("http://127.0.0.1:")) return saved.fetch(url, options);
  siteFetches++;
  return new Response('<title>Fixture Site</title><meta name="description" content="This controlled fixture is for local paid delivery only."><h1>Fixture</h1>', { status: 200 });
};
const server = http.createServer(createSdsApp());
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const call = { jsonrpc: "2.0", id: "fixture", method: "tools/call", params: { name: "generate_complete_fix_pack", arguments: { url: "https://fixture.example", license: "cs_test_boundary_fixture" } } };
const ping = { jsonrpc: "2.0", id: 1, method: "ping" };
const cases = [
  ["missing-jsonrpc", { ...call, jsonrpc: undefined }],
  ["wrong-jsonrpc", { ...call, jsonrpc: "1.0" }],
  ...[null, true, 1.5, [], {}].map(id => [`invalid-id-${JSON.stringify(id)}`, { ...call, id }]),
  ...[null, 42, "", "x".repeat(129)].map(method => [`invalid-method-${JSON.stringify(method)}`, { ...call, method }]),
  ...[null, true, 42, "bad", []].map(params => [`invalid-params-${JSON.stringify(params)}`, { ...call, params }]),
  ["invalid-tool-arguments", { ...call, params: { ...call.params, arguments: [] } }],
  ["primitive", 7], ["null", null], ["array-entry", [[]]],
  ["empty-batch", []],
  ["oversized-batch", Array.from({ length: 26 }, (_, id) => ({ ...call, id }))],
  ["mixed-invalid", [call, null, false, [], { ...ping, method: 42 }, { ...ping, method: "unknown" }]],
  ["mixed-initialize-unsupported", [{ jsonrpc: "2.0", id: 0, method: "initialize" }, call], { "mcp-protocol-version": "1999-01-01" }],
  ["modern-batch", [ping], { "mcp-protocol-version": "2025-11-25" }],
  ...["ping", "tools/list", "notifications/initialized", "notifications/cancelled", "unknown"].map(method => [`notification-${method}`, { jsonrpc: "2.0", method }]),
  ["notification-paid", { ...call, id: undefined }],
  ["response", { jsonrpc: "2.0", id: 1, result: {} }],
  ["malformed", '{"license":"cs_test_boundary_fixture",'],
  ["body-budget", JSON.stringify({ ...call, padding: "x".repeat(1024 * 1024) })],
  ["normal-initialize", { jsonrpc: "2.0", id: "init", method: "initialize", params: { protocolVersion: "2025-11-25" } }],
  ["normal-tools-list", { jsonrpc: "2.0", id: "list", method: "tools/list" }],
  ["normal-no-key-plan", { jsonrpc: "2.0", id: "plan", method: "tools/call", params: { name: "plan_taskmarket_delegation", arguments: planToolArguments() } }],
  ["normal-paid-fixture", call],
  ["invalid-license-fixture", { ...call, params: { ...call.params, arguments: { ...call.params.arguments, license: "cs_test_boundary_denied" } } }],
];
const outputs = [];
try {
  for (const [name, body, headers = {}] of cases) {
    const before = { licenseReads, siteFetches, protocol: pulseSnapshot().mcpProtocol };
    const response = await fetch(`${origin}/mcp`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
    const raw = await response.text();
    let json;
    try { json = JSON.parse(raw); } catch { json = null; }
    // tools/list is checked elsewhere; store the received inventory names and hash.
    if (json?.result?.tools) json.result.tools = json.result.tools.map(t => t.name);
    const after = pulseSnapshot().mcpProtocol;
    outputs.push({ name, status: response.status, headers: Object.fromEntries(response.headers), received: json || raw, rawBytes: Buffer.byteLength(raw), sha256: createHash("sha256").update(raw).digest("hex"), executed: { licenseReads: licenseReads - before.licenseReads, siteFetches: siteFetches - before.siteFetches }, observed: { requests: after.httpRequests - before.protocol.httpRequests, messages: after.messages - before.protocol.messages, tools: (after.toolCallsByName.counts.generate_complete_fix_pack || 0) - (before.protocol.toolCallsByName.counts.generate_complete_fix_pack || 0) } });
  }
  const license = await fetch(`${origin}/mcp?cs=cs_test_boundary_fixture`);
  const rateKeys = ["1.1.1.1, 8.8.8.8", "9.9.9.9, 8.8.8.8", "not-an-ip", "::ffff:8.8.8.8"].map(xff => ({ xff, key: clientKey({ socket: { remoteAddress: "10.0.0.1" }, headers: { "x-forwarded-for": xff } }) }));
  const output = { outputs, rateKeys, licenseReturn: { status: license.status, headers: Object.fromEntries(license.headers), received: await license.text() }, safety: "All site fetches, DNS and Stripe session retrievals use controlled adapters; listener is loopback." };
  writeFileSync(process.argv[2] || join(dir, "received.json"), JSON.stringify(output, null, 2) + "\n");
  console.log(JSON.stringify({ cases: outputs.length, licenseReads, siteFetches, rateKeys }));
} finally {
  await new Promise(resolve => server.close(resolve));
  globalThis.fetch = saved.fetch;
  dns.lookup = saved.lookup;
  fixPackLicenseDeps.getStripe = saved.getStripe;
  fixPackLicenseDeps.isConfigured = saved.isConfigured;
  fixPackLicenseDeps.now = saved.now;
  rmSync(dir, { recursive: true, force: true });
}
