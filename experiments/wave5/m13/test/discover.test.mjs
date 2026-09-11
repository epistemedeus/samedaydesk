import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { discoverFromDocuments, loadDocuments, assertUnlikeOffers } from "../src/discover.mjs";
import { reverseCopy, selectById } from "../src/identity.mjs";
import { findRepoRoot } from "../src/paths.mjs";

test("MCP latest is agents.samedaydesk.com; unfiltered first hit is not current", async () => {
  const docs = await loadDocuments();
  const discovery = discoverFromDocuments(docs);
  assert.equal(discovery.mcp.serverName, "io.github.epistemedeus/x402-data-gateway");
  assert.equal(discovery.mcp.current.remote, "https://agents.samedaydesk.com/mcp");
  assert.equal(discovery.mcp.current.version, "1.23.45");
  assert.equal(discovery.mcp.current.isLatest, true);
  assert.equal(discovery.mcp.searchLatestAgrees, true);
  assert.equal(discovery.mcp.naiveFirstHit.version, "1.0.0");
  assert.equal(
    discovery.mcp.naiveFirstHit.remote,
    "https://x402-url-extractor-production.up.railway.app/mcp",
  );
  assert.equal(discovery.mcp.naiveFirstHit.isLatest, false);
  assert.equal(discovery.mcp.naiveFirstHitIsCurrent, false);
  assert.equal(discovery.mcp.presenceListingVersion, "1.23.36");
  assert.equal(discovery.mcp.presenceListingMatchesLatest, false);
});

test("unlike offers stay unlike: live extract, SIA, fixture wrapper, free offline", async () => {
  const docs = await loadDocuments();
  const discovery = discoverFromDocuments(docs);
  const checks = assertUnlikeOffers(discovery);
  assert.equal(discovery.unlikeOffers.liveExtractUsd, "0.005");
  assert.equal(discovery.unlikeOffers.liveSellerIntegrityAuditUsd, "0.01");
  assert.equal(discovery.unlikeOffers.fixtureWrapperUsd, "0.02");
  assert.equal(discovery.unlikeOffers.freeOfflinePurchaseAuthority, false);
  assert.equal(discovery.liveOperations.extractUrl.priceUsd, "0.005");
  assert.equal(discovery.liveOperations.auditSellerIntegrity.priceUsd, "0.01");
  assert.equal(discovery.liveOperations.extractUrl.operationId, "extractUrl");
  assert.equal(discovery.liveOperations.auditSellerIntegrity.operationId, "auditSellerIntegrity");
  assert.equal(checks.liveExtractNotFixture, true);
  assert.equal(checks.liveSiaNotFixture, true);
  assert.equal(checks.liveExtractNotSia, true);
  assert.equal(checks.mcpPresenceNotForcedLatest, true);
  assert.equal(checks.naiveNotCurrent, true);
  assert.equal(discovery.jobs.selected.purchaseAuthority, false);
});

test("MPP listing is missing samedaydesk; index 0 is not that identity", async () => {
  const docs = await loadDocuments();
  const discovery = discoverFromDocuments(docs);
  assert.equal(discovery.mpp.serviceCount, 142);
  assert.equal(discovery.mpp.listed, false);
  assert.equal(discovery.mpp.selectedById, null);
  assert.equal(discovery.mpp.index0Id, "apex-db");
  assert.notEqual(discovery.mpp.index0Id, "samedaydesk");
});

test("Bazaar index 0 is not the current agents.samedaydesk.com /extract", async () => {
  const docs = await loadDocuments();
  const discovery = discoverFromDocuments(docs);
  assert.match(discovery.bazaar.index0Resource, /up\.railway\.app/);
  assert.equal(discovery.bazaar.index0IsCurrentExtract, false);
});

test("shuffled useful-jobs catalog still selects vendor-budget-impact by id", async () => {
  const docs = await loadDocuments();
  const shuffled = {
    ...docs,
    usefulJobsCatalog: {
      ...docs.usefulJobsCatalog,
      jobs: reverseCopy(docs.usefulJobsCatalog.jobs),
    },
  };
  const discovery = discoverFromDocuments(shuffled);
  assert.equal(discovery.jobs.selected.id, "vendor-budget-impact");
  assert.equal(discovery.jobs.index0Id, "repeat-job-record");
  assert.equal(discovery.jobs.selectedIsIndex0, false);
  assert.equal(selectById(shuffled.usefulJobsCatalog.jobs, "vendor-budget-impact").id, "vendor-budget-impact");
});

test("current OpenAPI extract price matches the live catalog pin used by PR52", () => {
  const root = findRepoRoot();
  const openapi = JSON.parse(
    readFileSync(join(root, "fixtures/presence/catalog/openapi.json"), "utf8"),
  );
  assert.equal(openapi.paths["/extract"].get.operationId, "extractUrl");
  assert.equal(openapi.paths["/extract"].get["x-payment-info"].price.amount, "0.005");
  assert.equal(
    openapi.paths["/commerce/seller-integrity-audit"].get["x-payment-info"].price.amount,
    "0.01",
  );
});
