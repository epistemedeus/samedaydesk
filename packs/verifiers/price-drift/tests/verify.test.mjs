import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ERROR_CODES } from "../src/constants.mjs";
import { verifyDocuments } from "../src/verify.mjs";

const pack = join(dirname(fileURLToPath(import.meta.url)), "..");

function load(rel) {
  return JSON.parse(readFileSync(join(pack, rel), "utf8"));
}

test("matching observation passes and does not rewrite prices", () => {
  const result = verifyDocuments({
    pin: load("fixtures/pin.json"),
    observation: load("fixtures/ok-observation.json"),
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "match");
  assert.equal(result.purchaseAuthority, false);
  assert.equal(result.liveSdsPricesUnchanged, true);
  assert.equal(result.driftDetected, false);
  assert.equal(result.honesty.neoTouched, false);
});

test("x402 items[] catalog shape matches the pin", () => {
  const result = verifyDocuments({
    pin: load("fixtures/pin.json"),
    observation: load("fixtures/ok-x402-items.json"),
  });
  assert.equal(result.ok, true);
  assert.equal(result.liveSdsPricesUnchanged, true);
});

test("extract 0.005 -> 0.05 is amount drift", () => {
  const result = verifyDocuments({
    pin: load("fixtures/pin.json"),
    observation: load("fixtures/reject/extract-amount-drift.json"),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.AMOUNT_DRIFT);
  assert.equal(result.driftDetected, true);
  assert.equal(result.liveSdsPricesUnchanged, true);
  assert.match(result.message, /0\.05/);
});
