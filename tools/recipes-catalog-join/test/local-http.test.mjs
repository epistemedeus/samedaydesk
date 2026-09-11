import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseStdout, runJoin } from "./helpers.mjs";
import { joinRecipesCatalog } from "../lib/join.mjs";
import {
  loadCatalogFromHttp,
  loadFamiliesFromHttp,
  loadRecipeSpecsFromHttp,
  loadRouter,
} from "../lib/adapters.mjs";
import { servePublishedSurfaces } from "../lib/http.mjs";
import { PUBLISHED } from "../lib/paths.mjs";

test("local HTTP serves published catalog/recipes/families and join consumes them", async () => {
  const served = await servePublishedSurfaces();
  try {
    const catalogRes = await fetch(`${served.origin}/catalog.json`);
    assert.equal(catalogRes.ok, true);
    const catalog = await catalogRes.json();
    const disk = JSON.parse(readFileSync(PUBLISHED.catalog, "utf8"));
    assert.deepEqual(catalog, disk);

    const report = await joinRecipesCatalog({
      loadCatalog: () => loadCatalogFromHttp(served.origin),
      loadRecipeSpecs: () => loadRecipeSpecsFromHttp(served.origin),
      loadFamilies: () => loadFamiliesFromHttp(served.origin),
      router: await loadRouter(),
    });
    assert.ok(["local-runtime-http", "mixed"].includes(report.evidenceClass), report.evidenceClass);
    assert.equal(report.source.loaders.catalog, "local-runtime-http");
    assert.equal(report.source.loaders.recipeSpecs, "local-runtime-http");
    assert.equal(report.source.loaders.families, "local-runtime-http");
    assert.equal(report.callerJourney.feedAgenda.classification, "catalog");
    assert.equal(report.callerJourney.sourceChangeAlert.classification, "recipe-not-catalog");
    assert.equal(report.callerJourney.pageChangeEvidence.selectedOfferId, "sdd.page_change_offline");
    assert.equal(report.paid, false);
    assert.equal(report.executionAuthorized, false);
  } finally {
    await served.stop();
  }
});

test("CLI --http joins over loopback HTTP of the published files", () => {
  const spawned = runJoin(["--http"]);
  assert.equal(spawned.status, 0, spawned.stderr);
  const report = parseStdout(spawned);
  assert.ok(["local-runtime-http", "mixed"].includes(report.evidenceClass), report.evidenceClass);
  assert.equal(report.source.loaders.catalog, "local-runtime-http");
  assert.equal(report.callerJourney.feedAgenda.id, "feed-agenda");
  assert.equal(report.callerJourney.sourceChangeAlert.classification, "recipe-not-catalog");
  assert.equal(report.callerJourney.pageChangeEvidence.selectedOfferId, "sdd.page_change_offline");
});

test("CLI --out writes join-report.json to a temp path, not published surfaces", () => {
  const dir = mkdtempSync(join(tmpdir(), "recipes-catalog-join-"));
  const dest = join(dir, "join-report.json");
  const spawned = runJoin(["--out", dest]);
  assert.equal(spawned.status, 0, spawned.stderr);
  const report = JSON.parse(readFileSync(dest, "utf8"));
  assert.equal(report.schema, "samedaydesk.recipes-catalog-join.v1");
  assert.equal(report.executionAuthorized, false);
});
