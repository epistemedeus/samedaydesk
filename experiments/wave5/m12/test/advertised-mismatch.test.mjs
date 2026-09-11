import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { describeSelectedOffer } from "../lib/describe.mjs";
import { loadSources } from "../lib/sources.mjs";
import { verifyOfferDescription } from "../lib/verify.mjs";
import { REPO_ROOT } from "../lib/paths.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const verifyCli = join(here, "../bin/verify.mjs");

function failId(report, id) {
  const row = report.findings.find((f) => f.id === id);
  assert.ok(row, `missing finding ${id}`);
  assert.equal(row.ok, false, `${id} should fail`);
}

describe("advertised claims that do not match runtime", { timeout: 180_000 }, () => {
  it("refuses extract price impersonated by the wrapper fixture amount", async () => {
    const sources = await loadSources();
    const offer = describeSelectedOffer(sources);
    offer.prices.adjacentLive.find((p) => p.productId === "extract").amountUsdc = "0.02";
    const report = await verifyOfferDescription(offer, sources, { runRuntime: false });
    assert.equal(report.ok, false);
    failId(report, "live-extract-price");
  });

  it("refuses advertising the fixture amount as a live catalog product", async () => {
    const sources = await loadSources();
    const offer = describeSelectedOffer(sources);
    const fixture = offer.prices.selected.find((p) => p.kind === "fixture-labelled");
    fixture.live = true;
    fixture.publishedToLiveCatalog = true;
    const report = await verifyOfferDescription(offer, sources, { runRuntime: false });
    assert.equal(report.ok, false);
    failId(report, "fixture-not-live");
  });

  it("refuses catalog array index as job identity", async () => {
    const sources = await loadSources();
    const offer = describeSelectedOffer(sources);
    offer.jobIds = ["0", "1"];
    const report = await verifyOfferDescription(offer, sources, { runRuntime: false });
    assert.equal(report.ok, false);
    failId(report, "job-ids");
  });

  it("refuses an unknown advertised job id", async () => {
    const sources = await loadSources();
    const offer = describeSelectedOffer(sources);
    offer.jobIds = [...offer.jobIds, "not-a-real-job"];
    const report = await verifyOfferDescription(offer, sources, { runRuntime: false });
    assert.equal(report.ok, false);
    failId(report, "job-ids");
  });

  it("refuses forcing catalog digest equal to the engine archive identity", async () => {
    const sources = await loadSources();
    const offer = describeSelectedOffer(sources);
    offer.identities.catalogSha256 = offer.identities.archiveSha256;
    offer.identities.forcedEqual = true;
    const report = await verifyOfferDescription(offer, sources, { runRuntime: false });
    assert.equal(report.ok, false);
    failId(report, "unlike-identities");
  });

  it("refuses a measured proposed price while D26 is unbound", async () => {
    const sources = await loadSources();
    const offer = describeSelectedOffer(sources);
    const proposed = offer.prices.selected.find((p) => p.kind === "proposed-cost-backed");
    proposed.status = "measured";
    proposed.amountUsdc = "0.02";
    proposed.nonLossmaking = true;
    const report = await verifyOfferDescription(offer, sources, { runRuntime: false });
    assert.equal(report.ok, false);
    failId(report, "cost-backing");
  });

  it("verify CLI exits 2 on a mutated description file", async () => {
    const sources = await loadSources();
    const offer = describeSelectedOffer(sources);
    offer.prices.adjacentLive.find((p) => p.productId === "seller-integrity-audit").amountUsdc = "399";
    const dir = mkdtempSync(join(tmpdir(), "m12-mut-"));
    const path = join(dir, "bad.json");
    writeFileSync(path, `${JSON.stringify(offer, null, 2)}\n`);
    const r = spawnSync(process.execPath, [verifyCli, "--description", path], {
      encoding: "utf8",
      cwd: REPO_ROOT,
      timeout: 180_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    assert.equal(r.status, 2, r.stderr + r.stdout);
    const report = JSON.parse(r.stdout);
    assert.equal(report.ok, false);
    failId(report, "live-sia-price");
  });
});
