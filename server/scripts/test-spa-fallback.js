import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";
import test from "node:test";
import express from "express";
import {
  SPA_HISTORY_ROUTES,
  createSpaFallback,
  isMachineResourcePath,
  isSpaHistoryPath,
} from "../lib/spa-fallback.js";

const INDEX_HTML = "<!doctype html><html><head><title>SameDayDesk: agent commerce, built and shipped</title></head><body>spa</body></html>";

test("SPA history authority is the explicit App.tsx list, not any extensionless string", () => {
  assert.deepEqual(SPA_HISTORY_ROUTES, [
    "/",
    "/tools/ai-readiness",
    "/x402",
    "/x402/seller-conformance",
    "/for-agents",
    "/login",
    "/signup",
    "/dashboard",
    "/checkout",
    "/terms",
    "/privacy",
  ]);
  for (const route of SPA_HISTORY_ROUTES) {
    assert.equal(isSpaHistoryPath(route), true, route);
    assert.equal(isMachineResourcePath(route), false, route);
  }
  assert.equal(isSpaHistoryPath("/login?next=/dashboard"), true);
  assert.equal(isSpaHistoryPath("/this-path-does-not-exist-xyz"), false);
  assert.equal(isMachineResourcePath("/this-path-does-not-exist-xyz"), false);
  assert.equal(isSpaHistoryPath("/login/"), false);
  assert.equal(isSpaHistoryPath("/x402/"), false);
  assert.equal(isMachineResourcePath("/.well-known"), true);
  assert.equal(isMachineResourcePath("/.well-known/"), true);
  assert.equal(isMachineResourcePath("/.well-known/ai-plugin.json"), true);
  assert.equal(isMachineResourcePath("/.well-known/x402"), true);
  assert.equal(isMachineResourcePath("/.well-known/agents.json"), true);
  assert.equal(isMachineResourcePath("/agents.json"), true);
  assert.equal(isMachineResourcePath("/this-path-does-not-exist.json"), true);
  assert.equal(isMachineResourcePath("/security.txt"), true);
  assert.equal(isMachineResourcePath("/llms.txt"), true);
  assert.equal(isMachineResourcePath("/sitemap.xml"), true);
  assert.equal(isMachineResourcePath("/docs/x402-sdk/llms.txt"), true);
  assert.equal(isSpaHistoryPath("/.well-known/x402"), false);
  assert.equal(isSpaHistoryPath("/agents.json"), false);
});

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

function request(port, path, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path, method }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          type: res.headers["content-type"] || "",
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

test("production-like static + fallback 200s declared React routes, 404s unknown HTML with SPA body, and plain-404s machine paths", async (t) => {
  const dist = mkdtempSync(join(tmpdir(), "spa-fallback-"));
  t.after(() => rmSync(dist, { recursive: true, force: true }));
  writeFileSync(join(dist, "index.html"), INDEX_HTML);
  writeFileSync(join(dist, "robots.txt"), "User-agent: *\nAllow: /\n");
  writeFileSync(join(dist, "llms.txt"), "# SameDayDesk\n");
  mkdirSync(join(dist, "docs", "x402-sdk"), { recursive: true });
  writeFileSync(join(dist, "docs", "x402-sdk", "llms.txt"), "# sdk\n");

  const app = express();
  app.use(express.static(dist));
  app.use(createSpaFallback(dist));
  const { server, port } = await listen(app);
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const home = await request(port, "/");
  assert.equal(home.status, 200);
  assert.match(home.body, /spa/);

  for (const route of SPA_HISTORY_ROUTES) {
    const spa = await request(port, route);
    assert.equal(spa.status, 200, route);
    assert.equal(spa.body, INDEX_HTML, route);
    assert.match(spa.type, /html/, route);
  }

  const robots = await request(port, "/robots.txt");
  assert.equal(robots.status, 200);
  assert.match(robots.body, /User-agent/);

  const nested = await request(port, "/docs/x402-sdk/llms.txt");
  assert.equal(nested.status, 200);
  assert.match(nested.body, /sdk/);

  const wellKnown = await request(port, "/.well-known/ai-plugin.json");
  assert.equal(wellKnown.status, 404);
  assert.match(wellKnown.type, /text\/plain/);
  assert.equal(wellKnown.body, "Not found\n");
  assert.equal(wellKnown.body.includes("spa"), false);

  const x402WellKnown = await request(port, "/.well-known/x402");
  assert.equal(x402WellKnown.status, 404);

  const missingJson = await request(port, "/this-path-does-not-exist.json");
  assert.equal(missingJson.status, 404);

  const agents = await request(port, "/agents.json");
  assert.equal(agents.status, 404);

  const unknownHuman = await request(port, "/this-path-does-not-exist-xyz");
  assert.equal(unknownHuman.status, 404);
  assert.match(unknownHuman.type, /html/);
  assert.equal(unknownHuman.body, INDEX_HTML);
  assert.match(unknownHuman.body, /spa/);

  const unknownNested = await request(port, "/for-agents/not-a-real-page");
  assert.equal(unknownNested.status, 404);
  assert.equal(unknownNested.body, INDEX_HTML);
});
