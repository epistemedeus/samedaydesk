import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { describeSelectedOffer } from "../lib/describe.mjs";
import { loadSources } from "../lib/sources.mjs";
import { verifyOfferDescription } from "../lib/verify.mjs";
import { M01_SCHEMA, D26_SCHEMA } from "../lib/schema.mjs";

describe("optional sibling bindings", { timeout: 60_000 }, () => {
  it("M01 selected-offer.json narrows job ids by stable identity", async () => {
    const dir = mkdtempSync(join(tmpdir(), "m12-m01-"));
    const path = join(dir, "selected-offer.json");
    writeFileSync(
      path,
      `${JSON.stringify({
        schema: M01_SCHEMA,
        offerId: "sdd.useful-jobs.supplied-input",
        jobIds: ["vendor-budget-impact", "repeat-job-record"],
      })}\n`,
    );
    const sources = await loadSources({ m01Path: path });
    const offer = describeSelectedOffer(sources);
    assert.equal(offer.selectionSource, "m01");
    assert.deepEqual(offer.jobIds, ["vendor-budget-impact", "repeat-job-record"]);
    assert.equal(offer.jobsById["api-upgrade-brief"], undefined);
    assert.equal(offer.jobsById["vendor-budget-impact"].id, "vendor-budget-impact");
    assert.equal(offer.bindings.m01.status, "bound");
  });

  it("M01 job that is not in the SDS52 catalog fails verify", async () => {
    const dir = mkdtempSync(join(tmpdir(), "m12-m01-bad-"));
    const path = join(dir, "selected-offer.json");
    writeFileSync(
      path,
      `${JSON.stringify({
        schema: M01_SCHEMA,
        offerId: "sdd.useful-jobs.supplied-input",
        jobIds: ["vendor-budget-impact", "invented-engine"],
      })}\n`,
    );
    const sources = await loadSources({ m01Path: path });
    const offer = describeSelectedOffer(sources);
    const report = await verifyOfferDescription(offer, sources, { runRuntime: false });
    assert.equal(report.ok, false);
    const row = report.findings.find((f) => f.id === "job-ids");
    assert.equal(row.ok, false);
    assert.deepEqual(row.unknown, ["invented-engine"]);
  });

  it("D26 measured floor binds a proposed price only when non-lossmaking and unpublished", async () => {
    const dir = mkdtempSync(join(tmpdir(), "m12-d26-"));
    const path = join(dir, "cost-floor.json");
    writeFileSync(
      path,
      `${JSON.stringify({
        schema: D26_SCHEMA,
        offerId: "sdd.useful-jobs.supplied-input",
        variableCostUsdc: "0.001",
        paymentFeesUsdc: "0.001",
        proposedPriceUsdc: "0.01",
        nonLossmaking: true,
      })}\n`,
    );
    const sources = await loadSources({ d26Path: path });
    const offer = describeSelectedOffer(sources);
    assert.equal(offer.prices.selected.find((p) => p.kind === "proposed-cost-backed").status, "measured");
    assert.equal(offer.prices.selected.find((p) => p.kind === "proposed-cost-backed").amountUsdc, "0.01");
    const report = await verifyOfferDescription(offer, sources, { runRuntime: false });
    assert.equal(report.findings.find((f) => f.id === "cost-backing").ok, true);
    const losing = structuredClone(offer);
    losing.prices.selected.find((p) => p.kind === "proposed-cost-backed").amountUsdc = "0.0005";
    const bad = await verifyOfferDescription(losing, sources, { runRuntime: false });
    assert.equal(bad.findings.find((f) => f.id === "cost-backing").ok, false);
  });
});
