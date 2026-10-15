// Requester-fitted discovery for GET /llms-txt. Network-free.
// Inherited generator.test.js stays the RC suite; this file adds Krabka #132,
// page outcomes, and llms.txt v2 alternates. On the R2D tree the bounded-fetch
// transport is installed when that module exists; on f390888b it does not.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import dns from "node:dns/promises";
import express from "express";
import router from "../../routes/tools.js";
import { UPSTREAM } from "./fit.js";

const here = path.dirname(fileURLToPath(import.meta.url));
try {
  const mod = await import(pathToFileURL(path.join(here, "fetch-transport.js")).href);
  mod.installFetchTransport();
} catch (e) {
  if (e?.code !== "ERR_MODULE_NOT_FOUND") throw e;
}

const realFetch = globalThis.fetch;
const calls = [];
const fx = (name) => fs.readFileSync(path.join(here, "fixtures", "krabka-132", name), "utf8");
const KRABKA_PAGES = JSON.parse(fx("pages.json"));
const STE = "> krabka is an Apache 2.0 broker in safe Rust. It is compatible with the Kafka wire protocol. It has its own KRaft quorum and clients for Rust, Go, and Java.";

const pageHtml = (title, description = "", extra = "") =>
  `<html><head><title>${title}</title><meta name="description" content="${description}">${extra}</head><body></body></html>`;

function stubSite(routes) {
  calls.length = 0;
  mock.method(dns, "lookup", async () => [{ address: "93.184.216.34", family: 4 }]);
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (u.startsWith("http://127.0.0.1") || u.startsWith("http://localhost")) return realFetch(url, opts);
    calls.push(u.split("#")[0]);
    const r = routes(u.split("#")[0]);
    if (r == null) return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
    if (typeof r === "string") {
      const xml = u.includes(".xml") || r.includes("<urlset") || r.includes("<sitemapindex");
      const headers = xml
        ? { "content-type": "application/xml" }
        : { "content-type": "text/html; charset=utf-8" };
      return new Response(r, { status: 200, headers });
    }
    const headers = { ...(r.headers || {}) };
    if (r.location) headers.location = r.location;
    if (!headers["content-type"]) headers["content-type"] = r.location ? "text/plain" : "text/html; charset=utf-8";
    return new Response(r.body ?? "", { status: r.status || 200, headers });
  };
}

async function generate(site, extra = "") {
  const app = express();
  app.use(router);
  const srv = await new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  try {
    const res = await realFetch(`http://127.0.0.1:${srv.address().port}/llms-txt?url=${encodeURIComponent(site)}${extra}`);
    return { status: res.status, json: await res.json(), calls: calls.slice() };
  } finally {
    srv.close();
    globalThis.fetch = realFetch;
    mock.restoreAll();
  }
}

const hasLink = (text, origin, pathname) =>
  new RegExp(`\\(${origin}${pathname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?\\)`).test(text);

function krabkaRoute(u) {
  const url = new URL(u);
  if (url.origin !== "https://krabka.io") return null;
  if (url.pathname === "/" || url.pathname === "") return fx("home.min.html");
  if (url.pathname === "/robots.txt") return fx("robots.txt");
  if (url.pathname === "/sitemap-index.xml") return fx("sitemap-index.xml");
  if (url.pathname === "/sitemap-0.xml") return fx("sitemap-0.xml");
  if (url.pathname === "/sitemap.xml") return null;
  const known = KRABKA_PAGES.find((p) => p.url.replace(/\/+$/, "") === u.replace(/\/+$/, ""));
  if (known) return pageHtml(known.title, known.description);
  return pageHtml("Page", "");
}

