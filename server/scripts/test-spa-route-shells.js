import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import express from "express";
import { mountProductionClient } from "../lib/spa-client.js";
import { SPA_HISTORY_ROUTES } from "../lib/spa-fallback.js";
import {
  HOME_CANONICAL,
  HOME_DESCRIPTION,
  HOME_TITLE,
  NOT_FOUND_SHELL,
  SPA_ROUTE_SHELLS,
  applyRouteShell,
  generateRouteShellsFromIndex,
  inspectHtmlShell,
  writeRouteShells,
} from "../lib/spa-route-shells.js";
import {
  applyMachineMetadata,
  COMPARE_QUICKSTART,
  FOR_AGENTS_SHELL,
  MERCHANT_PIN,
  OBSERVE_QUICKSTART,
  X402_SHELL,
} from "../../client/src/data/machineEntry.mjs";

const DECLARED_REACT_ROUTES = Object.freeze([
  "/",
  "/tools/ai-readiness",
  "/x402",
  "/x402/seller-conformance",
  "/x402/verified",
  "/for-agents",
  "/login",
  "/signup",
  "/dashboard",
  "/checkout",
  "/terms",
  "/privacy",
]);

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE_INDEX = readFileSync(join(here, "../../client/index.html"), "utf8");
const LLMS_TXT = readFileSync(join(here, "../../client/public/llms.txt"), "utf8");
const BUNDLE_SRC = "/assets/index-8f3a1b2c.js";
const BUNDLE_CSS = "/assets/index-8f3a1b2c.css";
const HOME_H1 = "SameDayDesk: make your service ready for agents";

