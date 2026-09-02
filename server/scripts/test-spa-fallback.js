import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";
import test from "node:test";
import express from "express";
import { createSpaFallback, isSpaFallbackPath } from "../lib/spa-fallback.js";

const INDEX_HTML = "<!doctype html><html><head><title>SameDayDesk: agent commerce, built and shipped</title></head><body>spa</body></html>";

test("isSpaFallbackPath keeps extensionless client routes and rejects machine paths", () => {
  assert.equal(isSpaFallbackPath("/"), true);
  assert.equal(isSpaFallbackPath("/x402"), true);
  assert.equal(isSpaFallbackPath("/x402/seller-conformance"), true);
  assert.equal(isSpaFallbackPath("/tools/ai-readiness"), true);
  assert.equal(isSpaFallbackPath("/login"), true);
  assert.equal(isSpaFallbackPath("/this-path-does-not-exist-xyz"), true);
  assert.equal(isSpaFallbackPath("/.well-known"), false);
  assert.equal(isSpaFallbackPath("/.well-known/"), false);
  assert.equal(isSpaFallbackPath("/.well-known/ai-plugin.json"), false);
  assert.equal(isSpaFallbackPath("/.well-known/x402"), false);
  assert.equal(isSpaFallbackPath("/.well-known/agents.json"), false);
  assert.equal(isSpaFallbackPath("/agents.json"), false);
  assert.equal(isSpaFallbackPath("/this-path-does-not-exist.json"), false);
  assert.equal(isSpaFallbackPath("/security.txt"), false);
  assert.equal(isSpaFallbackPath("/llms.txt"), false);
  assert.equal(isSpaFallbackPath("/sitemap.xml"), false);
  assert.equal(isSpaFallbackPath("/docs/x402-sdk/llms.txt"), false);
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

test("production-like static + fallback 404s missing machine paths and keeps SPA routes", async (t) => {
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

  const spa = await request(port, "/x402/seller-conformance");
  assert.equal(spa.status, 200);
  assert.match(spa.body, /spa/);
  assert.match(spa.type, /html/);

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
  assert.equal(unknownHuman.status, 200);
  assert.match(unknownHuman.body, /spa/);
});
