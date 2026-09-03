import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { mergeSellerCatalog } from "./catalog.mjs";
import {
  DEFAULT_FIXTURE_DIR,
  SURFACES,
  applyDecision,
  createFixtureFetch,
  loadFixturePack,
  protectedKind,
  runSurface,
} from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const cli = join(here, "refresh.mjs");
const fixtureDir = DEFAULT_FIXTURE_DIR;

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

function parseReport(result) {
  assert.ok(result.stdout, result.stderr);
  return JSON.parse(result.stdout);
}

function loadCatalogFromFixtures() {
  const pack = loadFixturePack(fixtureDir);
  return { pack, catalog: mergeSellerCatalog(pack.openapi, pack.x402) };
}

test("catalog is origin OpenAPI plus x402.json and does not invent payTo", () => {
  const { catalog } = loadCatalogFromFixtures();
  const pack = loadFixturePack(fixtureDir);
  const manifestPayTo = pack.x402.items[0].accepts[0].payTo;
  const manifestAmount = pack.x402.items.find((item) => item.resource.routeTemplate === "/read").accepts[0]
    .amount;
  const openapiRead = pack.openapi.paths["/read"].get["x-payment-info"].price.amount;

  assert.equal(catalog.origin, pack.openapi.servers[0].url.replace(/\/$/, ""));
  assert.equal(catalog.openapiVersion, pack.openapi.info.version);
  assert.equal(catalog.payTo.length, 1);
  assert.equal(catalog.payTo[0], manifestPayTo);
  assert.equal(catalog.discoveryRoutes.find((route) => route.path === "/read").amount, manifestAmount);
  assert.equal(catalog.discoveryRoutes.find((route) => route.path === "/read").priceUsd, openapiRead);

  const sources = ["catalog.mjs", "lib.mjs", "refresh.mjs"].map((name) =>
    readFileSync(join(here, name), "utf8"),
  );
  for (const source of sources) {
    assert.equal(source.includes(manifestPayTo), false);
    assert.equal(source.includes(manifestAmount), false);
  }
});

test("every surface dry-run uses fixtures, prints wouldSend, and exits non-zero while stale", () => {
  const expected = {
    bazaar: "stale",
    mpp: "missing",
    agentverse: "stale",
    "mcp-registry": "stale",
  };
  for (const surface of SURFACES) {
    const result = runCli([surface, "--fixture", fixtureDir]);
    const report = parseReport(result);
    assert.equal(result.status, 1, `${surface} stderr=${result.stderr}`);
    assert.equal(report.ok, false);
    assert.equal(report.apply, "dry-run");
    assert.equal(report.classification, expected[surface], surface);
    assert.equal(report.sent.length, 0, surface);
    assert.ok(Array.isArray(report.wouldSend), surface);
    assert.ok(report.wouldSend.length > 0, surface);
    assert.ok(report.diff.length > 0, surface);
  }
});

test("bazaar dry-run diffs /read and Railway /extract prices against the origin catalog", () => {
  const { catalog } = loadCatalogFromFixtures();
  const result = runCli(["bazaar", "--fixture", fixtureDir]);
  const report = parseReport(result);
  const read = catalog.discoveryRoutes.find((route) => route.path === "/read");
  const extract = catalog.discoveryRoutes.find((route) => route.path === "/extract");

  const readDiff = report.diff.find(
    (row) => row.field === "amount" && String(row.resource).endsWith("/read"),
  );
  const railwayExtract = report.diff.find(
    (row) =>
      row.field === "amount" &&
      String(row.resource).includes("up.railway.app/extract"),
  );
  assert.equal(report.staleListed, 2);
  assert.equal(report.healthyListed, 8);
  assert.equal(report.missingCount, 15);
  assert.equal(readDiff.listed, "50000");
  assert.equal(readDiff.catalog, read.amount);
  assert.equal(railwayExtract.listed, "50000");
  assert.equal(railwayExtract.catalog, extract.amount);
  assert.equal(report.wouldSend.every((req) => req.method === "POST"), true);
  assert.equal(
    report.wouldSend.every((req) => jsonEqual(req.body.accepts, catalogByAccepts(catalog, req.body.resource))),
    true,
  );
});

function catalogByAccepts(catalog, resourceUrl) {
  const path = new URL(resourceUrl).pathname.replace(/\/$/, "") || "/";
  const route = catalog.discoveryRoutes.find((item) => item.path === path);
  return route?.accepts;
}

function jsonEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

test("mpp dry-run is missing against 142 official services and would send catalog endpoints", () => {
  const { catalog } = loadCatalogFromFixtures();
  const result = runCli(["mpp", "--fixture", fixtureDir]);
  const report = parseReport(result);
  assert.equal(report.serviceCount, 142);
  assert.equal(report.hits.length, 0);
  assert.equal(report.diff[0].field, "presence");
  const body = report.wouldSend[0].body;
  assert.equal(body.url, catalog.origin);
  assert.equal(body.endpoints.length, catalog.discoveryItemCount);
  const extract = body.endpoints.find((row) => row.path === "/extract");
  const catalogExtract = catalog.discoveryRoutes.find((row) => row.path === "/extract");
  assert.equal(extract.payment.amount, catalogExtract.amount);
  assert.equal(extract.payment.currency, catalogExtract.asset);
});

test("mcp-registry dry-run diffs listed version against live origin catalog version", () => {
  const { catalog, pack } = loadCatalogFromFixtures();
  const result = runCli(["mcp-registry", "--fixture", fixtureDir]);
  const report = parseReport(result);
  const listed = pack.mcpRegistry.servers[0].server.version;
  assert.equal(report.diff[0].field, "version");
  assert.equal(report.diff[0].listed, listed);
  assert.equal(report.diff[0].catalog, catalog.openapiVersion);
  assert.equal(report.wouldSend[0].body.version, catalog.openapiVersion);
  assert.equal(report.wouldSend[0].url, "https://registry.modelcontextprotocol.io/v0.1/publish");
});

test("agentverse dry-run diffs inactive status and would POST almanac status", () => {
  const result = runCli(["agentverse", "--fixture", fixtureDir]);
  const report = parseReport(result);
  assert.equal(report.records[0].status, "inactive");
  assert.equal(report.diff[0].field, "status");
  assert.equal(report.diff[0].listed, "inactive");
  assert.equal(report.diff[0].catalog, "active");
  assert.equal(report.wouldSend[0].method, "POST");
  assert.match(report.wouldSend[0].url, /\/v1\/almanac\/agents\/.+\/status/);
  assert.equal(report.wouldSend[0].body.is_active, true);
  assert.equal("payTo" in report.wouldSend[0].body, false);
  assert.equal("amount" in report.wouldSend[0].body, false);
});

test("--apply refuses bazaar and mpp because the bodies carry price, payTo, asset, or network", () => {
  for (const surface of ["bazaar", "mpp"]) {
    const result = runCli([surface, "--fixture", fixtureDir, "--apply"]);
    const report = parseReport(result);
    assert.equal(result.status, 1, surface);
    assert.equal(report.apply, "refused", surface);
    assert.match(report.refuseReason, /protected field/, surface);
    assert.equal(report.sent.length, 0, surface);
    assert.ok(report.protectedHits.length > 0, surface);
  }
});

test("--apply on mcp-registry is allowed for a version-only body and stays on the fixture fetch", async () => {
  const pack = loadFixturePack(fixtureDir);
  const writes = [];
  const fetchImpl = createFixtureFetch(pack, { writes });
  const report = await runSurface("mcp-registry", { fetchImpl, apply: true, writes });
  assert.equal(report.apply, "sent");
  assert.equal(report.sent.length, 1);
  assert.equal(report.sent[0].url, "https://registry.modelcontextprotocol.io/v0.1/publish");
  assert.equal(writes.at(-1).body.version, pack.openapi.info.version);
  assert.equal(protectedKind("version"), null);
});

test("applyDecision refuses only protected payment fields", () => {
  const allowed = applyDecision([{ field: "version", listed: "1", catalog: "2" }], [
    { method: "POST", url: "https://example.com", body: { version: "2" } },
  ]);
  assert.equal(allowed.allowed, true);
  const refused = applyDecision([{ field: "amount", listed: "1", catalog: "2" }], []);
  assert.equal(refused.allowed, false);
  assert.deepEqual(
    ["price", "payTo", "asset", "network", "facilitator"].map((name) => protectedKind(name)),
    ["price", "payTo", "asset", "network", "facilitator"],
  );
});

test("CLI without a surface prints usage and exits 2", () => {
  const result = runCli(["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stderr, /dry-run by default/);
  const missing = runCli([]);
  assert.equal(missing.status, 2);
});
