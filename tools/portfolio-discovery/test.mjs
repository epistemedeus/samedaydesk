import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  catalogRequestUrls,
  createFixtureFetch,
  loadCatalog,
  runPortfolioDiscovery,
} from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const catalog = loadCatalog();
const fixtures = {
  healthy: join(here, "fixtures/healthy.json"),
  soft404: join(here, "fixtures/soft-404-machine.json"),
  gaps: join(here, "fixtures/gaps.json"),
};

function loadFixture(name) {
  return JSON.parse(readFileSync(fixtures[name], "utf8"));
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

test("catalog is the only origin list and names the three public sites", () => {
  assert.deepEqual(
    catalog.sites.map((site) => [site.id, site.role]),
    [
      ["samedaydesk", "operating_merchant"],
      ["ein-llc", "formation_activation"],
      ["neomorphic-io", "experiment_trust_lab"],
    ],
  );
  const origins = catalog.sites.map((site) => site.origin);
  assert.equal(new Set(origins).size, 3);
  for (const origin of origins) {
    assert.match(origin, /^https:\/\//);
    assert.equal(origin.endsWith("/"), false);
  }
  const lib = readFileSync(join(here, "lib.mjs"), "utf8");
  const cli = readFileSync(join(here, "cli.mjs"), "utf8");
  for (const origin of origins) {
    assert.equal(lib.includes(origin), false, origin);
    assert.equal(cli.includes(origin), false, origin);
  }
});

test("healthy fixtures pass, including not_applicable sibling machine cards", async () => {
  const report = await runPortfolioDiscovery(catalog, createFixtureFetch(loadFixture("healthy")));
  assert.equal(report.ok, true);
  assert.equal(report.totals.missing, 0);
  assert.equal(report.totals.invalid, 0);
  assert.equal(check(report, "ein-llc", "agent_card").status, "not_applicable");
  assert.equal(check(report, "neomorphic-io", "jsonld").status, "not_applicable");
  assert.equal(check(report, "neomorphic-io", "agent_card").status, "not_applicable");
  assert.equal(check(report, "samedaydesk", "not_found_machine").status, "ok");
  assert.equal(check(report, "samedaydesk", "jsonld").status, "ok");
});

test("SPA homepage at 200 for a missing well-known path is invalid, not ok", async () => {
  const report = await runPortfolioDiscovery(catalog, createFixtureFetch(loadFixture("soft404")));
  assert.equal(report.ok, false);
  const row = check(report, "samedaydesk", "not_found_machine");
  assert.equal(row.status, "invalid");
  assert.equal(row.detail, "soft_404_homepage");
  assert.equal(check(report, "ein-llc", "not_found_machine").status, "ok");
  assert.equal(check(report, "neomorphic-io", "not_found_machine").status, "ok");
});

test("distinguishes missing, invalid, and not_applicable on mixed gaps", async () => {
  const report = await runPortfolioDiscovery(catalog, createFixtureFetch(loadFixture("gaps")));
  assert.equal(report.ok, false);
  assert.equal(check(report, "samedaydesk", "robots").status, "missing");
  assert.equal(check(report, "samedaydesk", "agent_card").status, "missing");
  assert.equal(check(report, "samedaydesk", "home").status, "invalid");
  assert.equal(check(report, "samedaydesk", "sitemap").status, "invalid");
  assert.equal(check(report, "samedaydesk", "llms").status, "invalid");
  assert.equal(check(report, "samedaydesk", "jsonld").status, "invalid");
  assert.equal(check(report, "samedaydesk", "not_found_machine").status, "invalid");
  assert.equal(check(report, "ein-llc", "agent_card").status, "not_applicable");
  assert.equal(check(report, "neomorphic-io", "jsonld").status, "not_applicable");
});

test("fixture fetch covers every catalog URL for the healthy pack", () => {
  const fixture = loadFixture("healthy");
  const fetchImpl = createFixtureFetch(fixture);
  for (const url of catalogRequestUrls(catalog)) {
    assert.doesNotMatch(url, /undefined/);
  }
  return Promise.all(
    catalogRequestUrls(catalog).map(async (url) => {
      const rec = await fetchImpl(url);
      assert.notEqual(rec.error, "fixture_miss", url);
      assert.ok(rec.status > 0, url);
    }),
  );
});

test("CLI --fixture healthy exits 0 and --fixture soft-404 exits 1", () => {
  const cli = join(here, "cli.mjs");
  const pass = spawnSync(process.execPath, [cli, "--fixture", fixtures.healthy], { encoding: "utf8" });
  assert.equal(pass.status, 0, pass.stderr);
  const parsed = JSON.parse(pass.stdout);
  assert.equal(parsed.ok, true);
  const fail = spawnSync(process.execPath, [cli, "--fixture", fixtures.soft404], { encoding: "utf8" });
  assert.equal(fail.status, 1);
  assert.equal(JSON.parse(fail.stdout).ok, false);
});

test("CLI without --live or --fixture does not probe the network", () => {
  const cli = join(here, "cli.mjs");
  const result = spawnSync(process.execPath, [cli], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--live is not part of npm run build/);
});
