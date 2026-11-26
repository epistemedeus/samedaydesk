import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import express from "express";
import { mountApexDeclarations } from "../lib/apex-declarations.js";
import { mountProductionClient } from "../lib/spa-client.js";
import { prefersMarkdown, startGuideMarkdown, START_GUIDE_LINK } from "../lib/start-guide.js";

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

function request(port, { method = "GET", path, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, method, path, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

test("prefersMarkdown follows explicit markdown quality, not a bare or browser Accept", () => {
  assert.equal(prefersMarkdown(undefined), false);
  assert.equal(prefersMarkdown(""), false);
  assert.equal(prefersMarkdown("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"), false);
  assert.equal(prefersMarkdown("*/*"), false);
  assert.equal(prefersMarkdown("text/markdown"), true);
  assert.equal(prefersMarkdown("text/markdown, text/html;q=0.9"), true);
  assert.equal(prefersMarkdown("text/html, text/markdown"), true);
  assert.equal(prefersMarkdown("text/html, text/markdown;q=0.5"), false);
  assert.equal(prefersMarkdown("text/*, text/html"), false);
  assert.equal(prefersMarkdown("text/*"), false);
});

test("GET / serves the maintained start guide when Accept prefers markdown", async (t) => {
  const dist = mkdtempSync(join(tmpdir(), "markdown-accept-"));
  t.after(() => rmSync(dist, { recursive: true, force: true }));
  const home = "<!doctype html><html><body>retained home fixture</body></html>";
  writeFileSync(join(dist, "index.html"), home);
  const app = express();
  mountApexDeclarations(app);
  mountProductionClient(app, dist);
  const { server, port } = await listen(app);
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const guide = startGuideMarkdown();
  assert.equal(guide, readFileSync(new URL("../../client/public/start.md", import.meta.url), "utf8"));
  assert.doesNotMatch(guide, /agent_first_use_report/);
  assert.doesNotMatch(guide, /checkout\?offer=agent_first/);

  const html = await request(port, { path: "/", headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" } });
  assert.equal(html.status, 200);
  assert.match(html.headers["content-type"], /^text\/html\b/);
  assert.equal(html.headers.link, START_GUIDE_LINK);
  assert.equal(html.body, home);

  const none = await request(port, { path: "/" });
  assert.equal(none.status, 200);
  assert.match(none.headers["content-type"], /^text\/html\b/);
  assert.equal(none.body, home);

  const markdown = await request(port, { path: "/", headers: { accept: "text/markdown" } });
  assert.equal(markdown.status, 200);
  assert.equal(markdown.headers["content-type"], "text/markdown; charset=utf-8");
  assert.equal(markdown.headers.link, START_GUIDE_LINK);
  assert.equal(markdown.body, guide);
  assert.doesNotMatch(markdown.body, /agent_first_use_report/);

  const head = await request(port, { method: "HEAD", path: "/", headers: { accept: "text/markdown" } });
  assert.equal(head.status, 200);
  assert.equal(head.headers["content-type"], "text/markdown; charset=utf-8");
  assert.equal(head.headers.link, START_GUIDE_LINK);
  assert.equal(head.body, "");
  assert.equal(Number(head.headers["content-length"]), Buffer.byteLength(guide));
});
