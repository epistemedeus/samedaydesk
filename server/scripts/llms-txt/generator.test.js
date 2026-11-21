// Regressions for the free /llms-txt generator (server/routes/tools.js).
// Network-free: global fetch and DNS are stubbed; fixtures are captured/minimized inputs.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dns from "node:dns/promises";
import express from "express";
import router from "../../routes/tools.js";
import { installFetchTransport } from "./fetch-transport.js";

installFetchTransport();

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = (p) => fs.readFileSync(path.join(here, "fixtures", p), "utf8");
const realFetch = globalThis.fetch;

function stubSite(routes) {
  mock.method(dns.Resolver.prototype, "resolve4", async () => ["93.184.216.34"]);
  mock.method(dns.Resolver.prototype, "resolve6", async () => []);
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (u.startsWith("http://127.0.0.1")) return realFetch(url, opts);
    const body = routes(u);
    const ok = body !== null;
    return new Response(ok ? body : "not found", { status: ok ? 200 : 404, headers: { "content-type": "text/html; charset=utf-8" } });
  };
}

async function generate(site) {
  const app = express();
  app.use(router);
  const srv = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
  try {
    const res = await realFetch(`http://127.0.0.1:${srv.address().port}/llms-txt?url=${encodeURIComponent(site)}`);
    return { status: res.status, json: await res.json() };
  } finally {
    srv.close(); globalThis.fetch = realFetch; mock.restoreAll();
  }
}

const page = (t, d) => `<html><head><title>${t}</title><meta name="description" content="${d}"></head></html>`;

test("#236 tedgoas.com: navigation sections come first and include every nav section", async () => {
  const O = "https://www.tedgoas.com";
  stubSite((u) => {
    if (u === O + "/" || u === O) return fx("tedgoas-236/home.min.html");
    if (u === O + "/sitemap.xml") return fx("tedgoas-236/sitemap.xml");
    if (u.startsWith(O + "/")) return page("Ted Goas", "I&#39;m a designer");
    return null;
  });
  const { status, json } = await generate(O);
  assert.equal(status, 200);
  const t = json.llmsTxt;
  assert.match(t, /^# Ted Goas\n/);
  const sections = t.split("## Sections")[1]?.split("##")[0] || "";
  for (const p of ["/work", "/bio", "/how-i-think/", "/blog", "/labs/", "/newsletter", "/rss.xml"]) {
    assert.ok(sections.includes(`(${O}${p})`), `nav section ${p} missing from ## Sections`);
  }
  assert.ok(t.indexOf("## Sections") < t.indexOf("## Pages"), "sections must precede pages");
  // contract: original fields keep their types
  assert.equal(typeof json.origin, "string"); assert.equal(typeof json.siteName, "string");
  assert.equal(typeof json.count, "number"); assert.equal(typeof json.llmsTxt, "string");
});

test("HTML entities are decoded in titles and descriptions", async () => {
  const O = "https://ent.example";
  stubSite((u) => {
    if (u === O + "/" || u === O) return `<html><head><title>Tom &amp; Jerry&#39;s</title><meta name="description" content="It&#x27;s &quot;fine&quot;"></head><body></body></html>`;
    if (u === O + "/sitemap.xml") return `<urlset><url><loc>${O}/a</loc></url></urlset>`;
    if (u === O + "/a") return page("Don&#39;t &amp; won&rsquo;t", "I&#39;m here");
    return null;
  });
  const { json } = await generate(O);
  assert.ok(!/&#39;|&amp;|&quot;|&#x27;|&rsquo;/.test(json.llmsTxt), json.llmsTxt);
  assert.match(json.llmsTxt, /Don't & won’t/);
  assert.match(json.llmsTxt, /> It's "fine"/);
});

test("truncation is reported explicitly instead of a silent cap at 50", async () => {
  const O = "https://big.example";
  const locs = Array.from({ length: 60 }, (_, i) => `<url><loc>${O}/p${i}</loc></url>`).join("");
  stubSite((u) => {
    if (u === O + "/" || u === O) return `<html><head><title>Big</title></head><body></body></html>`;
    if (u === O + "/sitemap.xml") return `<urlset>${locs}</urlset>`;
    if (u.startsWith(O + "/p")) return page("P", "");
    return null;
  });
  const { json } = await generate(O);
  assert.equal(json.count, 50);
  assert.equal(json.totalFound, 60);
  assert.equal(json.truncated, true);
  assert.equal(json.omitted, 10);
  assert.match(json.llmsTxt, /> This bounded output omits 10 additional discovered pages\./);
});

test("no nav and under the cap: output keeps the original single Pages section, not truncated", async () => {
  const O = "https://small.example";
  stubSite((u) => {
    if (u === O + "/" || u === O) return `<html><head><title>Small</title></head><body></body></html>`;
    if (u === O + "/sitemap.xml") return `<urlset><url><loc>${O}/x</loc></url><url><loc>${O}/y/</loc></url><url><loc>${O}/y</loc></url></urlset>`;
    return page("Page", "");
  });
  const { json } = await generate(O);
  assert.equal(json.count, 2);
  assert.ok(!json.llmsTxt.includes("## Sections"));
  assert.ok(json.llmsTxt.includes("## Pages"));
  assert.notEqual(json.truncated, true);
});

test("homepage fallback reports omitted pages without inventing a sitemap link", async () => {
  const O = "https://fallback.example";
  const links = Array.from({ length: 60 }, (_, i) => `<a href="/p${i}">Page ${i}</a>`).join("");
  stubSite((u) => {
    if (u === O + "/" || u === O) return `<html><head><title>Fallback</title></head><body>${links}</body></html>`;
    if (u === O + "/sitemap.xml") return null;
    if (u.startsWith(O + "/p")) return page("Page", "");
    return null;
  });
  const { status, json } = await generate(O);
  assert.equal(status, 200);
  assert.equal(json.totalFound, 60);
  assert.equal(json.omitted, 10);
  assert.equal(json.truncated, true);
  assert.doesNotMatch(json.llmsTxt, /\[Full sitemap\]/);
  assert.match(json.llmsTxt, /> This bounded output omits 10 additional discovered pages\./);
});
