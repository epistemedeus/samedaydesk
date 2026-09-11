import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { OFFER_ID, OFFER_SCHEMA } from "../lib/schema.mjs";
import { REPO_ROOT } from "../lib/paths.mjs";
import { createOfferServer, listenOfferServer } from "../lib/http.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const describeCli = join(here, "../bin/describe.mjs");
const verifyCli = join(here, "../bin/verify.mjs");

function run(file, args = [], { timeout = 180_000 } = {}) {
  return spawnSync(process.execPath, [file, ...args], {
    encoding: "utf8",
    cwd: REPO_ROOT,
    timeout,
    maxBuffer: 8 * 1024 * 1024,
  });
}

describe("m12 CLI describe and verify", { timeout: 180_000 }, () => {
  it("describe CLI emits the selected offer from SDS52 catalog and pins", () => {
    const r = run(describeCli);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const body = JSON.parse(r.stdout);
    assert.equal(body.schema, OFFER_SCHEMA);
    assert.equal(body.offerId, OFFER_ID);
    assert.equal(body.selectionSource, "sds52-catalog");
    assert.equal(body.firstJourneyJob, "vendor-budget-impact");
    assert.deepEqual(body.jobIds, [
      "api-upgrade-brief",
      "vendor-budget-impact",
      "feed-agenda",
      "evidence-ci-annotation",
      "listing-repair-packet",
      "repeat-job-record",
    ]);
    assert.equal(body.jobsById["vendor-budget-impact"].outputs[0], "budget-impact.json");
    assert.equal(body.prices.adjacentLive[0].productId, "extract");
    assert.equal(body.prices.adjacentLive[0].amountUsdc, "0.005");
    assert.equal(body.prices.adjacentLive[0].belongsToSelectedOffer, false);
    assert.equal(body.prices.adjacentLive[1].amountUsdc, "0.01");
    const fixture = body.prices.selected.find((p) => p.kind === "fixture-labelled");
    assert.equal(fixture.amountUsdc, "0.02");
    assert.equal(fixture.publishedToLiveCatalog, false);
    assert.equal(body.prices.selected.find((p) => p.kind === "proposed-cost-backed").status, "unbound");
    assert.equal(body.bindings.m01.status, "unbound");
    assert.equal(body.bindings.d26.status, "unbound");
    assert.equal(body.runtime.hasCreateExecutor, false);
    assert.notEqual(body.identities.catalogSha256, body.identities.archiveSha256);
  });

  it("verify CLI against generated description exits 0 with runtime findings", () => {
    const dir = mkdtempSync(join(tmpdir(), "m12-cli-"));
    const descPath = join(dir, "offer.json");
    const d = run(describeCli, ["--out", descPath]);
    assert.equal(d.status, 0, d.stderr + d.stdout);
    const v = run(verifyCli, ["--description", descPath]);
    assert.equal(v.status, 0, v.stderr + v.stdout);
    const report = JSON.parse(v.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.findings.some((f) => f.ok === false), false);
    const ids = report.findings.map((f) => f.id);
    assert.equal(ids.includes("cli-positive-journey"), true);
    assert.equal(ids.includes("valid-no-change-not-crash"), true);
    assert.equal(ids.includes("missing-input-is-refusal"), true);
    assert.equal(ids.includes("advertised-limit-enforced"), true);
    assert.equal(ids.includes("sample-not-a-sale"), true);
    assert.equal(report.tested.wrapperContract, "sds52-runPaidOffer");
    assert.equal(report.tested.hasCreateExecutor, false);
  });

  it("loopback HTTP GET /offer matches describe and /health names the schema", async () => {
    const { server, offer } = await createOfferServer();
    const addr = await listenOfferServer(server);
    try {
      const offerRes = await fetch(`http://127.0.0.1:${addr.port}/offer`);
      assert.equal(offerRes.status, 200);
      const body = await offerRes.json();
      assert.equal(body.offerId, offer.offerId);
      assert.equal(body.schema, OFFER_SCHEMA);
      assert.equal(body.jobIds.length, 6);
      const health = await fetch(`http://127.0.0.1:${addr.port}/health`);
      const healthBody = await health.json();
      assert.equal(healthBody.ok, true);
      assert.equal(healthBody.schema, OFFER_SCHEMA);
      assert.equal(healthBody.liveSettlement, "out-of-scope");
    } finally {
      server.close();
    }
  });
});
