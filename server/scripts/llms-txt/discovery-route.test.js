// Focused /llms-txt discovery route tests. Network-free: fetch + DNS stubbed.
// Each failure test asserts a named signature in discovery.rejected[].reason or
// the error code, never a page/script count.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import dns from "node:dns/promises";
import express from "express";
import router from "../../routes/tools.js";

const realFetch = globalThis.fetch;
const O = "https://krabka.example";
const calls = [];

// routes(u) -> string body | {status, location} | {body, status} | null (404)
function stubSite(routes, { addr = () => "93.184.216.34" } = {}) {
  calls.length = 0;
  mock.method(dns, "lookup", async (host) => [{ address: addr(host), family: 4 }]);
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (u.startsWith("http://127.0.0.1")) return realFetch(url, opts);
    calls.push(u);
    const r = routes(u);
    if (r === null || r === undefined) return new Response("not found", { status: 404 });
    if (typeof r === "string") return new Response(r, { status: 200 });
    if (r.location) return new Response(null, { status: r.status || 301, headers: { location: r.location } });
    return new Response(r.body, { status: r.status || 200 });
  };
}

async function generate(site, extra = "") {
  const app = express();
  app.use(router);
  const srv = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
  try {
    const res = await realFetch(`http://127.0.0.1:${srv.address().port}/llms-txt?url=${encodeURIComponent(site)}${extra}`);
    return { status: res.status, json: await res.json() };
  } finally {
    srv.close(); globalThis.fetch = realFetch; mock.restoreAll();
  }
}

const home = `<html><head><title>Krabka | Docs</title><meta name="description" content="d"></head><body><a href="/about">a</a></body></html>`;
const page = (t) => `<html><head><title>${t}</title></head></html>`;
const urlset = (...p) => `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${p.map((x) => `<url><loc>${x.startsWith("http") ? x : O + x}</loc></url>`).join("")}</urlset>`;
const index = (...p) => `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${p.map((x) => `<sitemap><loc>${x.startsWith("http") ? x : O + x}</loc></sitemap>`).join("")}</sitemapindex>`;
const reasons = (json) => (json.discovery?.rejected || []).map((r) => r.reason);
const contract = (json) => {
  for (const k of ["origin", "siteName", "llmsTxt"]) assert.equal(typeof json[k], "string", k);
  for (const k of ["count", "totalFound", "omitted", "navSections"]) assert.equal(typeof json[k], "number", k);
  assert.equal(typeof json.truncated, "boolean");
};

test("POSITIVE krabka pattern: no /sitemap.xml, robots Sitemap: -> sitemap-index.xml -> child urlset finds /docs/quickstart", async () => {
  stubSite((u) => {
    if (u === O + "/" || u === O) return home;
    if (u === O + "/robots.txt") return `User-agent: *\nAllow: /\nSitemap: ${O}/sitemap-index.xml\n`;
    if (u === O + "/sitemap-index.xml") return index("/sitemap-0.xml");
    if (u === O + "/sitemap-0.xml") return urlset("/", "/docs", "/docs/quickstart", "/pricing");
    if (u === O + "/sitemap.xml") return null;
    if (u.startsWith(O + "/")) return page("P");
    return null;
  });
  const { status, json } = await generate(O);
  assert.equal(status, 200);
  contract(json);
  assert.match(json.llmsTxt, /\(https:\/\/krabka\.example\/docs\/quickstart\)/, "SIG:KRABKA_QUICKSTART_MISSING");
  assert.equal(json.discovery.source, "sitemap");
  assert.ok(json.discovery.sitemaps.some((s) => s.url === O + "/sitemap-index.xml" && s.kind === "index" && s.source === "robots.txt"));
  assert.ok(json.discovery.missing.some((m) => m.url === O + "/sitemap.xml" && m.status === 404), "SIG:MISSING_SITEMAP_NOT_REPORTED");
});

test("POSITIVE supplied list: explicit paths, provenance=supplied, missing + redirected reported", async () => {
  stubSite((u) => {
    if (u === O + "/" || u === O) return home;
    if (u === O + "/docs/quickstart") return page("Quickstart");
    if (u === O + "/old") return { status: 301, location: "/new" };
    if (u === O + "/new") return page("New");
    if (u.endsWith("sitemap.xml") || u.endsWith("robots.txt")) throw new Error("SIG:AUTO_DISCOVERY_RAN_IN_SUPPLIED_MODE");
    return null;
  });
  const { status, json } = await generate(O, "&paths=" + encodeURIComponent("/docs/quickstart,/old,/gone,https://evil.example/x,http://169.254.169.254/latest"));
  assert.equal(status, 200);
  contract(json);
  assert.equal(json.discovery.mode, "supplied");
  assert.match(json.llmsTxt, /krabka\.example\/docs\/quickstart\)/);
  assert.match(json.llmsTxt, /krabka\.example\/new\)/);
  assert.ok(json.discovery.missing.some((m) => m.url === O + "/gone"), "SIG:SUPPLIED_MISSING_NOT_REPORTED");
  assert.ok(json.discovery.redirected.some((r) => r.from === O + "/old" && r.to === O + "/new"), "SIG:SUPPLIED_REDIRECT_NOT_REPORTED");
  assert.equal(reasons(json).filter((r) => r === "cross_origin_path").length, 2, "SIG:SUPPLIED_URL_BYPASS");
  assert.ok(!calls.some((c) => c.includes("evil.example") || c.includes("169.254")), "SIG:SUPPLIED_URL_FETCHED_OFF_ORIGIN");
});

