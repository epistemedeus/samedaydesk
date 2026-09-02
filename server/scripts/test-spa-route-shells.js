import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import express from "express";
import { mountProductionClient } from "../lib/spa-client.js";
import {
  HOME_CANONICAL,
  HOME_DESCRIPTION,
  HOME_TITLE,
  SPA_ROUTE_SHELLS,
  applyRouteShell,
  generateRouteShellsFromIndex,
  inspectHtmlShell,
  writeRouteShells,
} from "../lib/spa-route-shells.js";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE_INDEX = readFileSync(join(here, "../../client/index.html"), "utf8");
const BUNDLE_SRC = "/assets/index-8f3a1b2c.js";
const BUNDLE_CSS = "/assets/index-8f3a1b2c.css";
const HOME_H1 = "SameDayDesk: make your service ready for agents";

function asBuiltIndex(source = SOURCE_INDEX) {
  assert.match(source, /<script type="module" src="\/src\/main\.tsx"><\/script>/);
  return source.replace(
    '<script type="module" src="/src/main.tsx"></script>',
    `<script type="module" crossorigin src="${BUNDLE_SRC}"></script>\n    <link rel="stylesheet" crossorigin href="${BUNDLE_CSS}">`,
  );
}

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
          headers: res.headers,
          type: res.headers["content-type"] || "",
          location: res.headers.location || "",
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function assertRouteDocument(body, route) {
  const info = inspectHtmlShell(body);
  assert.equal(info.title, route.title);
  assert.equal(info.description, route.description);
  assert.equal(info.canonical, route.canonical);
  assert.equal(info.ogUrl, route.canonical);
  assert.equal(info.ogTitle, route.title);
  assert.equal(info.ogDescription, route.description);
  assert.equal(info.twitterTitle, route.title);
  assert.equal(info.twitterDescription, route.description);
  assert.notEqual(info.title, HOME_TITLE);
  assert.notEqual(info.canonical, HOME_CANONICAL);
  assert.notEqual(info.description, HOME_DESCRIPTION);
  assert.equal(info.ogUrl === HOME_CANONICAL, false);
  assert.match(info.noscript, /<h1>/);
  assert.equal(info.noscript.includes(HOME_H1), false);
  assert.equal(body.includes("hasOfferCatalog"), false);
  assert.equal(body.includes("Agent Workflow Integration"), false);
  assert.match(body, /<div id="root">/);
  assert.match(body, new RegExp(BUNDLE_SRC.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(info.scripts.includes(BUNDLE_SRC), true);
  const jsonLd = JSON.parse(info.jsonLdRaw[0]);
  const webpage = jsonLd["@graph"].find((node) => node["@type"] === "WebPage");
  assert.equal(webpage.url, route.canonical);
  assert.equal(webpage.name, route.title);
}

test("catalog is exact, unique, and sufficient to add another public SPA route", () => {
  assert.deepEqual(
    SPA_ROUTE_SHELLS.map((route) => route.path),
    ["/x402", "/x402/seller-conformance", "/tools/ai-readiness"],
  );
  const extra = {
    path: "/new-public-page",
    title: "New public page | SameDayDesk",
    description: "A truthful description of the new public page.",
    canonical: "https://samedaydesk.com/new-public-page",
    crawlerHtml: "<h1>New public page</h1><p>Concise crawler copy for the new route.</p>",
  };
  const html = applyRouteShell(asBuiltIndex(), extra);
  const info = inspectHtmlShell(html);
  assert.equal(info.title, extra.title);
  assert.equal(info.canonical, extra.canonical);
  assert.equal(info.description, extra.description);
  assert.equal(info.ogUrl, extra.canonical);
  assert.match(info.noscript, /New public page/);
  assert.equal(info.title.includes("agent commerce, built and shipped"), false);
  assert.equal(html.includes("<!doctype html>"), true);
});

test("generator derives route shells from the built index.html without rewriting the homepage", (t) => {
  const dist = mkdtempSync(join(tmpdir(), "route-shells-gen-"));
  t.after(() => rmSync(dist, { recursive: true, force: true }));
  const built = asBuiltIndex();
  writeFileSync(join(dist, "index.html"), built);

  const generated = generateRouteShellsFromIndex(built);
  assert.equal(generated.length, 3);
  for (const item of generated) {
    assertRouteDocument(item.html, item.route);
  }

  const written = writeRouteShells(dist);
  assert.equal(written.length, 3);
  assert.equal(readFileSync(join(dist, "index.html"), "utf8"), built);
  const home = inspectHtmlShell(readFileSync(join(dist, "index.html"), "utf8"));
  assert.equal(home.title, HOME_TITLE);
  assert.equal(home.canonical, HOME_CANONICAL);
  assert.equal(home.description, HOME_DESCRIPTION);
  assert.match(home.noscript, new RegExp(HOME_H1));

  const x402 = inspectHtmlShell(readFileSync(join(dist, written[0].relativeFile), "utf8"));
  assert.equal(x402.title, SPA_ROUTE_SHELLS[0].title);
  assert.match(x402.noscript, /Twenty-two deterministic tools/);
  const seller = inspectHtmlShell(readFileSync(join(dist, written[1].relativeFile), "utf8"));
  assert.match(seller.noscript, /not a product, certificate, or runtime monitor/);
  const tool = inspectHtmlShell(readFileSync(join(dist, written[2].relativeFile), "utf8"));
  assert.match(tool.noscript, /No\s+email required/);
});

test("production Express serves exact route shells, keeps homepage bytes, and preserves 404 SPA behavior", async (t) => {
  const dist = mkdtempSync(join(tmpdir(), "route-shells-http-"));
  t.after(() => rmSync(dist, { recursive: true, force: true }));
  const built = asBuiltIndex();
  writeFileSync(join(dist, "index.html"), built);
  writeFileSync(join(dist, "robots.txt"), "User-agent: *\nAllow: /\n");
  writeFileSync(join(dist, "skillguard.html"), "<!doctype html><title>SkillGuard</title>");
  mkdirSync(join(dist, "docs", "x402-sdk"), { recursive: true });
  writeFileSync(join(dist, "docs", "x402-sdk", "llms.txt"), "# sdk\n");
  mkdirSync(join(dist, "x402"), { recursive: true });
  writeFileSync(join(dist, "x402", "index.html"), "<!doctype html><title>DECOY DIRECTORY INDEX</title>");
  mkdirSync(join(dist, "tools", "ai-readiness"), { recursive: true });
  writeFileSync(join(dist, "tools", "ai-readiness", "index.html"), "<!doctype html><title>DECOY TOOLS INDEX</title>");
  writeRouteShells(dist);

  const staticOnly = express();
  staticOnly.use(express.static(dist));
  const staticServer = await listen(staticOnly);
  t.after(() => new Promise((resolve) => staticServer.server.close(resolve)));
  const redirected = await request(staticServer.port, "/x402");
  assert.equal(redirected.status, 301);
  assert.equal(redirected.location, "/x402/");

  const app = express();
  mountProductionClient(app, dist);
  const { server, port } = await listen(app);
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const home = await request(port, "/");
  assert.equal(home.status, 200);
  assert.match(home.type, /html/);
  assert.equal(home.body, built);
  const homeInfo = inspectHtmlShell(home.body);
  assert.equal(homeInfo.title, HOME_TITLE);
  assert.equal(homeInfo.canonical, HOME_CANONICAL);
  assert.equal(homeInfo.description, HOME_DESCRIPTION);
  assert.equal(homeInfo.ogUrl, HOME_CANONICAL);
  assert.match(homeInfo.noscript, new RegExp(HOME_H1));

  for (const route of SPA_ROUTE_SHELLS) {
    const res = await request(port, route.path);
    assert.equal(res.status, 200, route.path);
    assert.match(res.type, /html/);
    assert.equal(res.location, "");
    assert.notEqual(res.body, built);
    assert.equal(res.body.includes("DECOY"), false);
    assertRouteDocument(res.body, route);
  }

  const unknownHuman = await request(port, "/this-path-does-not-exist-xyz");
  assert.equal(unknownHuman.status, 200);
  assert.equal(inspectHtmlShell(unknownHuman.body).title, HOME_TITLE);
  assert.equal(inspectHtmlShell(unknownHuman.body).canonical, HOME_CANONICAL);
  assert.match(unknownHuman.body, new RegExp(HOME_H1));

  const wellKnown = await request(port, "/.well-known/ai-plugin.json");
  assert.equal(wellKnown.status, 404);
  assert.match(wellKnown.type, /text\/plain/);
  assert.equal(wellKnown.body, "Not found\n");
  assert.equal(wellKnown.body.includes("spa"), false);
  assert.equal(wellKnown.body.includes(HOME_TITLE), false);

  const missingJson = await request(port, "/this-path-does-not-exist.json");
  assert.equal(missingJson.status, 404);

  const nested = await request(port, "/docs/x402-sdk/llms.txt");
  assert.equal(nested.status, 200);
  assert.match(nested.body, /sdk/);

  const skillguard = await request(port, "/skillguard");
  assert.equal(skillguard.status, 200);
  assert.match(skillguard.body, /SkillGuard/);
});
