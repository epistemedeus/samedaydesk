import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const key = (tool, reason, source = "unattributed") => `${source}|${tool}|refusal_${reason}`;

test("mounted refusal decisions survive the existing observer/store/protected summary", async t => {
  const dir = mkdtempSync(join(tmpdir(), "root5950-http-"));
  process.env.PULSE_FILE = join(dir, "startup.json");
  process.env.PULSE_TOKEN = "root5950-loopback";
  const pulse = await import("../lib/pulse.js");
  pulse.__pulseTestInternals().stopScheduledFlush();
  const { createPulseStoreFromTransport } = await import("../lib/pulse-store/index.js");
  const { createFakePulseAuthority, createFakeRpcTransport } = await import("./helpers/fake-pulse-authority.js");
  const authority = createFakePulseAuthority();
  const store = createPulseStoreFromTransport(createFakeRpcTransport(authority));
  pulse.configurePulseStoreForTests({ store, fallbackFile: join(dir, "wal.json") });
  await pulse.waitForPulseHydration();
  const { createSdsApp } = await import("../app.js");
  const server = http.createServer(createSdsApp());
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); rmSync(dir, { recursive: true, force: true }); });
  const request = (body, headers = {}, path = "/mcp", method = "POST") => new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: server.address().port, path, method, headers: { "content-type": "application/json", ...headers } }, res => {
      let raw = "";
      res.on("data", chunk => { raw += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, raw, json: raw ? JSON.parse(raw) : null }));
    });
    req.on("error", reject);
    req.end(body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body));
  });
  assert.equal((await request({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { "mcp-protocol-version": "unsupported-secret" })).status, 400);
  assert.equal((await request({ invalid: "body-secret" })).status, 400);
  pulse.__pulseTestInternals().admitPendingDeltaToWal();
  await pulse.__pulseTestInternals().drainPendingFlushes();
  assert.equal((await request(undefined, {}, "/api/pulse", "GET")).status, 404);
  const snapshot = (await request(undefined, {}, "/api/pulse?k=root5950-loopback", "GET")).json;
  assert.equal(snapshot.mcpProtocol.outcomes.counts["unattributed|_none|protocol_error"], 2);
  assert.equal(snapshot.mcpProtocol.outcomes.counts[key("_none", "unsupported_protocol")], 1);
  assert.equal(snapshot.mcpProtocol.outcomes.counts[key("_none", "invalid_request")], 1);
  assert.equal(readFileSync(join(dir, "wal.json"), "utf8").includes("secret"), false);
});