test("sitemap lists canonical documentation introductions, not their duplicate directory indexes", () => {
  const publicDir = join(here, "../../client/public");
  const sitemap = readFileSync(join(publicDir, "sitemap.xml"), "utf8");
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  for (const directory of ["docs/x402-sdk", "docs-lab/gopherjs"]) {
    const alias = `https://samedaydesk.com/${directory}/`;
    const index = inspectHtmlShell(readFileSync(join(publicDir, directory, "index.html"), "utf8"));
    assert.notEqual(index.canonical, alias, directory);
    assert.equal(new URL(index.canonical).origin, "https://samedaydesk.com");
    assert.ok(locations.includes(index.canonical), `${directory}: canonical URL missing from sitemap`);
    assert.equal(locations.includes(alias), false, `${directory}: duplicate alias listed in sitemap`);
    const target = inspectHtmlShell(readFileSync(join(publicDir, new URL(index.canonical).pathname), "utf8"));
    assert.equal(target.canonical, index.canonical, `${directory}: canonical target must self-canonicalize`);
  }
});

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

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function waitForServer(child, expected) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`server did not start: ${output}`)), 5_000);
    const collect = (chunk) => {
      output += chunk.toString("utf8");
      if (output.includes(expected)) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited with ${code}: ${output}`));
    });
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
  assert.deepEqual(SPA_HISTORY_ROUTES, DECLARED_REACT_ROUTES);
  assert.deepEqual(
    SPA_ROUTE_SHELLS.map((route) => route.path),
    [
      "/x402", "/x402/seller-conformance", "/x402/verified", "/tools/ai-readiness", "/for-agents",
      "/terms", "/privacy", "/login", "/signup", "/dashboard", "/checkout",
    ],
  );
  for (const route of SPA_ROUTE_SHELLS) {
    assert.equal(SPA_HISTORY_ROUTES.includes(route.path), true, route.path);
  }
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

test("apex machine documentation separates free and paid MCP and keeps homepage SKUs", () => {
  assert.match(LLMS_TXT, /Free apex MCP readiness surface/);
  assert.match(LLMS_TXT, /https:\/\/agents\.samedaydesk\.com\/mcp/);
  assert.match(LLMS_TXT, /GET https:\/\/agents\.samedaydesk\.com\/extract\?url=https:\/\/example\.com/);
  assert.match(LLMS_TXT, /POST https:\/\/agents\.samedaydesk\.com\/extract\/batch/);
  assert.match(LLMS_TXT, /https:\/\/samedaydesk\.com\/for-agents/);
  assert.match(LLMS_TXT, /offline comparison/);
  assert.equal(LLMS_TXT.includes("Twenty-two canonical"), false);
  for (const sku of ["Agent Workflow Integration", "Agent-Ready MCP Server", "Agent Commerce Storefront"]) {
    assert.match(LLMS_TXT, new RegExp(sku));
  }
});

test("for-agents shell, React route, and machineEntry share one copy authority", () => {
  const route = SPA_ROUTE_SHELLS.find((item) => item.path === "/for-agents");
  assert.equal(route.title, FOR_AGENTS_SHELL.title);
  assert.equal(route.description, FOR_AGENTS_SHELL.description);
  assert.equal(route.canonical, FOR_AGENTS_SHELL.canonical);
  assert.equal(route.crawlerHtml, FOR_AGENTS_SHELL.crawlerHtml);
  assert.equal(SPA_ROUTE_SHELLS[0].title, X402_SHELL.title);
  assert.equal(SPA_ROUTE_SHELLS[0].description, X402_SHELL.description);
  assert.match(route.crawlerHtml, /POST \/extract\/batch/);
  assert.match(route.crawlerHtml, /0\.01 USDC/);
  assert.equal(route.crawlerHtml.includes(OBSERVE_QUICKSTART), true);
  assert.equal(route.crawlerHtml.includes(COMPARE_QUICKSTART), true);
  assert.equal(route.crawlerHtml.includes(MERCHANT_PIN), true);
  assert.match(route.crawlerHtml, /npm ci/);
  assert.match(route.crawlerHtml, /npm start/);
  assert.match(route.crawlerHtml, /page-change/);
  assert.match(route.crawlerHtml, /coverage unknown/);
  assert.match(route.crawlerHtml, /charged: true/);
  assert.match(route.crawlerHtml, /https:\/\/agents\.samedaydesk\.com\/api\/actions/);
  assert.match(route.crawlerHtml, /https:\/\/agents\.samedaydesk\.com\/healthz/);
  assert.equal(route.crawlerHtml.includes("Twenty-two"), false);
  assert.equal(route.crawlerHtml.includes("hasOfferCatalog"), false);
  const app = readFileSync(join(here, "../../client/src/App.tsx"), "utf8");
  assert.match(app, /path="\/for-agents" element=\{<ForAgents \/>\}/);
  assert.equal(app.includes('path="/for-agents" element={<Mcp />}'), false);
  const react = readFileSync(join(here, "../../client/src/pages/ForAgents.tsx"), "utf8");
  for (const copy of [route.crawlerHtml, react]) {
    assert.match(copy, /Node.js 22 or newer/);
    assert.match(copy, /against the live merchant, not an offline fixture/);
    assert.match(copy, /fixtures\/authorization-batch.json/);
    assert.match(copy, /Reconcile an unknown payment outcome instead of automatically retrying/);
    assert.doesNotMatch(copy, /untrusted until you reconcile|No-key fixture quickstart/);
  }
});

test("client metadata transitions match route shells and restore prior attributes", () => {
  const elements = new Map();
  const document = {
    title: HOME_TITLE,
    querySelector(selector) {
      if (!elements.has(selector)) {
        const attributes = new Map();
        elements.set(selector, {
          getAttribute: (name) => attributes.get(name) ?? null,
          setAttribute: (name, value) => attributes.set(name, value),
          removeAttribute: (name) => attributes.delete(name),
        });
      }
      return elements.get(selector);
    },
  };
  for (const shell of [FOR_AGENTS_SHELL, X402_SHELL, FOR_AGENTS_SHELL]) {
    const restore = applyMachineMetadata(document, shell);
    assert.equal(document.title, shell.title);
    for (const [selector, attribute, value] of [
      ['link[rel="canonical"]', 'href', shell.canonical],
      ['meta[property="og:url"]', 'content', shell.canonical],
      ['meta[property="og:title"]', 'content', shell.title],
      ['meta[name="twitter:title"]', 'content', shell.title],
      ['meta[name="description"]', 'content', shell.description],
      ['meta[property="og:description"]', 'content', shell.description],
      ['meta[name="twitter:description"]', 'content', shell.description],
    ]) assert.equal(document.querySelector(selector).getAttribute(attribute), value);
    restore();
    assert.equal(document.title, HOME_TITLE);
    assert.equal(document.querySelector('link[rel="canonical"]').getAttribute('href'), null);
  }
  for (const [page, shell] of [['ForAgents', 'FOR_AGENTS_SHELL'], ['Mcp', 'X402_SHELL']]) {
    const source = readFileSync(join(here, `../../client/src/pages/${page}.tsx`), 'utf8');
    assert.ok(source.includes(`applyMachineMetadata(document, ${shell})`));
  }
});

test("sitemap lists /for-agents once with the existing /x402 loc", () => {
  const sitemap = readFileSync(join(here, "../../client/public/sitemap.xml"), "utf8");
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.equal(locations.filter((loc) => loc === "https://samedaydesk.com/for-agents").length, 1);
  assert.equal(locations.includes("https://samedaydesk.com/x402"), true);
  assert.equal(locations.includes("https://samedaydesk.com/"), true);
});

test("generator derives route shells from the built index.html without rewriting the homepage", (t) => {
  const dist = mkdtempSync(join(tmpdir(), "route-shells-gen-"));
  t.after(() => rmSync(dist, { recursive: true, force: true }));
  const built = asBuiltIndex();
  writeFileSync(join(dist, "index.html"), built);

  const generated = generateRouteShellsFromIndex(built);
  assert.equal(generated.length, SPA_ROUTE_SHELLS.length + 1);
  for (const item of generated) {
    assertRouteDocument(item.html, item.route);
  }

  const written = writeRouteShells(dist);
  assert.equal(written.length, SPA_ROUTE_SHELLS.length + 1);
  assert.equal(readFileSync(join(dist, "index.html"), "utf8"), built);
  const home = inspectHtmlShell(readFileSync(join(dist, "index.html"), "utf8"));
  assert.equal(home.title, HOME_TITLE);
  assert.equal(home.canonical, HOME_CANONICAL);
  assert.equal(home.description, HOME_DESCRIPTION);
  assert.match(home.noscript, new RegExp(HOME_H1));

  const x402 = inspectHtmlShell(readFileSync(join(dist, written[0].relativeFile), "utf8"));
  assert.equal(x402.title, SPA_ROUTE_SHELLS[0].title);
  assert.match(x402.noscript, /Live catalogs are authoritative/);
  assert.match(x402.noscript, /for-agents/);
  const forAgents = written.find((entry) => entry.path === "/for-agents");
  const forAgentsHtml = inspectHtmlShell(readFileSync(join(dist, forAgents.relativeFile), "utf8"));
  assert.equal(forAgentsHtml.title, FOR_AGENTS_SHELL.title);
  assert.equal(forAgentsHtml.canonical, FOR_AGENTS_SHELL.canonical);
  assert.match(forAgentsHtml.noscript, /Job 1\. Obtain bounded extracted observations/);
  assert.match(forAgentsHtml.noscript, /Job 2\. Compare explicit fields from two already-held observations/);
  assert.equal(forAgentsHtml.noscript.includes(OBSERVE_QUICKSTART), true);
  assert.equal(forAgentsHtml.noscript.includes(COMPARE_QUICKSTART), true);
  assert.equal(forAgentsHtml.jsonLdRaw.join("").includes("Offer"), false);
  assert.equal(forAgentsHtml.jsonLdRaw.join("").includes("FAQPage"), false);
  assert.equal(forAgentsHtml.jsonLdRaw.join("").includes("Review"), false);
  const seller = inspectHtmlShell(readFileSync(join(dist, written[1].relativeFile), "utf8"));
  assert.match(seller.noscript, /not a product, certificate, or runtime monitor/);
  const verified = inspectHtmlShell(readFileSync(join(dist, written[2].relativeFile), "utf8"));
  assert.match(verified.noscript, /Inspected routes, not a certificate/);
  const tool = inspectHtmlShell(readFileSync(join(dist, written[3].relativeFile), "utf8"));
  assert.match(tool.noscript, /No\s+email required/);
  for (const routePath of ["/login", "/signup", "/dashboard", "/checkout"]) {
    const item = written.find((entry) => entry.path === routePath);
    assert.equal(inspectHtmlShell(readFileSync(join(dist, item.relativeFile), "utf8")).robots, "noindex,follow");
  }
});

test("production Express serves exact route shells, 200s every declared React route, and 404s unknown HTML with the SPA index", async (t) => {
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

  const shellByPath = new Map(SPA_ROUTE_SHELLS.map((route) => [route.path, route]));
  for (const routePath of DECLARED_REACT_ROUTES) {
    const res = await request(port, routePath);
    assert.equal(res.status, 200, routePath);
    assert.match(res.type, /html/, routePath);
    assert.equal(res.location, "", routePath);
    assert.match(res.body, /<div id="root">/, routePath);
    assert.match(res.body, new RegExp(BUNDLE_SRC.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), routePath);
    const shell = shellByPath.get(routePath);
    if (shell) {
      assert.notEqual(res.body, built, routePath);
      assert.equal(res.body.includes("DECOY"), false, routePath);
      assertRouteDocument(res.body, shell);
    } else {
      assert.equal(res.body, built, routePath);
    }
  }

  const unknownHuman = await request(port, "/this-path-does-not-exist-xyz");
  assert.equal(unknownHuman.status, 404);
  assert.notEqual(unknownHuman.status, 200);
  assert.match(unknownHuman.type, /html/);
  assert.notEqual(unknownHuman.body, built);
  assertRouteDocument(unknownHuman.body, NOT_FOUND_SHELL);
  assert.equal(inspectHtmlShell(unknownHuman.body).robots, "noindex,follow");
  assert.equal(unknownHuman.body.includes(HOME_H1), false);
  assert.match(unknownHuman.body, /<div id="root">/);
  assert.match(unknownHuman.body, new RegExp(BUNDLE_SRC.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

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

test("production entrypoint redirects the apex A2A card before static and SPA routing", async (t) => {
  const dist = mkdtempSync(join(tmpdir(), "route-shells-entrypoint-"));
  t.after(() => rmSync(dist, { recursive: true, force: true }));
  writeFileSync(join(dist, "index.html"), asBuiltIndex());
  writeRouteShells(dist);

  const port = await reservePort();
  const child = spawn(process.execPath, [join(here, "../index.js")], {
    cwd: join(here, "../.."),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      SAMEDAYDESK_CLIENT_DIST: dist,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    if (child.exitCode !== null) return;
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGINT");
    await exited;
  });
  await waitForServer(child, `[samedaydesk] listening on :${port}`);

  const card = await request(port, "/.well-known/agent-card.json");
  assert.equal(card.status, 308);
  assert.equal(card.location, "https://agents.samedaydesk.com/.well-known/agent-card.json");
  assert.equal(card.body.includes('"skills":[]'), false);
});
