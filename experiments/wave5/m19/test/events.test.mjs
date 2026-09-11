import assert from "node:assert/strict";
import test from "node:test";
import { collectEvents, selectContribution } from "../lib/events.mjs";
import { missingDependencies, SDS52 } from "../lib/pins.mjs";

test("required current-source files exist; missing is not a skip", () => {
  assert.deepEqual(missingDependencies(), []);
});

test("current events keep unlike presence and consumer snapshots", async () => {
  const events = await collectEvents();
  assert.equal(events.testedSha, SDS52);
  assert.equal(events.snapshots["presence-fixture-2026-09-03"].listedMcpVersion, "1.23.36");
  assert.equal(events.snapshots["presence-fixture-2026-09-03"].originCatalogVersion, "1.23.40");
  assert.equal(events.snapshots["mcp-registry-consumer-2026-09-09"].pinnedLatestVersion, "1.23.45");
  assert.equal(events.unlike.presenceListedVsOrigin, true);
  assert.equal(events.unlike.presenceListedVsConsumerLatest, true);
  assert.equal(events.unlike.originVsConsumerLatest, true);
  assert.equal(events.unlike.usefulJobsVsMcpLatest, true);
  assert.equal(events.unlike.listingBodiesEqual, false);
  assert.notEqual(
    events.snapshots["presence-fixture-2026-09-03"].listingSha256,
    events.snapshots["mcp-registry-consumer-2026-09-09"].versionsLatestSha256,
  );
  assert.equal(events.consumer.unfilteredFirstLooksCurrent, false);
  assert.equal(events.consumer.unfilteredFirstVersion, "1.0.0");
  assert.equal(events.consumer.versionsLatestVersion, "1.23.45");
  assert.equal(events.offer.purchaseAuthority, false);
  assert.ok(events.offer.jobs.includes("vendor-budget-impact"));

  const surfaces = Object.fromEntries(events.surfaces.map((s) => [s.surface, s]));
  assert.equal(surfaces["mcp-registry"].classification, "stale");
  assert.equal(surfaces["mcp-registry"].protectedApplyAllowed, true);
  assert.equal(surfaces.bazaar.protectedApplyAllowed, false);
  assert.equal(surfaces.mpp.classification, "missing");
});

test("selects mcp-registry version-only from the presence snapshot", async () => {
  const events = await collectEvents();
  const contribution = await selectContribution(events);
  assert.equal(contribution.id, "mcp-registry-version-only");
  assert.equal(contribution.request.method, "POST");
  assert.equal(contribution.request.url, "https://registry.modelcontextprotocol.io/v0.1/publish");
  assert.equal(contribution.request.body.version, "1.23.40");
  assert.equal(contribution.request.body.name, "io.github.epistemedeus/x402-data-gateway");
  assert.equal(contribution.listedVersion, "1.23.36");
  assert.equal(contribution.consumerLatestVersion, "1.23.45");
  assert.equal(contribution.unlikeConsumerLatest, true);
  assert.equal(contribution.livePublishAuthorized, false);
  assert.equal(contribution.payment.sold, false);
});