test("Krabka #132 automatic mode surfaces /docs/quickstart from robots Sitemap: and one index level", async () => {
  const O = "https://krabka.io";
  stubSite(krabkaRoute);
  const { status, json, calls: seen } = await generate(O);
  assert.equal(status, 200);
  assert.equal(json.origin, O);
  assert.ok(hasLink(json.llmsTxt, O, "/docs/quickstart"), json.llmsTxt.slice(0, 500));
  for (const p of ["/docs", "/docs/migration", "/docs/kip-matrix", "/verification", "/benchmarks", "/versions", "/brand"]) {
    assert.ok(hasLink(json.llmsTxt, O, p), p);
  }
  assert.equal(json.truncated, true);
  assert.ok(json.omitted > 0);
  assert.equal(json.count, 50);
  assert.match(json.llmsTxt, /> This bounded output omits \d+ additional discovered pages\./);
  assert.doesNotMatch(json.llmsTxt, /\[Full sitemap\]/);
  assert.equal(json.discovery.mode, "auto");
  assert.equal(json.discovery.robots.present, true);
  assert.equal(json.discovery.robots.sitemapDirectives, 1);
  assert.ok(json.discovery.sitemaps.some((s) => s.url === O + "/sitemap-index.xml" && s.kind === "index"));
  assert.ok(json.discovery.sitemaps.some((s) => s.url === O + "/sitemap-0.xml" && s.kind === "urlset"));
  assert.ok(json.discovery.missing.some((m) => m.url === O + "/sitemap.xml" && m.status === 404));
  assert.ok(json.llmsTxt.indexOf("## Sections") < json.llmsTxt.indexOf("## Pages"));
  assert.ok(!json.llmsTxt.includes(STE));
  assert.ok(!json.llmsTxt.includes("github.com"));
  assert.ok(!seen.some((c) => c.includes("github.com")));
  assert.match(json.discovery.coverage.label, /^automatic: 50 of \d+ discovered pages emitted \(cap 50\); \d+ omitted$/);
  // Quickstart is a urlset loc under the first index child. Depth greater than 1 is not required.
  assert.ok(!json.discovery.rejected?.some((r) => r.reason === "index_depth_exceeded"));
});

test("robots.txt without Sitemap: is reported and does not invent a sitemap link", async () => {
  const O = "https://nositemap.example";
  stubSite((u) => {
    if (u === O + "/" || u === O) return `<html><head><title>No Sitemap</title></head><body><nav><a href="/about">About</a></nav></body></html>`;
    if (u === O + "/robots.txt") return "User-agent: *\nAllow: /\n";
    if (u === O + "/sitemap.xml") return null;
    if (u.startsWith(O + "/")) return pageHtml("About", "");
    return null;
  });
  const { status, json } = await generate(O);
  assert.equal(status, 200);
  assert.equal(json.discovery.robots.present, true);
  assert.equal(json.discovery.robots.sitemapDirectives, 0);
  assert.ok(hasLink(json.llmsTxt, O, "/about"));
  assert.doesNotMatch(json.llmsTxt, /\[Full sitemap\]/);
  assert.equal(json.discovery.source, "homepage-links");
});

test("sitemap index reports an unreachable child and still emits the reachable child", async () => {
  const O = "https://index.example";
  const index = `<?xml version="1.0"?><sitemapindex><sitemap><loc>${O}/missing-child.xml</loc></sitemap><sitemap><loc>${O}/ok.xml</loc></sitemap></sitemapindex>`;
  const ok = `<?xml version="1.0"?><urlset><url><loc>${O}/docs/quickstart</loc></url></urlset>`;
  stubSite((u) => {
    if (u === O + "/" || u === O) return pageHtml("Index", "");
    if (u === O + "/sitemap.xml") return index;
    if (u === O + "/ok.xml") return ok;
    if (u === O + "/missing-child.xml") return null;
    if (u === O + "/docs/quickstart") return pageHtml("Quickstart", "");
    return null;
  });
  const { status, json } = await generate(O);
  assert.equal(status, 200);
  assert.ok(hasLink(json.llmsTxt, O, "/docs/quickstart"));
  assert.ok(json.discovery.missing.some((m) => m.url === O + "/missing-child.xml"));
  assert.ok(!json.llmsTxt.includes("missing-child.xml"));
});

test("a missing page is not emitted and a redirected link reports the final URL", async () => {
  const O = "https://outcome.example";
  const xml = `<?xml version="1.0"?><urlset><url><loc>${O}/keep</loc></url><url><loc>${O}/gone</loc></url><url><loc>${O}/old</loc></url></urlset>`;
  stubSite((u) => {
    if (u === O + "/" || u === O) return pageHtml("Outcome", "site");
    if (u === O + "/sitemap.xml") return xml;
    if (u === O + "/keep") return pageHtml("Keep", "stay");
    if (u === O + "/old") return { status: 301, location: "/new", body: "" };
    if (u === O + "/new") return pageHtml("New", "arrived");
    return null;
  });
  const { status, json } = await generate(O);
  assert.equal(status, 200);
  assert.ok(hasLink(json.llmsTxt, O, "/keep"));
  assert.ok(!json.llmsTxt.includes("/gone"));
  assert.ok(json.discovery.missing.some((m) => m.url === O + "/gone" && m.status === 404));
  assert.ok(!json.llmsTxt.includes(`](${O}/old)`));
  assert.ok(hasLink(json.llmsTxt, O, "/new"));
  assert.ok(json.discovery.redirected.some((r) => r.from === O + "/old" && r.to === O + "/new"));
});

