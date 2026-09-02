import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createFixtureFetch, loadCatalog } from "./lib.mjs";
import { runSearchReadiness } from "./search-readiness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const catalog = loadCatalog();
const healthy = JSON.parse(readFileSync(join(here, "fixtures/healthy.json"), "utf8"));
const cli = join(here, "cli.mjs");
const primary = catalog.sites[0];
const primaryOrigin = primary.origin;

function overlay(origin, paths) {
  const fixture = structuredClone(healthy);
  fixture.responses[origin] = { ...fixture.responses[origin], ...paths };
  return fixture;
}

function byId(report, siteId) {
  return report.sites.find((site) => site.id === siteId);
}

function check(report, siteId, checkId) {
  const site = byId(report, siteId);
  assert.ok(site, `missing site ${siteId}`);
  const row = site.checks.find((item) => item.id === checkId);
  assert.ok(row, `missing check ${siteId}/${checkId}`);
  return row;
}

function assertClaimsUnobserved(report) {
  assert.equal(report.searchClaims.crawlability, "http_evaluated");
  assert.equal(report.searchClaims.indexing, "not_observed");
  assert.equal(report.searchClaims.ranking, "not_observed");
  assert.equal(report.searchClaims.geo_citation, "not_observed");
  assert.equal(report.searchClaims.traffic, "not_observed");
  const blob = JSON.stringify(report);
  assert.equal(blob.includes('"indexed":true'), false);
  assert.equal(blob.includes('"ranking":true'), false);
}

function htmlHome({ canonical, extras = "", jsonld, title = "SameDayDesk: agent commerce, built and shipped" }) {
  const block =
    jsonld ??
    `{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"SameDayDesk","url":"${primaryOrigin}/"}]}`;
  return `<!doctype html><html><head><link rel="canonical" href="${canonical}" />${extras}<title>${title}</title><script type="application/ld+json">${block}</script></head><body>SameDayDesk</body></html>`;
}

test("search-readiness source stays catalog-driven and does not invent protocol surfaces", () => {
  const files = ["search-readiness.mjs", "cli.mjs", "lib.mjs"].map((name) => readFileSync(join(here, name), "utf8"));
  for (const origin of catalog.sites.map((site) => site.origin)) {
    for (const source of files) {
      assert.equal(source.includes(origin), false, origin);
    }
  }
  const readiness = files[0];
  for (const token of ["MCP", "A2A", "x402"]) {
    assert.equal(readiness.includes(token), false, token);
  }
});

test("healthy search-readiness passes without calling crawlability indexing or ranking", async () => {
  const report = await runSearchReadiness(catalog, createFixtureFetch(healthy));
  assert.equal(report.ok, true);
  assert.equal(report.mode, "search-readiness");
  assert.equal(report.totals.missing, 0);
  assert.equal(report.totals.invalid, 0);
  assertClaimsUnobserved(report);
  assert.deepEqual(
    report.sites.map((site) => [site.id, site.role]),
    [
      ["samedaydesk", "operating_merchant"],
      ["ein-llc", "formation_activation"],
      ["neomorphic-io", "experiment_trust_lab"],
    ],
  );
  assert.equal(check(report, "ein-llc", "agent_card").status, "not_applicable");
  assert.equal(check(report, "neomorphic-io", "agent_card").status, "not_applicable");
  assert.equal(check(report, "samedaydesk", "agent_card").status, "ok");
  assert.equal(check(report, "samedaydesk", "not_found_machine").status, "ok");
  for (const site of catalog.sites) {
    assert.equal(check(report, site.id, "canonical_origin").status, "ok");
    assert.equal(check(report, site.id, "robots_sitemap").status, "ok");
    assert.equal(check(report, site.id, "sitemap_urls").status, "ok");
    assert.equal(check(report, site.id, "sitemap_sample").status, "ok");
    assert.equal(check(report, site.id, "jsonld_identity").status, "ok");
    assert.equal(check(report, site.id, "llms_references").status, "ok");
    assert.equal(check(report, site.id, "hreflang").status, "not_applicable");
    assert.equal(check(report, site.id, "hreflang").detail, "no_hreflang_declared");
  }
});

