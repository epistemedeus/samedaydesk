import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runManagedListingRepair } from "../lib/repair.mjs";
import { isNoopPacket } from "../lib/guards.mjs";
import { OK_FIXTURE, REPO, TOOL_DIR, tmpOut } from "./helpers.mjs";

describe("seeded fail-closed refusals", () => {
  it("rejects auto-publish", () => {
    const result = runManagedListingRepair({
      fixturePath: join(TOOL_DIR, "fixtures/invalid/auto-publish.json"),
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "auto_publish_rejected");
    assert.equal(result.publishAuthorized, false);
    assert.equal(result.purchaseAuthorized, false);
    assert.equal(result.sold, false);
  });

  it("rejects --publish / --auto-publish on the ok fixture", () => {
    const result = runManagedListingRepair({
      fixturePath: OK_FIXTURE,
      publish: true,
      autoPublish: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "auto_publish_rejected");
    assert.equal(result.publishAuthorized, false);
  });

  it("rejects SAMPLE as accepted correction", () => {
    const result = runManagedListingRepair({
      fixturePath: join(TOOL_DIR, "fixtures/invalid/sample-as-accepted.json"),
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "sample_accepted_correction_rejected");
    assert.equal(result.accepted_correction, false);
    assert.equal(result.sample, true);
    assert.equal(result.purchaseAuthorized, false);
    assert.equal(result.sold, false);
  });

  it("rejects --example becoming accepted_correction", () => {
    const result = runManagedListingRepair({
      fixturePath: join(TOOL_DIR, "fixtures/invalid/sample-as-accepted.json"),
      example: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "sample_accepted_correction_rejected");
    assert.equal(result.accepted_correction, false);
  });

  it("rejects a no-op sold as a fix", () => {
    const result = runManagedListingRepair({
      fixturePath: join(TOOL_DIR, "fixtures/invalid/noop.json"),
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "noop_sold_as_fix_rejected");
    assert.equal(isNoopPacket({ changes: [{ field: "x", from: 1, to: 1 }] }), true);
  });

  it("rejects editing F08 paid wrappers", () => {
    const dest = join(REPO, "server/paid-useful-jobs/hijack.json");
    const result = runManagedListingRepair({
      fixturePath: OK_FIXTURE,
      outPath: dest,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "f08_edit_rejected");
    assert.equal(existsSync(dest), false);
    assert.equal(result.purchaseAuthorized, false);
  });

  it("rejects --write-f08 even without an out path", () => {
    const result = runManagedListingRepair({
      fixturePath: OK_FIXTURE,
      editF08: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "f08_edit_rejected");
  });

  it("rejects writing onto a live price / catalog pin", () => {
    const dest = join(REPO, "fixtures/buyer-runtimes/catalog.json");
    const result = runManagedListingRepair({
      fixturePath: OK_FIXTURE,
      outPath: dest,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "live_price_mutation_rejected");
  });

  it("rejects Bazaar / public catalog publication", () => {
    const dest = join(REPO, "client/public/discovery/mlr-publish.json");
    const result = runManagedListingRepair({
      fixturePath: OK_FIXTURE,
      outPath: dest,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "bazaar_publish_rejected");
    assert.equal(existsSync(dest), false);
  });
});
