import assert from "node:assert/strict";
import test from "node:test";
import { loadPins, PIN_CITES } from "./lib/pin.mjs";
import { REPO_ROOT, WRITE_BOUNDARY } from "./lib/root.mjs";

test("PIN_CITES cover x402scan, moltjobs composition, additivity, no-change, presence", () => {
  const ids = PIN_CITES.map((c) => c.id);
  for (const id of [
    "observatory-contract-zeros",
    "moltjobs-composition",
    "moltjobs-stats-nonclaim",
    "market-stats-missing-not-zero",
    "x402stats-series-buyers",
    "scoped-no-change-nonclaim",
    "pricing-row-nonclaim",
    "presence-snapshot-nonclaim",
    "buyer-setup-not-demand",
  ]) {
    assert.ok(ids.includes(id), id);
  }
  assert.ok(PIN_CITES.length >= 8);
  assert.equal(WRITE_BOUNDARY, "tests/regression-sds/w822-absence/**");
});

test("cold loadPins reads real SDS modules and withholds demand", async () => {
  const pins = await loadPins();
  assert.equal(pins.ok, true, JSON.stringify(pins.error, null, 2));
  assert.ok(
    pins.repoRoot.endsWith("repo") ||
      pins.repoRoot.includes("samedaydesk") ||
      REPO_ROOT === pins.repoRoot,
  );
  const byId = Object.fromEntries(pins.rows.map((row) => [row.id, row]));

  const withheld = byId["import-observatory-withheld"];
  assert.equal(withheld.ok, true, JSON.stringify(withheld));
  for (const code of ["demand", "conversion_funnel", "cross_source_total", "paid_demand_population"]) {
    assert.ok(withheld.withheldConclusions.includes(code), code);
  }

  const scan = byId["import-x402scan-documented-unavailable"];
  assert.equal(scan.ok, true, JSON.stringify(scan));
  assert.equal(scan.sourceId, "x402scan");
  assert.equal(scan.called, false);
  assert.equal(scan.availability, "unavailable");

  const moltjobs = byId["import-moltjobs-descriptor"];
  assert.equal(moltjobs.ok, true, JSON.stringify(moltjobs));
  assert.ok(moltjobs.doesNotEstablish.includes("a registration-to-paid conversion funnel"));

  const refused = byId["import-moltjobs-paid-activity-refused-ratio"];
  assert.equal(refused.ok, true, JSON.stringify(refused));
  assert.equal(refused.available, false);
  assert.ok(refused.refusedRatioKeys.includes("marketplaceJobs_over_totalJobs_as_conversion"));

  const catalog = byId["import-registry-catalog-x402scan"];
  assert.equal(catalog.ok, true, JSON.stringify(catalog));
  assert.equal(catalog.additivity, "not_additive");

  const pricing = byId["import-pricing-empty-rows-refuse"];
  assert.equal(pricing.ok, true, JSON.stringify(pricing));
  assert.equal(pricing.emptyCode, "empty-pricing-rows");
  assert.equal(pricing.paidValueClaim, false);

  const failed = pins.rows.filter((row) => !row.ok);
  assert.deepEqual(failed, []);
});