test("wrong-origin canonical is invalid", async () => {
  const fixture = overlay(primaryOrigin, {
    "/": {
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: htmlHome({ canonical: "https://example.net/" }),
    },
  });
  const report = await runSearchReadiness(catalog, createFixtureFetch(fixture));
  assert.equal(report.ok, false);
  assertClaimsUnobserved(report);
  const row = check(report, primary.id, "canonical_origin");
  assert.equal(row.status, "invalid");
  assert.match(row.detail, /canonical_wrong_origin/);
  assert.equal(row.canonicalOrigin, "https://example.net");
});

test("malformed sitemap is invalid", async () => {
  const fixture = overlay(primaryOrigin, {
    "/sitemap.xml": {
      status: 200,
      contentType: "application/xml",
      body: "this is not a sitemap",
    },
  });
  const report = await runSearchReadiness(catalog, createFixtureFetch(fixture));
  assert.equal(report.ok, false);
  assertClaimsUnobserved(report);
  assert.equal(check(report, primary.id, "sitemap_urls").status, "invalid");
  assert.equal(check(report, primary.id, "sitemap_urls").detail, "sitemap_unparseable");
  assert.equal(check(report, primary.id, "sitemap_sample").status, "not_applicable");
});

test("duplicate sitemap URL is invalid", async () => {
  const loc = `${primaryOrigin}/`;
  const fixture = overlay(primaryOrigin, {
    "/sitemap.xml": {
      status: 200,
      contentType: "application/xml",
      body: `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${loc}</loc></url><url><loc>${loc}</loc></url></urlset>`,
    },
  });
  const report = await runSearchReadiness(catalog, createFixtureFetch(fixture));
  assert.equal(report.ok, false);
  const row = check(report, primary.id, "sitemap_urls");
  assert.equal(row.status, "invalid");
  assert.match(row.detail, /sitemap_duplicate_url/);
  assert.equal(row.duplicateCount, 1);
});

test("sitemap sample treats inner URL with homepage canonical as invalid", async () => {
  const inner = `${primaryOrigin}/inner-page`;
  const fixture = overlay(primaryOrigin, {
    "/sitemap.xml": {
      status: 200,
      contentType: "application/xml",
      body: `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${primaryOrigin}/</loc></url><url><loc>${inner}</loc></url></urlset>`,
    },
    "/inner-page": {
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: htmlHome({ canonical: `${primaryOrigin}/` }),
    },
  });
  const report = await runSearchReadiness(catalog, createFixtureFetch(fixture));
  assert.equal(report.ok, false);
  const row = check(report, primary.id, "sitemap_sample");
  assert.equal(row.status, "invalid");
  assert.equal(row.sample[1].detail, "soft_404_homepage");
});

test("foreign sitemap URL is invalid and is not fetched", async () => {
  const fixture = overlay(primaryOrigin, {
    "/sitemap.xml": {
      status: 200,
      contentType: "application/xml",
      body: `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${primaryOrigin}/</loc></url><url><loc>https://example.net/elsewhere</loc></url></urlset>`,
    },
  });
  let fetchedForeign = false;
  const inner = createFixtureFetch(fixture);
  const fetchImpl = async (url) => {
    if (url.startsWith("https://example.net")) fetchedForeign = true;
    return inner(url);
  };
  const report = await runSearchReadiness(catalog, fetchImpl);
  assert.equal(report.ok, false);
  assert.equal(fetchedForeign, false);
  const row = check(report, primary.id, "sitemap_urls");
  assert.equal(row.status, "invalid");
  assert.match(row.detail, /sitemap_foreign_url/);
  assert.equal(row.foreignCount, 1);
});

test("broken same-origin llms reference is invalid", async () => {
  const broken = `${primaryOrigin}/.well-known/missing-machine.json`;
  const fixture = overlay(primaryOrigin, {
    "/llms.txt": {
      status: 200,
      contentType: "text/plain; charset=utf-8",
      body: `# SameDayDesk\n\n- [missing](${broken})\n`,
    },
    "/.well-known/missing-machine.json": {
      status: 404,
      contentType: "text/plain",
      body: "Not found\n",
    },
  });
  const report = await runSearchReadiness(catalog, createFixtureFetch(fixture));
  assert.equal(report.ok, false);
  const row = check(report, primary.id, "llms_references");
  assert.equal(row.status, "invalid");
  assert.match(row.detail, /not_found/);
  assert.equal(row.sample[0].httpStatus, 404);
});