test("FAIL cross-origin sitemap: robots and index entries on other origins are refused, not fetched", async () => {
  stubSite((u) => {
    if (u === O + "/" || u === O) return home;
    if (u === O + "/robots.txt") return `Sitemap: https://cdn.other.example/sitemap.xml\nSitemap: ${O}/idx.xml\n`;
    if (u === O + "/idx.xml") return index("https://other.example/s.xml", "/s1.xml");
    if (u === O + "/s1.xml") return urlset("/a", "https://other.example/leak");
    return null;
  });
  const { status, json } = await generate(O);
  assert.equal(status, 200);
  assert.equal(reasons(json).filter((r) => r === "cross_origin_sitemap").length, 2, "SIG:CROSS_ORIGIN_SITEMAP");
  assert.ok(!calls.some((c) => c.includes("other.example")), "SIG:CROSS_ORIGIN_FETCHED");
  assert.ok(!json.llmsTxt.includes("other.example"), "SIG:CROSS_ORIGIN_LOC_EMITTED");
});

test("FAIL off-origin redirect: sitemap redirecting to another host is rejected", async () => {
  stubSite((u) => {
    if (u === O + "/" || u === O) return home;
    if (u === O + "/sitemap.xml") return { status: 302, location: "https://attacker.example/sitemap.xml" };
    return null;
  });
  const { status, json } = await generate(O);
  assert.equal(status, 200);
  assert.ok(reasons(json).includes("off_origin_redirect"), "SIG:OFF_ORIGIN_REDIRECT");
  assert.ok(!calls.some((c) => c.includes("attacker.example")), "SIG:OFF_ORIGIN_FOLLOWED");
});

test("FAIL off-origin redirect on the homepage is a 400 with code", async () => {
  stubSite((u) => (u.startsWith(O) ? { status: 301, location: "http://10.0.0.5/" } : null));
  const { status, json } = await generate(O);
  assert.equal(status, 400);
  assert.equal(json.code, "off_origin_redirect", "SIG:HOMEPAGE_OFF_ORIGIN_REDIRECT");
});

test("FAIL oversize XML: sitemap over the byte cap is rejected", async () => {
  const big = urlset(...Array.from({ length: 60000 }, (_, i) => `/p/${i}-${"x".repeat(20)}`));
  assert.ok(big.length > 2_000_000);
  stubSite((u) => {
    if (u === O + "/" || u === O) return home;
    if (u === O + "/sitemap.xml") return big;
    return null;
  });
  const { status, json } = await generate(O);
  assert.equal(status, 200);
  assert.ok(reasons(json).includes("oversize_xml"), "SIG:OVERSIZE_XML");
  assert.equal(json.discovery.source, "homepage-links");
});

test("FAIL malformed index: unterminated sitemapindex is rejected", async () => {
  stubSite((u) => {
    if (u === O + "/" || u === O) return home;
    if (u === O + "/sitemap.xml") return `<sitemapindex><sitemap><loc>${O}/s1.xml</loc>`;
    if (u === O + "/s1.xml") throw new Error("SIG:MALFORMED_INDEX_FOLLOWED");
    return null;
  });
  const { status, json } = await generate(O);
  assert.equal(status, 200);
  assert.ok(reasons(json).includes("malformed_index"), "SIG:MALFORMED_INDEX");
});

test("FAIL cyclic index: self and parent references are refused, one level only", async () => {
  stubSite((u) => {
    if (u === O + "/" || u === O) return home;
    if (u === O + "/sitemap.xml") return index("/sitemap.xml", "/child.xml");
    if (u === O + "/child.xml") return index("/sitemap.xml");
    return null;
  });
  const { status, json } = await generate(O);
  assert.equal(status, 200);
  assert.ok(reasons(json).filter((r) => r === "cyclic_index").length >= 2, "SIG:CYCLIC_INDEX");
  assert.ok(calls.filter((c) => c === O + "/sitemap.xml").length === 1, "SIG:CYCLE_REFETCHED");
});

test("FAIL private IP: host resolving to a private address is refused before any fetch", async () => {
  stubSite(() => home, { addr: () => "10.1.2.3" });
  const { status, json } = await generate("https://intranet.example");
  assert.equal(status, 400);
  assert.equal(json.code, "ssrf", "SIG:PRIVATE_IP");
  assert.equal(calls.length, 0, "SIG:PRIVATE_IP_FETCHED");
});

test("cap stays 50 with sitemap discovery", async () => {
  stubSite((u) => {
    if (u === O + "/" || u === O) return home;
    if (u === O + "/sitemap.xml") return urlset(...Array.from({ length: 80 }, (_, i) => `/p${i}`));
    if (u.startsWith(O + "/p")) return page("P");
    return null;
  });
  const { json } = await generate(O);
  assert.equal(json.count, 50, "SIG:CAP_CHANGED");
  assert.equal(json.truncated, true);
});
