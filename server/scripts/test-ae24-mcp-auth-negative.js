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

// AE24 growth: negative auth on the paid tool (generate_complete_fix_pack). Missing or wrong license never delivers.
const call = (args) => request({ body: { jsonrpc: "2.0", id: "auth", method: "tools/call", params: { name: "generate_complete_fix_pack", arguments: { url: "https://fixture.example", ...args } } } });
function refused(r) {
  assert.equal(r.status, 200);
  assert.equal(r.json.result.isError, true, r.raw);
  assert.doesNotMatch(r.json.result.content[0].text, /Verified/);
}
test("AE24 auth: missing license is refused", async () => { refused(await call({})); });
test("AE24 auth: wrong-offer license is refused", async () => { refused(await call({ license: "cs_test_other_offer" })); });
test("AE24 auth: malformed license type is rejected without a license read", async () => {
  const before = licenseReads;
  const r = await call({ license: ["cs_test_boundary_paid"] });
  assert.ok(r.json.error || r.json.result?.isError, r.raw);
  assert.equal(licenseReads, before);
});
test("AE24 auth control: the valid license delivers", async () => {
  const r = await call({ license: validLicense });
  assert.match(r.json.result.content[0].text, /Verified/);
});
