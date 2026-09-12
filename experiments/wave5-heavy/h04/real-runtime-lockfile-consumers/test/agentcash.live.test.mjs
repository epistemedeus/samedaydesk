import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { LIVE_LOCKFILE_URL, PACKAGE_ROOT } from "../harness/paths.mjs";
import { loadLockfiles } from "../harness/fixtures.mjs";

const INSTALL = "/tmp/w5-h04/rr-agentcash-KaZd";
const ready = existsSync(join(INSTALL, "node_modules/@agentcash/discovery/dist/index.js"));
const skipLive = process.env.SKIP_LIVE === "1" || !ready;

test("AgentCash discover lists POST /lockfile-pin-delta as paid 0.005 x402-only", () => {
  const snippet = JSON.parse(readFileSync(
    join(PACKAGE_ROOT, "receipts/live/agentcash-discover-lockfile.json"),
    "utf8",
  ));
  assert.equal(snippet.paid, false);
  assert.equal(snippet.lockfile.path, "/lockfile-pin-delta");
  assert.equal(snippet.lockfile.method, "POST");
  assert.equal(snippet.lockfile.authHint, "paid");
  assert.equal(snippet.lockfile.priceHint, "0.005 USD");
  assert.deepEqual(snippet.lockfile.protocols, ["x402"]);
});

test("AgentCash JS check with valid body reaches live 402 terms; empty body does not", {
  timeout: 40_000,
  skip: skipLive,
}, async () => {
  const pkg = JSON.parse(readFileSync(join(INSTALL, "node_modules/@agentcash/discovery/package.json"), "utf8"));
  assert.equal(pkg.version, "1.7.5");
  const { checkEndpointSchema } = await import(pathToFileURL(join(INSTALL, "node_modules/@agentcash/discovery/dist/index.js")).href);
  const { before, after } = loadLockfiles();
  const valid = await checkEndpointSchema({
    url: LIVE_LOCKFILE_URL,
    sampleInputBody: { before, after },
    probe: true,
  });
  assert.equal(valid.found, true);
  const post = (valid.advisories || []).find((row) => row.method === "POST" && row.authMode === "paid");
  assert.ok(post, JSON.stringify(valid.advisories?.map((a) => ({ method: a.method, authMode: a.authMode }))));
  const opt = (post.paymentOptions || []).find((o) => o.protocol === "x402") || post.x402;
  const amount = opt?.amount ?? opt?.maxAmountRequired;
  assert.equal(String(amount), "5000");
  assert.equal(opt.network, "eip155:8453");
  assert.equal(opt.payTo, "0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee");

  const empty = await checkEndpointSchema({
    url: LIVE_LOCKFILE_URL,
    sampleInputBody: {},
    probe: true,
  });
  const emptyPost402 = (empty.advisories || []).find((row) => row.method === "POST" && row.paymentRequiredBody);
  assert.equal(emptyPost402, undefined);
});
