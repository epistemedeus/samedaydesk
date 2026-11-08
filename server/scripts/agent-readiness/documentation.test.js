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

const alternate = (target = "/results.md") => `<${target}>; rel=alternate; type="text/markdown"`;
const capped = (link) => ({
  ...home, truncated: true, headers: { ...home.headers, ...(link === undefined ? {} : { link }) },
});

test("the final same-origin response supplies the relative link context", async (t) => {
  const seen = wire(t, {
    "/": { status: 302, headers: { location: "/reports/current/index.html", link: alternate("/redirect.md") } },
    "/reports/current/index.html": capped(
      `</llms.txt>; rel=describedby; type="text/plain"; title="fake, </decoy.md>; rel=alternate", ` +
      `</assets,legacy>; rel=preload; title="escaped \\"quote\\", and comma", ` +
      `<./results.md>; REL="alternate related"; TYPE="Text/Markdown"; title="untrusted label"`,
    ),
  });
  const report = await runDocumentationReadiness(origin, { lookup });
  assert.deepEqual(report.nextAction, {
    kind: "read-declared-alternate", path: "/reports/current/results.md", mediaTypeHint: "text/markdown", verified: false,
  });
  assert.equal(seen.includes("/reports/current/results.md"), false);
  assert.equal(seen.includes("/redirect.md"), false);
  assert.doesNotMatch(JSON.stringify(report), /decoy|untrusted label/);
});

test("no hint comes from an ordinary body, a non-home probe, or an off-origin redirect", async (t) => {
  const seen = wire(t, {
    "/": { ...capped(alternate()), truncated: false },
    "/llms.txt": capped(alternate()),
  });
  const report = await runDocumentationReadiness(origin, { lookup });
  assert.equal("nextAction" in report, false);
  assert.equal(seen.includes("/results.md"), false);

  const redirect = wire(t, {
    "/": { status: 302, headers: { location: "https://outside.example/", link: alternate() } },
  });
  const redirected = await runDocumentationReadiness(origin, { lookup });
  assert.equal("nextAction" in redirected, false);
  assert.equal(redirected.evidence.find(({ path }) => path === "/").outcome, "failed");
  assert.equal(redirect.includes("/results.md"), false);
});

test("a truncated refusal or challenge cannot yield a next action", async (t) => {
  const paths = { "/": { ...capped(alternate()), status: 503 } };
  wire(t, paths);
  const errorReport = await runDocumentationReadiness(origin, { lookup });
  assert.equal("nextAction" in errorReport, false);
  assert.equal(errorReport.evidence.find(({ path }) => path === "/").outcome, "failed");

  paths["/"] = { ...capped(alternate()), body: "<html><body>Just a moment</body></html>" };
  const challenge = await runDocumentationReadiness(origin, { lookup });
  assert.equal("nextAction" in challenge, false);
  assert.equal(challenge.evidence.find(({ path }) => path === "/").outcome, "blocked");
});

test("only over-cap HTML from a non-challenge response can offer the alternate", async (t) => {
  for (const homepage of [
    { ...capped(alternate()), headers: { "content-type": "application/json", link: alternate() }, body: '{"report":"bounded' },
    { ...capped(alternate()), headers: { ...home.headers, link: alternate(), "cf-mitigated": "challenge" } },
  ]) {
    const seen = wire(t, { "/": homepage });
    const report = await runDocumentationReadiness(origin, { lookup });
    assert.equal(report.checks.find(({ id }) => id === "homepage").status, "unknown");
    assert.equal("nextAction" in report, false);
    assert.equal(seen.includes("/results.md"), false);
  }
});
