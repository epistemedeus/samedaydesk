import assert from "node:assert/strict";
import test from "node:test";
import { setTransportForTests } from "../../lib/agent-readiness/bounded-fetch.js";
import { runDocumentationReadiness } from "../../lib/agent-readiness/documentation.js";

const origin = "https://docs.example.org";
const reply = (body = "", type = "text/plain", status = 200) => ({ status, headers: { "content-type": type }, body });
const home = reply("<html><head><title>Test</title></head><body><h1>Public documentation</h1></body></html>", "text/html");
const sitemap = reply('<?xml version="1.0"?><sitemapindex><sitemap><loc>https://docs.example.org/child.xml</loc></sitemap></sitemapindex>', "application/xml");
const missing = reply("", "text/html", 404);
const lookup = async () => [{ address: "93.184.216.34", family: 4 }];

function wire(t, paths) {
  const seen = [];
  setTransportForTests(async (url, options) => {
    assert.equal(url.origin, origin);
    assert.equal(options.method ?? "GET", "GET");
    assert.equal(options.address.address, "93.184.216.34");
    assert.equal(options.body, undefined);
    seen.push(url.pathname);
    return paths[url.pathname] ?? missing;
  });
  t.after(() => setTransportForTests());
  return seen;
}

test("unadvertised existing index outranks an optional llms.txt; no transaction probe or score", async (t) => {
  const seen = wire(t, { "/": home, "/robots.txt": reply("# Managed robots file\n"), "/sitemap-index.xml": sitemap });
  const result = await runDocumentationReadiness(origin, { lookup });
  assert.equal(result.schema, "agent-readiness.documentation.v1");
  assert.equal(result.score, undefined);
  assert.deepEqual(result.checks.map(({ id, status }) => [id, status]), [["homepage", "pass"], ["sitemap-discovery", "warn"], ["llms-index", "warn"]]);
  assert.equal(result.topFixes[0].fix, `Advertise the existing file in robots.txt: Sitemap: ${origin}/sitemap-index.xml`);
  assert.deepEqual(seen.sort(), ["/", "/llms.txt", "/robots.txt", "/sitemap-index.xml", "/sitemap.xml"].sort());
});

test("working declared sitemap and text index require no fallback, child fetch, or fix", async (t) => {
  const seen = wire(t, { "/": home, "/robots.txt": reply(`Sitemap: ${origin}/index.xml\n`), "/index.xml": sitemap, "/llms.txt": reply("\uFEFF# Documentation\n- [Guide](https://another.example/guide)", "text/markdown") });
  const result = await runDocumentationReadiness(origin, { lookup });
  assert.deepEqual(result.checks.map((row) => row.status), ["pass", "pass", "pass"]);
  assert.deepEqual(result.topFixes, []);
  assert.deepEqual(seen.sort(), ["/", "/llms.txt", "/robots.txt", "/index.xml"].sort());
});

test("refusal, HTML fallback and foreign declaration are not evidence of missing files", async (t) => {
  wire(t, { "/": reply("", "text/html", 403), "/robots.txt": reply("Sitemap: https://elsewhere.example/index.xml"), "/sitemap-index.xml": sitemap, "/llms.txt": reply("<html>Not the index</html>", "text/html") });
  const result = await runDocumentationReadiness(origin, { lookup });
  assert.deepEqual(result.checks.map((row) => row.status), ["unknown", "unknown", "warn"]);
  assert.match(result.topFixes[0].fix, /actual \/llms.txt/);
  assert.deepEqual(result.topFixes.map((row) => row.id), ["llms-index"]);
});

test("private DNS, redirect scope, and incomplete content do not become positive evidence", async (t) => {
  const seen = wire(t, {
    "/": { ...home, truncated: true },
    "/llms.txt": { status: 302, headers: { location: "https://another.example/llms.txt" }, body: "" },
    "/robots.txt": reply("# no declaration"),
    "/sitemap-index.xml": reply("<urlset><loc>https://docs.example.org/child"),
  });
  await assert.rejects(() => runDocumentationReadiness(origin, {
    lookup: async () => [{ address: "127.0.0.1", family: 4 }],
  }), /public address/);
  assert.deepEqual(seen, []);
  const result = await runDocumentationReadiness(origin, { lookup });
  assert.deepEqual(result.checks.map((row) => row.status), ["unknown", "unknown", "unknown"]);
  assert.deepEqual(result.topFixes, []);
  assert.equal(result.evidence.find((row) => row.path === "/llms.txt").outcome, "failed");
});
