import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runFixtureFile, runJourney } from "../lib/commission.mjs";
import { OWNED_DIR } from "../lib/pins.mjs";

function fixture(name) {
  return join(OWNED_DIR, "fixtures", name);
}

describe("seeded fail-closed cases", { timeout: 60_000 }, () => {
  it("rejects one runtime labelled independent", () => {
    const result = runFixtureFile(fixture("fail-one-runtime-independent.json"), { cwd: OWNED_DIR });
    assert.equal(result.ok, false);
    assert.equal(result.refused, true);
    assert.equal(result.code, "one-runtime-not-independent");
    assert.equal(result.independent, false);
    assert.equal(result.commissionedCustomer, false);
    assert.equal(result.purchaseAuthorized, false);
    assert.equal(result.sold, false);
  });

  it("rejects SAMPLE sold as commissioned customer work", () => {
    const result = runFixtureFile(fixture("fail-sample-commission.json"), { cwd: OWNED_DIR });
    assert.equal(result.ok, false);
    assert.equal(result.refused, true);
    assert.equal(result.code, "sample-not-commissioned-customer-work");
    assert.equal(result.sample, true);
    assert.equal(result.commissionedCustomer, false);
    assert.equal(result.purchaseAuthorized, false);
    assert.equal(result.sold, false);
    assert.ok(result.sampleReasons.length >= 1);
  });

  it("rejects changing extract $0.005", () => {
    const result = runFixtureFile(fixture("fail-extract-price.json"), { cwd: OWNED_DIR });
    assert.equal(result.ok, false);
    assert.equal(result.refused, true);
    assert.equal(result.code, "extract-price-immutable");
    assert.equal(result.purchaseAuthorized, false);
    assert.equal(result.liveExtract.usdc, "0.005");
    assert.equal(result.liveSellerIntegrityAudit.usdc, "0.01");
  });

  it("rejects inventing a paying maintainer", () => {
    const result = runFixtureFile(fixture("fail-paying-maintainer.json"), { cwd: OWNED_DIR });
    assert.equal(result.ok, false);
    assert.equal(result.refused, true);
    assert.equal(result.code, "invented-paying-maintainer");
    assert.equal(result.payingMaintainer, false);
    assert.equal(result.purchaseAuthorized, false);
  });

  it("rejects touching F08 wrappers", () => {
    const result = runFixtureFile(fixture("fail-touch-f08.json"), { cwd: OWNED_DIR });
    assert.equal(result.ok, false);
    assert.equal(result.refused, true);
    assert.equal(result.code, "f08-wrappers-out-of-scope");
    assert.equal(result.purchaseAuthorized, false);
  });

  it("rejects demo single-runtime that claims independent: true", () => {
    const result = runJourney({
      jobId: "listing-repair-packet",
      input: join(OWNED_DIR, "fixtures/listing/caller-ok.json"),
      demo: true,
      independent: true,
      runtimes: [{ label: "node22-local", kind: "local" }],
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "one-runtime-not-independent");
    assert.equal(result.independent, false);
    assert.equal(result.purchaseAuthorized, false);
    assert.equal(result.sold, false);
  });
});