test("malformed JSON-LD is invalid", async () => {
  const fixture = overlay(primaryOrigin, {
    "/": {
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: htmlHome({
        canonical: `${primaryOrigin}/`,
        jsonld: "{not json",
      }),
    },
  });
  const report = await runSearchReadiness(catalog, createFixtureFetch(fixture));
  assert.equal(report.ok, false);
  assert.equal(check(report, primary.id, "jsonld").status, "invalid");
  assert.equal(check(report, primary.id, "jsonld_identity").status, "invalid");
  assert.equal(check(report, primary.id, "jsonld_identity").detail, "jsonld_unparseable");
});

test("non-reciprocal declared hreflang is invalid", async () => {
  const es = `${primaryOrigin}/es/`;
  const fixture = overlay(primaryOrigin, {
    "/": {
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: htmlHome({
        canonical: `${primaryOrigin}/`,
        extras: `<link rel="alternate" hreflang="en" href="${primaryOrigin}/" /><link rel="alternate" hreflang="es" href="${es}" />`,
      }),
    },
    "/es/": {
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html><head><title>Spanish</title></head><body>es</body></html>`,
    },
  });
  const report = await runSearchReadiness(catalog, createFixtureFetch(fixture));
  assert.equal(report.ok, false);
  const row = check(report, primary.id, "hreflang");
  assert.equal(row.status, "invalid");
  assert.equal(row.detail, "hreflang_not_reciprocal");
});

test("reciprocal declared hreflang is ok and undeclared siblings stay not_applicable", async () => {
  const es = `${primaryOrigin}/es/`;
  const alts =
    `<link rel="alternate" hreflang="en" href="${primaryOrigin}/" />` +
    `<link rel="alternate" hreflang="es" href="${es}" />` +
    `<link rel="alternate" hreflang="x-default" href="${primaryOrigin}/" />`;
  const fixture = overlay(primaryOrigin, {
    "/": {
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: htmlHome({ canonical: `${primaryOrigin}/`, extras: alts }),
    },
    "/es/": {
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html><head>${alts}<title>Spanish</title></head><body>es</body></html>`,
    },
  });
  const report = await runSearchReadiness(catalog, createFixtureFetch(fixture));
  assert.equal(report.ok, true);
  assert.equal(check(report, primary.id, "hreflang").status, "ok");
  assert.equal(check(report, "ein-llc", "hreflang").status, "not_applicable");
  assert.equal(check(report, "neomorphic-io", "hreflang").status, "not_applicable");
  assert.equal(check(report, "ein-llc", "agent_card").status, "not_applicable");
});

test("CLI search-readiness default output is compact JSON", () => {
  const pass = spawnSync(
    process.execPath,
    [cli, "--mode", "search-readiness", "--fixture", join(here, "fixtures/healthy.json")],
    { encoding: "utf8" },
  );
  assert.equal(pass.status, 0, pass.stderr);
  const trimmed = pass.stdout.trim();
  assert.equal(trimmed.includes("\n"), false);
  const parsed = JSON.parse(trimmed);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.mode, "search-readiness");
  assert.equal(parsed.searchClaims.indexing, "not_observed");
});

test("CLI search-readiness reports invalid fixtures with compact JSON and exit 1", () => {
  const loc = `${primaryOrigin}/`;
  const fixture = overlay(primaryOrigin, {
    "/sitemap.xml": {
      status: 200,
      contentType: "application/xml",
      body: `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${loc}</loc></url><url><loc>${loc}</loc></url></urlset>`,
    },
  });
  const dir = mkdtempSync(join(tmpdir(), "portfolio-search-readiness-"));
  const fixturePath = join(dir, "duplicate-sitemap.json");
  writeFileSync(fixturePath, JSON.stringify(fixture));
  const fail = spawnSync(process.execPath, [cli, "--mode", "search-readiness", "--fixture", fixturePath], {
    encoding: "utf8",
  });
  assert.equal(fail.status, 1, fail.stderr);
  const parsed = JSON.parse(fail.stdout.trim());
  assert.equal(parsed.ok, false);
  assert.equal(parsed.mode, "search-readiness");
  assert.equal(parsed.searchClaims.indexing, "not_observed");
});
