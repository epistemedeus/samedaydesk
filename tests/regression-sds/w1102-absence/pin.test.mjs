import assert from "node:assert/strict";
import test from "node:test";
import { loadPins, PIN_CITES } from "./lib/pin.mjs";
import { REPO_ROOT } from "./lib/root.mjs";

test("PIN_CITES cover observatory, pulse, owner-QA, pricing, discovery, and evidence records", () => {
  const ids = PIN_CITES.map((c) => c.id);
  for (const id of [
    "observatory-contract",
    "smithery-catalog",
    "x402stats-organic",
    "pulse-not-demand",
    "work-brief-not-demand",
    "issue-to-work-brief-spec",
    "machine-entry-discovery",
    "pricing-row-nonclaim",
    "evidence-records-prohibited",
    "portfolio-handoff-not-observed",
  ]) {
    assert.ok(ids.includes(id), id);
  }
  assert.ok(PIN_CITES.length >= 10);
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
  for (const code of ["demand", "organic_demand", "repeat_demand", "paid_demand_population"]) {
    assert.ok(withheld.withheldConclusions.includes(code), code);
  }

  const smithery = byId["import-smithery-descriptor"];
  assert.equal(smithery.ok, true, JSON.stringify(smithery));
  assert.ok(smithery.doesNotEstablish.includes("demand"));

  const x402 = byId["import-x402stats-descriptor"];
  assert.equal(x402.ok, true, JSON.stringify(x402));
  assert.ok(x402.doesNotEstablish.includes("organic demand proof"));

  const brief = byId["import-work-brief-issue-1"];
  assert.equal(brief.ok, true, JSON.stringify(brief));
  assert.equal(brief.claims.notDemand, true);
  assert.equal(brief.claims.ownerQaOnly, true);
  assert.equal(brief.issueNumber, 1);

  const handoff = byId["import-handoff-claims"];
  assert.equal(handoff.ok, true, JSON.stringify(handoff));
  assert.equal(handoff.demand, "not_observed");

  const catalog = byId["read-evidence-records-catalog"];
  assert.equal(catalog.ok, true, JSON.stringify(catalog));
  assert.ok(catalog.prohibitedInferences.includes("catalog_presence_is_demand"));
  assert.ok(catalog.prohibitedInferences.includes("analytics_count_is_independent_demand"));

  const failed = pins.rows.filter((row) => !row.ok);
  assert.deepEqual(failed, []);
});
