import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { LIVE_PRICES } from "../src/constants.ts";
import { assertLivePricesUnchanged } from "../src/guardrails.ts";
import {
  F18_LIVE_JOURNEY_COUNTS,
  LIVE_UNPAID_402,
  UNPAID_402_IS_NOT_SUCCESS,
  assert402IsNotSuccess,
  classifyProbe,
  interpretUnpaid402,
  isLiveUnpaid402Pin,
} from "../src/f18-402.ts";

const packRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const unpaidHeld = {
  outcome: "unpaid-held",
  success: false,
  paid: false,
  settled: false,
};

test("extract 402 / 5000 is unpaid-held not success", () => {
  const row = {
    status: 402,
    amountAtomic: LIVE_PRICES.extract.amountAtomic,
    route: "extract",
  };
  assert.equal(LIVE_UNPAID_402.extract.amountAtomic, "5000");
  assert.equal(LIVE_UNPAID_402.extract.amountAtomic, LIVE_PRICES.extract.amountAtomic);
  assert.equal(isLiveUnpaid402Pin(row), true);
  assert.deepEqual(interpretUnpaid402(row), unpaidHeld);
  assert.deepEqual(classifyProbe(row), unpaidHeld);
  assert.equal(classifyProbe(row).outcome, "unpaid-held");
  assert.equal(classifyProbe(row).success, false);
  assert.equal(classifyProbe({ ...row, amountAtomic: 5000 }).success, false);
  assert.notEqual(classifyProbe(row).outcome, "success");
});

test("seller-integrity-audit 402 / 10000 is unpaid-held not success", () => {
  const row = {
    status: 402,
    amountAtomic: LIVE_PRICES["seller-integrity-audit"].amountAtomic,
    route: "seller-integrity-audit",
  };
  assert.equal(LIVE_UNPAID_402["seller-integrity-audit"].amountAtomic, "10000");
  assert.equal(
    LIVE_UNPAID_402["seller-integrity-audit"].amountAtomic,
    LIVE_PRICES["seller-integrity-audit"].amountAtomic,
  );
  assert.equal(isLiveUnpaid402Pin(row), true);
  assert.deepEqual(interpretUnpaid402(row), unpaidHeld);
  assert.deepEqual(classifyProbe(row), unpaidHeld);
  assert.deepEqual(
    interpretUnpaid402({
      status: 402,
      amountAtomic: 10000,
      route: "/commerce/seller-integrity-audit",
    }),
    unpaidHeld,
  );
  assert.equal(classifyProbe(row).paid, false);
  assert.equal(classifyProbe(row).settled, false);
});

test("regression: treating 402 as success must fail", () => {
  const bySuccess = assert402IsNotSuccess({
    status: 402,
    amountAtomic: LIVE_PRICES.extract.amountAtomic,
    route: "extract",
    success: true,
  });
  assert.equal(bySuccess.ok, false);
  assert.equal(bySuccess.rejected, true);
  assert.equal(bySuccess.code, UNPAID_402_IS_NOT_SUCCESS);
  assert.equal(bySuccess.outcome, "unpaid-held");

  const byOutcome = assert402IsNotSuccess({
    status: 402,
    amountAtomic: LIVE_PRICES["seller-integrity-audit"].amountAtomic,
    route: "seller-integrity-audit",
    outcome: "success",
  });
  assert.equal(byOutcome.ok, false);
  assert.equal(byOutcome.rejected, true);
  assert.equal(byOutcome.code, "unpaid-402-is-not-success");
  assert.equal(byOutcome.outcome, "unpaid-held");

  const honest = assert402IsNotSuccess({
    status: 402,
    amountAtomic: "5000",
    route: "/extract",
    success: false,
    outcome: "unpaid-held",
  });
  assert.equal(honest.ok, true);
  assert.equal(honest.rejected, false);
  assert.equal(honest.outcome, "unpaid-held");

  const mislabeled = classifyProbe({
    status: 402,
    amountAtomic: LIVE_PRICES.extract.amountAtomic,
    route: "extract",
    success: true,
    outcome: "success",
    paid: true,
    settled: true,
  });
  assert.equal(mislabeled.outcome, "unpaid-held");
  assert.equal(mislabeled.success, false);
  assert.equal(mislabeled.paid, false);
  assert.equal(mislabeled.settled, false);
});

test("live price pins still 5000 / 10000", () => {
  const pins = assertLivePricesUnchanged();
  assert.equal(pins.ok, true);
  assert.equal(LIVE_PRICES.extract.amountAtomic, "5000");
  assert.equal(LIVE_PRICES["seller-integrity-audit"].amountAtomic, "10000");
  assert.equal(LIVE_UNPAID_402.extract.amountAtomic, "5000");
  assert.equal(LIVE_UNPAID_402["seller-integrity-audit"].amountAtomic, "10000");
  assert.equal(LIVE_UNPAID_402.extract.network, "eip155:8453");
  assert.equal(LIVE_UNPAID_402["seller-integrity-audit"].network, "eip155:8453");
});

test("corpus fixture F18-402 is unpaid-held regression, not a sale", () => {
  const fixture = JSON.parse(
    readFileSync(join(packRoot, "fixtures/corpus/F18-402.json"), "utf8"),
  );
  assert.equal(fixture.id, "F18-402");
  assert.equal(fixture.disposition, "fixed_with_regression");
  assert.equal(fixture.kind, "regression");
  assert.equal(fixture.evaluator, "f18-402");
  assert.equal(fixture.saleState, "not_a_sale");
  assert.equal(fixture.provenance, "fixture");
  assert.equal(fixture.authorized, false);
  assert.equal(fixture.facts.extractAmountAtomic, "5000");
  assert.equal(fixture.facts.sellerIntegrityAuditAmountAtomic, "10000");
  assert.equal(fixture.facts.outcome, "unpaid-held");
  assert.equal(fixture.facts.f18LiveJourneys.probes, 28);
  assert.equal(fixture.facts.f18LiveJourneys.mismatches, 0);
  assert.equal(fixture.facts.f18LiveJourneys.unpaidHeld, 2);
  assert.equal(fixture.facts.f18LiveJourneys.unpaidHeld, F18_LIVE_JOURNEY_COUNTS.unpaidHeld);
  assert.equal(fixture.facts.success, false);
  assert.equal(fixture.facts.paid, false);
  assert.equal(fixture.facts.settled, false);
});
