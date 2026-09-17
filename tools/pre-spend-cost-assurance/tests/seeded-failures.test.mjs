import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import { assurePlanFile } from "../src/assure.mjs";
import { ERROR_CODES } from "../src/pins.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function rejectFile(name) {
  return assurePlanFile(path.join(ROOT, "fixtures/reject", name));
}

describe("seeded failures", () => {
  test("defaulting to a purchase", async () => {
    const result = await rejectFile("default-purchase.json");
    assert.equal(result.ok, false);
    assert.equal(result.code, ERROR_CODES.DEFAULT_PURCHASE);
    assert.equal(result.purchaseAuthorized, false);
    assert.equal(result.settleCalled, false);
  });

  test("wrong units (5000 as dollars)", async () => {
    const result = await rejectFile("wrong-units-5000-dollars.json");
    assert.equal(result.ok, false);
    assert.equal(result.code, ERROR_CODES.WRONG_UNITS);
    assert.match(result.message, /5000/);
  });

  test("treating 402 as success", async () => {
    const result = await rejectFile("http-402-as-success.json");
    assert.equal(result.ok, false);
    assert.equal(result.code, ERROR_CODES.HTTP_402_AS_SUCCESS);
  });

  test("SAMPLE as paid assurance", async () => {
    const result = await rejectFile("sample-as-paid-assurance.json");
    assert.equal(result.ok, false);
    assert.equal(result.code, ERROR_CODES.SAMPLE_AS_PAID_ASSURANCE);
  });

  test("editing live prices", async () => {
    const result = await rejectFile("edit-live-prices.json");
    assert.equal(result.ok, false);
    assert.equal(result.code, ERROR_CODES.EDIT_LIVE_PRICES);
  });

  test("plan that would POST payment", async () => {
    const result = await rejectFile("post-payment.json");
    assert.equal(result.ok, false);
    assert.equal(result.code, ERROR_CODES.POST_PAYMENT);
  });

  test("invalid delivery is not a reason to spend", async () => {
    const result = await rejectFile("invalid-delivery-retry-spend.json");
    assert.equal(result.ok, false);
    assert.equal(result.code, ERROR_CODES.INVALID_DELIVERY_SPEND);
  });
});
