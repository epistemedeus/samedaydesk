import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import { packFromPaths } from "../lib/pack.mjs";
import { SOURCE_KINDS } from "../lib/pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const repo = join(here, "../../..");
const bin = join(root, "bin/dossier.mjs");

function load(rel) {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

function run(args) {
  return spawnSync(process.execPath, [bin, ...args], {
    encoding: "utf8",
    cwd: repo,
  });
}

describe("literal caller journey", () => {
  test("CLI pack lists three evidence items with distinct source kinds and sold false", () => {
    const r = run([
      "pack",
      "--wrapper-receipt",
      "tools/failed-delivery-dossier/fixtures/wrapper-receipt/rejected-sample-not-a-sale.json",
      "--checkout-intake",
      "tools/failed-delivery-dossier/fixtures/checkout-intake/fulfillment-pending-verify.json",
      "--extract-unpaid",
      "tools/failed-delivery-dossier/fixtures/extract-unpaid/agent402-stop.json",
    ]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const json = JSON.parse(r.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.sold, false);
    assert.equal(json.deliveryInHand, false);
    assert.equal(json.evidence.length, 3);
    assert.deepEqual(
      json.evidence.map((row) => row.sourceKind),
      SOURCE_KINDS,
    );
    assert.equal(new Set(json.evidence.map((row) => row.sourceKind)).size, 3);
    for (const row of json.evidence) {
      assert.equal(row.sold, false);
      assert.equal(row.deliveryInHand, false);
      assert.equal(typeof row.whyNotInHand, "string");
      assert.ok(row.whyNotInHand.length > 0);
    }
    assert.equal(json.honesty.refundAttempted, false);
    assert.equal(json.honesty.paymentRetried, false);
    assert.equal(json.honesty.paymentSignatureSent, false);
    assert.equal(json.honesty.stripeCalled, false);
    const extract = json.evidence.find((row) => row.sourceKind === "extract-unpaid");
    assert.equal(extract.observationStatus, "fixture");
    assert.equal(extract.observedHttpStatus, null);
    assert.equal(extract.outcomeKind, "runtime-stop");
    const live = json.honesty.checks.find((row) => row.id === "live-extract-http");
    assert.equal(live.status, "unrun");
    assert.equal(live.pass, false);
    assert.equal(json.honesty.readyForRelease, false);
  });

  test("library packFromPaths matches the CLI journey", async () => {
    const json = await packFromPaths(
      {
        "wrapper-receipt": join(root, "fixtures/wrapper-receipt/rejected-sample-not-a-sale.json"),
        "checkout-intake": join(root, "fixtures/checkout-intake/fulfillment-pending-verify.json"),
        "extract-unpaid": join(root, "fixtures/extract-unpaid/agent402-stop.json"),
      },
      { cwd: root },
    );
    assert.equal(json.ok, true);
    assert.equal(json.sold, false);
    assert.deepEqual(json.sourceKinds, SOURCE_KINDS);
  });

  test("unfunded F08 receipt packs as wrapper-receipt with sold false", async () => {
    const json = await packFromPaths(
      { "wrapper-receipt": join(root, "fixtures/wrapper-receipt/unfunded-vendor-budget-impact.json") },
      { cwd: root },
    );
    assert.equal(json.ok, true);
    assert.equal(json.evidence[0].sourceKind, "wrapper-receipt");
    assert.equal(json.evidence[0].fundingState, "unfunded");
    assert.equal(json.evidence[0].sold, false);
  });

  test("copied stop.json still matches the published buyer-runtime fixture", () => {
    const copied = load("fixtures/extract-unpaid/agent402-stop.json");
    const published = JSON.parse(
      readFileSync(join(repo, "fixtures/buyer-runtimes/agent402/states/stop.json"), "utf8"),
    );
    assert.deepEqual(copied, published);
    assert.equal(copied.state, "stop");
    assert.match(copied.recorded, /no PAYMENT-SIGNATURE is sent/i);
  });
});
