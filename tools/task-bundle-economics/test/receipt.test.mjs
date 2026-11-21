import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { receiptFor } from "../src/evaluate.mjs";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");

function load(name) {
  return JSON.parse(readFileSync(join(fixtures, name), "utf8"));
}

test("receipt preserves reservation identity and names the fee rail", () => {
  const receipt = receiptFor(load("reservation-preserved.json"));
  assert.equal(receipt.ok, true);
  assert.equal(receipt.schema, "pilot.task-bundle-economics.receipt.v1");
  assert.equal(receipt.kind, "requester_receipt");
  assert.equal(receipt.signer, false);
  assert.equal(receipt.paymentCommand, false);
  assert.equal(receipt.fundedCommission, false);
  assert.deepEqual(receipt.reservations, ["rsv_keep_exact_identity"]);
  assert.equal(receipt.tasks[0].reservationId, "rsv_keep_exact_identity");
  assert.equal(receipt.rails.feeBps, 500);
  assert.equal(receipt.rails.feeModule, "vendor/hosted-wallet-market/src/fee.mjs");
  assert.equal(receipt.rails.sourcePin, "9f6c0c4e396dd7677f334400eed93e3445fad600");
  assert.equal(receipt.tasks[0].unknown.task.priorReviewNote, "keep-this-task-field");
  assert.equal(receipt.preservedUnknown.bundle.customerTag, "keep-this-bundle-field");
});

test("receipt discloses floor delta for the synthetic remainder case", () => {
  const receipt = receiptFor(load("floor-delta.json"));
  assert.equal(receipt.feeDisclosure.bundledFeeDiffersFromSeparateSum, true);
  assert.equal(receipt.feeDisclosure.cumulativeFloorDelta, "1");
  assert.equal(receipt.takeRateInvented, undefined);
  assert.equal(receipt.feeDisclosure.takeRateInvented, false);
});
