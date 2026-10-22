import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runManagedListingRepair } from "../lib/repair.mjs";
import { isNoopPacket } from "../lib/guards.mjs";
import { OK_FIXTURE, REPO, TOOL_DIR, runCli } from "./helpers.mjs";

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

  it("rejects wrapping a 1.4.7 unsupported-provider engine refusal as a successful repair", () => {
    const spawned = runCli(
      ["journey", "--fixture", "fixtures/invalid/unsupported-provider.json"],
      { cwd: TOOL_DIR },
    );
    assert.equal(spawned.status, 1, spawned.stdout);
    const body = JSON.parse(spawned.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.refused, true);
    assert.equal(body.code, "engine_refused");
    assert.equal(body.publishAuthorized, false);
    assert.equal(body.accepted_correction, false);
    assert.equal(body.purchaseAuthorized, false);
    assert.equal(body.sold, false);
    assert.equal(body.detail.engineStatus, "refused");
    assert.equal(body.detail.kitVersion, "1.4.7");
  });

  it("rejects packet.publishAuthorized without --publish", () => {
    const spawned = runCli(
      ["journey", "--fixture", "fixtures/invalid/packet-publish-authorized.json"],
      { cwd: TOOL_DIR },
    );
    assert.equal(spawned.status, 1, spawned.stdout);
    const body = JSON.parse(spawned.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.code, "auto_publish_rejected");
    assert.equal(body.publishAuthorized, false);
    assert.equal(body.sold, false);
  });

  it("rejects an operator packet field that the engine did not diagnose", () => {
    const spawned = runCli(
      ["journey", "--fixture", "fixtures/invalid/packet-engine-mismatch.json"],
      { cwd: TOOL_DIR },
    );
    assert.equal(spawned.status, 1, spawned.stdout);
    const body = JSON.parse(spawned.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.code, "suggestion_not_grounded");
    assert.equal(body.publishAuthorized, false);
    assert.equal(body.accepted_correction, false);
    assert.equal(body.sold, false);
    assert.deepEqual(body.detail.fields, ["priceUsd"]);
  });

  it("rejects camelCase packet.acceptedCorrection", () => {
    const spawned = runCli(
      ["journey", "--fixture", "fixtures/invalid/packet-accepted-correction-camel.json"],
      { cwd: TOOL_DIR },
    );
    assert.equal(spawned.status, 1, spawned.stdout);
    const body = JSON.parse(spawned.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.code, "accepted_correction_rejected");
    assert.equal(body.accepted_correction, false);
  });

  it("rejects --out into a sibling tools directory", () => {
    const dest = join(REPO, "tools/offer-routing/mlr-hijack.json");
    const result = runManagedListingRepair({
      fixturePath: OK_FIXTURE,
      outPath: dest,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "write_boundary_rejected");
    assert.equal(existsSync(dest), false);
  });

  it("rejects a missing fixture file as JSON, not an ENOENT crash", () => {
    const spawned = runCli(
      ["journey", "--fixture", "/no/such/mlr.json"],
      { cwd: TOOL_DIR },
    );
    assert.equal(spawned.status, 1, spawned.stderr);
    const body = JSON.parse(spawned.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.code, "fixture_not_found");
    assert.equal(body.publishAuthorized, false);
  });

  it("does not leak sds-mlr work directories after a journey", () => {
    const before = new Set(
      readdirSync(tmpdir()).filter((name) => name.startsWith("sds-mlr-") && !name.startsWith("sds-mlr-kit-")),
    );
    const result = runManagedListingRepair({ fixturePath: OK_FIXTURE });
    assert.equal(result.ok, true);
    const leaked = readdirSync(tmpdir()).filter(
      (name) => name.startsWith("sds-mlr-") && !name.startsWith("sds-mlr-kit-") && !before.has(name),
    );
    assert.deepEqual(leaked, []);
  });
});
