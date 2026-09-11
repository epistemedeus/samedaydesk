import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseStderr, parseStdout, runJoin } from "./helpers.mjs";
import { PUBLISHED } from "../lib/paths.mjs";
import { REFUSAL } from "../lib/refuse.mjs";
import { joinRecipesCatalog } from "../lib/join.mjs";
import {
  loadCatalogFromHttp,
  loadFamiliesFromHttp,
  loadRecipeSpecsFromHttp,
  loadRouter,
} from "../lib/adapters.mjs";
import { servePublishedSurfaces } from "../lib/http.mjs";

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function tempDir() {
  return mkdtempSync(join(tmpdir(), "recipes-catalog-join-b-"));
}

function writeCatalogB() {
  const dir = tempDir();
  const published = JSON.parse(readFileSync(PUBLISHED.catalog, "utf8"));
  const catalog = structuredClone(published);
  catalog.jobs = catalog.jobs.filter((job) => job.id !== "feed-agenda");
  catalog.jobs.push({
    id: "source-change-alert",
    title: "Source change alert (catalog B probe)",
    summary: "Caller-supplied catalog B only. Not a published useful-jobs rewrite.",
    cli: ["node", "bin/useful-jobs.mjs", "run", "source-change-alert"],
    requiredInputs: ["--input"],
    outputs: ["probe.json"],
    sampleAvailable: false,
    exampleFlag: "--example",
    freeSample: false,
    notes: "W5-M10 source B.",
  });
  const path = join(dir, "catalog-b.json");
  const bytes = Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`);
  writeFileSync(path, bytes);
  return { dir, path, bytes, sha256: sha256(bytes) };
}

function writeDuplicateCatalog() {
  const dir = tempDir();
  const published = JSON.parse(readFileSync(PUBLISHED.catalog, "utf8"));
  const catalog = structuredClone(published);
  catalog.jobs = [catalog.jobs[0], { ...catalog.jobs[0] }];
  const path = join(dir, "catalog-dup.json");
  writeFileSync(path, `${JSON.stringify(catalog, null, 2)}\n`);
  return path;
}

function writeRecipeSpecsB() {
  const dir = join(tempDir(), "specs");
  mkdirSync(dir);
  for (const name of readdirSync(PUBLISHED.recipeSpecsDir).filter((n) => n.endsWith(".recipe.json"))) {
    cpSync(join(PUBLISHED.recipeSpecsDir, name), join(dir, name));
  }
  const alertPath = join(dir, "source-change-alert.recipe.json");
  const spec = JSON.parse(readFileSync(alertPath, "utf8"));
  spec.notes = "W5-M10 recipe source A notes only";
  const bytes = Buffer.from(`${JSON.stringify(spec, null, 2)}\n`);
  writeFileSync(alertPath, bytes);
  return { dir, alertPath, sha256: sha256(bytes), notes: spec.notes };
}

test("CLI: change catalog source B only; domain follows B and digest is B not published A", () => {
  const publishedHash = sha256(readFileSync(PUBLISHED.catalog));
  const baseline = parseStdout(runJoin([]));
  assert.equal(baseline.outcome, "joined");
  assert.equal(baseline.callerJourney.feedAgenda.id, "feed-agenda");
  assert.equal(baseline.callerJourney.sourceChangeAlert.classification, "recipe-not-catalog");
  assert.equal(baseline.source.catalogSha256, publishedHash);

  const sourceB = writeCatalogB();
  const spawned = runJoin(["--catalog", sourceB.path]);
  assert.equal(spawned.status, 0, spawned.stderr);
  const report = parseStdout(spawned);

  assert.equal(report.outcome, "joined");
  assert.equal(report.ok, true);
  assert.equal(report.callerJourney.feedAgenda, null);
  assert.equal(report.catalog.jobIds.includes("feed-agenda"), false);
  assert.equal(report.callerJourney.sourceChangeAlert.classification, "catalog");
  assert.equal(report.callerJourney.sourceChangeAlert.inCatalog, true);
  assert.equal(report.source.catalogSha256, sourceB.sha256);
  assert.notEqual(report.source.catalogSha256, publishedHash);
  assert.equal(report.source.namedInputs.catalog.sha256, sourceB.sha256);
  assert.equal(report.hashTerms.available, false);
  assert.equal(report.hashTerms.synthetic, true);
  assert.equal(report.hashTerms.binding, "later-integration");
  assert.equal(report.paid, false);
  assert.equal(report.executionAuthorized, false);
  assert.equal(sha256(readFileSync(PUBLISHED.catalog)), publishedHash);
});

test("CLI --http: catalog B over loopback is the catalog the join consumes", () => {
  const publishedHash = sha256(readFileSync(PUBLISHED.catalog));
  const sourceB = writeCatalogB();
  const spawned = runJoin(["--http", "--catalog", sourceB.path]);
  assert.equal(spawned.status, 0, spawned.stderr);
  const report = parseStdout(spawned);
  assert.equal(report.source.loaders.catalog, "local-runtime-http");
  assert.equal(report.callerJourney.feedAgenda, null);
  assert.equal(report.callerJourney.sourceChangeAlert.inCatalog, true);
  assert.equal(report.source.catalogSha256, sourceB.sha256);
  assert.notEqual(report.source.catalogSha256, publishedHash);
  assert.equal(report.hashTerms.synthetic, true);
});

test("CLI: recipe-specs source A notes change without rewriting catalog B", () => {
  const publishedCatalog = sha256(readFileSync(PUBLISHED.catalog));
  const specsB = writeRecipeSpecsB();
  const spawned = runJoin(["--recipe-specs", specsB.dir]);
  assert.equal(spawned.status, 0, spawned.stderr);
  const report = parseStdout(spawned);
  assert.equal(report.callerJourney.sourceChangeAlert.notes, specsB.notes);
  assert.equal(report.source.recipeSpecSha256["source-change-alert"], specsB.sha256);
  assert.equal(report.source.catalogSha256, publishedCatalog);
  assert.equal(report.callerJourney.feedAgenda.id, "feed-agenda");
});

test("CLI: duplicate catalog job ids refuse as inconsistent source, not ok:true", () => {
  const dup = writeDuplicateCatalog();
  const spawned = runJoin(["--catalog", dup]);
  assert.equal(spawned.status, 2);
  const body = parseStderr(spawned);
  assert.equal(body.ok, false);
  assert.equal(body.outcome, "refused");
  assert.equal(body.code, REFUSAL.INCONSISTENT_NAMED_SOURCE);
  assert.equal(body.surface, "catalog");
  assert.equal(body.executionAuthorized, false);
  assert.equal(body.paid, false);
});

test("CLI: missing catalog is a named-source refusal; wrong schema is engine-failure", () => {
  const missing = runJoin(["--catalog", join(tempDir(), "no-such-catalog.json")]);
  assert.equal(missing.status, 2);
  const missingBody = parseStderr(missing);
  assert.equal(missingBody.ok, false);
  assert.equal(missingBody.outcome, "refused");
  assert.equal(missingBody.code, REFUSAL.MISSING_NAMED_SOURCE);

  const wrong = join(tempDir(), "recipe-as-catalog.json");
  writeFileSync(wrong, readFileSync(join(PUBLISHED.recipeSpecsDir, "source-change-alert.recipe.json")));
  const engine = runJoin(["--catalog", wrong]);
  assert.equal(engine.status, 2);
  const engineBody = parseStderr(engine);
  assert.equal(engineBody.ok, false);
  assert.equal(engineBody.outcome, "engine-failure");
  assert.match(engineBody.message, /unsupported_catalog_schema/);
  assert.equal(Object.hasOwn(engineBody, "code"), false);
});

test("HTTP families.md vs discovery disagreement refuses; ok cannot stay true", async () => {
  const dir = tempDir();
  const discovery = JSON.parse(readFileSync(PUBLISHED.familyDiscovery, "utf8"));
  const bad = { ...discovery, families: discovery.families.filter((id) => id !== "rss-atom-brief") };
  const badPath = join(dir, "discovery-bad.json");
  writeFileSync(badPath, `${JSON.stringify(bad, null, 2)}\n`);
  const served = await servePublishedSurfaces({ familyDiscovery: badPath });
  const router = await loadRouter();
  try {
    await assert.rejects(
      () =>
        joinRecipesCatalog({
          loadCatalog: () => loadCatalogFromHttp(served.origin),
          loadRecipeSpecs: () => loadRecipeSpecsFromHttp(served.origin),
          loadFamilies: () => loadFamiliesFromHttp(served.origin),
          router,
        }),
      (err) =>
        err.code === REFUSAL.INCONSISTENT_NAMED_SOURCE &&
        err.ok === false &&
        err.surface === "families",
    );
  } finally {
    await served.stop();
  }
});

test("HTTP catalog 404 is transport/engine failure, not a joined analysis", async () => {
  const served = await servePublishedSurfaces();
  const router = await loadRouter();
  try {
    await assert.rejects(
      () =>
        joinRecipesCatalog({
          loadCatalog: () => loadCatalogFromHttp(`${served.origin}/missing-origin`),
          loadRecipeSpecs: () => loadRecipeSpecsFromHttp(served.origin),
          loadFamilies: () => loadFamiliesFromHttp(served.origin),
          router,
        }),
      (err) => /http_404:/.test(err.message),
    );
  } finally {
    await served.stop();
  }
});
