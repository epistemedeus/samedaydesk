import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { parseStdout, runJoin } from "./helpers.mjs";
import { PUBLISHED } from "../lib/paths.mjs";
import { joinRecipesCatalog } from "../lib/join.mjs";

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

test("journey: feed-agenda is catalog, source-change-alert is recipe-not-catalog, page_change_evidence is merchant page-change", async () => {
  const beforeCatalog = sha256(PUBLISHED.catalog);
  const beforeRecipe = sha256(join(PUBLISHED.recipeSpecsDir, "source-change-alert.recipe.json"));
  const beforeFamilies = sha256(PUBLISHED.familiesDoc);

  const spawned = runJoin([]);
  assert.equal(spawned.status, 0, spawned.stderr);
  const report = parseStdout(spawned);

  assert.equal(report.schema, "samedaydesk.recipes-catalog-join.v1");
  assert.equal(report.ok, true);
  assert.equal(report.executionAuthorized, false);
  assert.equal(report.paid, false);
  assert.equal(report.paymentRequiredFromRoutingIsPaid, false);
  assert.equal(report.evidenceClass, "local-runtime-fs");

  const feed = report.callerJourney.feedAgenda;
  assert.equal(feed.id, "feed-agenda");
  assert.equal(feed.classification, "catalog");
  assert.equal(report.catalog.jobIds.includes("feed-agenda"), true);
  assert.equal(report.catalog.purchaseAuthority, false);

  const alert = report.callerJourney.sourceChangeAlert;
  assert.equal(alert.id, "source-change-alert");
  assert.equal(alert.classification, "recipe-not-catalog");
  assert.equal(alert.inCatalog, false);
  assert.equal(alert.hasSpec, true);
  assert.equal(
    alert.adjacentMerchant.some((a) => a.offerId === "sdd.page_change_offline"),
    true,
  );

  const page = report.callerJourney.pageChangeEvidence;
  assert.equal(page.jobType, "page_change_evidence");
  assert.equal(page.selectedOfferId, "sdd.page_change_offline");
  assert.equal(page.product, "samedaydesk");
  assert.equal(page.hosting, "offline_local");
  assert.equal(page.classification, "merchant-not-catalog");
  assert.equal(page.inCatalog, false);
  assert.equal(page.paid, false);
  assert.equal(page.paymentRequired, false);
  assert.equal(page.executionAuthorized, false);

  assert.equal(report.catalog.jobIds.includes("source-change-alert"), false);
  assert.equal(
    report.adjacentNotCatalog.some((row) => row.id === "source-change-alert" && row.surface === "recipe"),
    true,
  );

  const rss = report.families.find((f) => f.id === "rss-atom-brief");
  assert.ok(rss);
  assert.equal(rss.inCatalog, false);
  assert.equal(rss.classification, "adjacent-not-catalog");
  assert.equal(
    rss.adjacentCatalog.some((a) => a.catalogJobId === "feed-agenda"),
    true,
    JSON.stringify(rss.adjacentCatalog),
  );

  const csv = report.families.find((f) => f.id === "csv-keyed-drift");
  assert.ok(csv);
  assert.equal(csv.inCatalog, false);
  assert.equal(csv.adjacentCatalog.length, 0);

  assert.equal(report.familyIdAgreement, true);
  assert.equal(report.hashTerms.owner, "I01");
  assert.equal(report.hashTerms.available, false);
  assert.equal(report.hashTerms.importedKernel, false);
  assert.equal(report.hashTerms.originalF01Wholesale, false);
  assert.equal(report.hashTerms.binding, "later-integration");

  assert.equal(sha256(PUBLISHED.catalog), beforeCatalog);
  assert.equal(sha256(join(PUBLISHED.recipeSpecsDir, "source-change-alert.recipe.json")), beforeRecipe);
  assert.equal(sha256(PUBLISHED.familiesDoc), beforeFamilies);
  assert.equal(report.source.catalogSha256, beforeCatalog);
});

test("library join matches CLI on published surfaces", async () => {
  const report = await joinRecipesCatalog();
  assert.equal(report.callerJourney.feedAgenda.classification, "catalog");
  assert.equal(report.callerJourney.sourceChangeAlert.classification, "recipe-not-catalog");
  assert.equal(report.callerJourney.pageChangeEvidence.selectedOfferId, "sdd.page_change_offline");
  const runnerOnly = report.recipes.filter((r) => r.listedInRunner && !r.hasSpec).map((r) => r.id).sort();
  assert.deepEqual(runnerOnly, ["comparable-record-extraction", "verification-reconcile"]);
  const issueBrief = report.recipes.find((r) => r.id === "issue-to-work-brief");
  assert.equal(issueBrief.adjacentCatalog.length, 0, JSON.stringify(issueBrief.adjacentCatalog));
  const comparable = report.recipes.find((r) => r.id === "comparable-record-extraction");
  assert.equal(comparable.adjacentCatalog.length, 0, JSON.stringify(comparable.adjacentCatalog));
  const openapi = report.families.find((f) => f.id === "openapi-used-ops");
  assert.equal(openapi.adjacentCatalog.some((a) => a.catalogJobId === "api-upgrade-brief"), true);
  const pricing = report.families.find((f) => f.id === "pricing-row-unit");
  assert.equal(pricing.adjacentCatalog.some((a) => a.catalogJobId === "vendor-budget-impact"), true);
  for (const crossing of report.forbiddenPaymentCrossings) {
    assert.notEqual(crossing.status, "crossed", crossing.id);
  }
  assert.ok(report.recipes.every((r) => r.id !== "feed-agenda"));
});