test("over-cap truncation stays explicit at 50", async () => {
  const O = "https://cap.example";
  const locs = Array.from({ length: 60 }, (_, i) => `<url><loc>${O}/p${i}</loc></url>`).join("");
  stubSite((u) => {
    if (u === O + "/" || u === O) return pageHtml("Cap", "");
    if (u === O + "/sitemap.xml") return `<urlset>${locs}</urlset>`;
    if (u.startsWith(O + "/p")) return pageHtml("P", "");
    return null;
  });
  const { json } = await generate(O);
  assert.equal(json.count, 50);
  assert.equal(json.totalFound, 60);
  assert.equal(json.truncated, true);
  assert.equal(json.omitted, 10);
  assert.match(json.llmsTxt, /> This bounded output omits 10 additional discovered pages\./);
  assert.ok(json.llmsTxt.includes(`](${O}/p0)`));
  assert.ok(!json.llmsTxt.includes(`](${O}/p50)`));
});

test("GET /llms-txt automatic and supplied modes; v2 markdown alternate and describedby", async () => {
  const O = "https://v2.example";
  const doc = pageHtml("Quick", "q",
    `<link rel="canonical" href="${O}/docs/quickstart"><link rel="alternate" type="text/markdown" href="${O}/docs/quickstart.md"><link rel="describedby" href="${O}/llms.txt">`);
  const site = (u) => {
    if (u === O + "/" || u === O) return pageHtml("V2", "front");
    if (u === O + "/sitemap.xml") return `<urlset><url><loc>${O}/docs/quickstart</loc></url></urlset>`;
    if (u === O + "/docs/quickstart") return doc;
    if (u === "https://github.com/krabka-io" || u === "https://github.com/krabka-io/") return pageHtml("krabka-io", "org");
    return null;
  };
  stubSite(site);
  const auto = await generate(O);
  assert.equal(auto.status, 200);
  assert.equal(auto.json.discovery.mode, "auto");
  assert.ok(auto.json.llmsTxt.includes(`](${O}/docs/quickstart.md)`));
  assert.ok(!auto.json.llmsTxt.includes(`](${O}/docs/quickstart)`));
  assert.ok(auto.json.discovery.alternates.some((a) => a.page === O + "/docs/quickstart" && a.markdown === O + "/docs/quickstart.md" && a.describedby === O + "/llms.txt"));

  stubSite(site);
  const supplied = await generate(O, "&paths=" + encodeURIComponent("/docs/quickstart,https://github.com/krabka-io"));
  assert.equal(supplied.status, 200);
  assert.equal(supplied.json.discovery.mode, "supplied");
  assert.ok(supplied.json.llmsTxt.includes(`](${O}/docs/quickstart.md)`));
  assert.match(supplied.json.discovery.coverage.label, /not automatic full coverage/);
  if (UPSTREAM) {
    assert.match(supplied.json.llmsTxt, /github\.com\/krabka-io/);
  } else {
    assert.ok(supplied.json.discovery.rejected.some((r) => r.url === "https://github.com/krabka-io" && r.reason === "cross_origin_path"));
    assert.ok(!supplied.calls.some((c) => c.includes("github.com")));
    assert.ok(!supplied.json.llmsTxt.includes("github.com"));
    assert.match(supplied.json.discovery.coverage.label, /same-origin paths only/);
  }
});

test("include= is not an alias and an index deeper than one level is not crawled", async () => {
  const O = "https://depth.example";
  const root = `<?xml version="1.0"?><sitemapindex><sitemap><loc>${O}/child-index.xml</loc></sitemap></sitemapindex>`;
  const child = `<?xml version="1.0"?><sitemapindex><sitemap><loc>${O}/grandchild.xml</loc></sitemap></sitemapindex>`;
  const grand = `<?xml version="1.0"?><urlset><url><loc>${O}/docs/quickstart</loc></url></urlset>`;
  stubSite((u) => {
    if (u === O + "/" || u === O) return `<html><head><title>Depth</title></head><body><nav><a href="/about">About</a></nav></body></html>`;
    if (u === O + "/sitemap.xml") return root;
    if (u === O + "/child-index.xml") return child;
    if (u === O + "/grandchild.xml") return grand;
    if (u === O + "/about") return pageHtml("About", "");
    if (u === O + "/docs/quickstart") return pageHtml("Quickstart", "");
    return null;
  });
  const { json, calls: seen } = await generate(O, "&include=" + encodeURIComponent("/docs/quickstart"));
  assert.equal(json.discovery.mode, "auto");
  assert.ok(!json.llmsTxt.includes("/docs/quickstart"));
  assert.ok(json.discovery.rejected.some((r) => r.reason === "index_depth_exceeded"));
  assert.ok(!seen.some((c) => c.includes("grandchild.xml")));
  assert.ok(hasLink(json.llmsTxt, O, "/about"));
});
