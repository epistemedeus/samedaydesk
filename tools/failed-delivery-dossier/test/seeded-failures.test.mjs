import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import { packDossier } from "../lib/pack.mjs";
import { ERROR_CODES } from "../lib/pins.mjs";

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

describe("seeded fail-closed cases", () => {
  test("SAMPLE receipt labelled delivered is refused", () => {
    const result = packDossier({
      items: [
        {
          sourceKind: "wrapper-receipt",
          body: load("fixtures/seeded-failures/sample-labelled-delivered.json"),
        },
      ],
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, ERROR_CODES.SAMPLE_LABELLED_DELIVERED);
    assert.equal(result.sold, false);
    assert.equal(result.deliveryInHand, false);
  });

  test("mixing buyerClass into a revenue total is refused", () => {
    const result = packDossier(load("fixtures/seeded-failures/buyerclass-revenue-total.json"));
    assert.equal(result.ok, false);
    assert.equal(result.code, ERROR_CODES.BUYERCLASS_REVENUE_MIX);
    assert.equal(result.sold, false);
  });

  test("CLI --refund exits 2 and does not refund", () => {
    const r = run(["--refund"]);
    assert.equal(r.status, 2, r.stderr + r.stdout);
    const json = JSON.parse(r.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.code, ERROR_CODES.REFUND_REFUSED);
    assert.equal(json.refundAttempted, true);
    assert.equal(json.sold, false);
    assert.equal(json.honesty.stripeCalled, false);
  });

  test("CLI pack --refund still exits 2", () => {
    const r = run([
      "pack",
      "--refund",
      "--wrapper-receipt",
      "tools/failed-delivery-dossier/fixtures/wrapper-receipt/rejected-sample-not-a-sale.json",
    ]);
    assert.equal(r.status, 2, r.stderr + r.stdout);
    const json = JSON.parse(r.stdout);
    assert.equal(json.code, ERROR_CODES.REFUND_REFUSED);
  });

  test("retry payment and PAYMENT-SIGNATURE flags exit 2", () => {
    const retry = run(["--retry-payment"]);
    assert.equal(retry.status, 2);
    assert.equal(JSON.parse(retry.stdout).code, ERROR_CODES.RETRY_PAYMENT_REFUSED);
    const sig = run(["--send-payment-signature"]);
    assert.equal(sig.status, 2);
    assert.equal(JSON.parse(sig.stdout).code, ERROR_CODES.PAYMENT_SIGNATURE_REFUSED);
  });

  test("CLI --revenue-total mixing buyerClass exits 2", () => {
    const r = run([
      "pack",
      "--revenue-total",
      "tools/failed-delivery-dossier/fixtures/seeded-failures/buyerclass-revenue-total.json",
    ]);
    assert.equal(r.status, 2, r.stderr + r.stdout);
    const json = JSON.parse(r.stdout);
    assert.equal(json.code, ERROR_CODES.BUYERCLASS_REVENUE_MIX);
    assert.equal(json.sold, false);
  });

  test("integer termsVersion is refused (I01 hash contract)", () => {
    const body = load("fixtures/wrapper-receipt/rejected-sample-not-a-sale.json");
    body.receipt.termsVersion = 1;
    const result = packDossier({ items: [{ sourceKind: "wrapper-receipt", body }] });
    assert.equal(result.ok, false);
    assert.equal(result.code, ERROR_CODES.INTEGER_TERMS_VERSION);
  });

  test("CLI pack of official-source fixture exits 2", () => {
    const r = run([
      "pack",
      "--extract-unpaid",
      "tools/failed-delivery-dossier/fixtures/seeded-failures/official-source-without-evidence.json",
    ]);
    assert.equal(r.status, 2, r.stderr + r.stdout);
    const json = JSON.parse(r.stdout);
    assert.equal(json.code, ERROR_CODES.OFFICIAL_SOURCE_WITHOUT_EVIDENCE);
    assert.equal(json.sold, false);
  });
});
