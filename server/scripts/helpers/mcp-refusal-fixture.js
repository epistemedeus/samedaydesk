import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function loopbackRequest(server, body, headers = {}, path = "/mcp", method = "POST") {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: server.address().port, path, method, headers: { "content-type": "application/json", ...headers } }, res => {
      let raw = "";
      res.on("data", chunk => { raw += chunk; });
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(raw); } catch { /* empty/GET text */ }
        resolve({ status: res.statusCode, raw, json, headers: res.headers });
      });
    });
    req.on("error", reject);
    req.end(body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body));
  });
}

export async function mountRefusalFixture(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "root5950-http-"));
  process.env.PULSE_FILE = join(dir, "startup.json");
  process.env.PULSE_TOKEN = "root5950-loopback";
  const pulse = await import("../../lib/pulse.js");
  pulse.__pulseTestInternals().stopScheduledFlush();
  const { createFileFallbackStore, createPulseStoreFromTransport } = await import("../../lib/pulse-store/index.js");
  const { createFakePulseAuthority, createFakeRpcTransport } = await import("./fake-pulse-authority.js");
  const authority = createFakePulseAuthority();
  const store = options.store || createPulseStoreFromTransport(createFakeRpcTransport(authority));
  const wal = join(dir, "wal.json");
  const fallback = createFileFallbackStore(wal, options.fallbackOptions);
  pulse.configurePulseStoreForTests({ store, fileFallback: fallback });
  await pulse.waitForPulseHydration();
  const { createSdsApp } = await import("../../app.js");
  const server = http.createServer(createSdsApp());
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); rmSync(dir, { recursive: true, force: true }); });
  const request = (...args) => loopbackRequest(server, ...args);
  return {
    dir, wal, pulse, store, fallback, authority, request, server,
    async drain() {
      pulse.__pulseTestInternals().admitPendingDeltaToWal();
      await pulse.__pulseTestInternals().drainPendingFlushes();
    },
    async summary() {
      const result = await request(undefined, {}, "/api/pulse?k=root5950-loopback", "GET");
      if (result.status !== 200) throw new Error("protected_loopback_summary_failed");
      return result.json;
    },
  };
}
