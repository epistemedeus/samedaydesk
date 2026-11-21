import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  FEE_BPS,
  FEE_MODULE,
  breakEvenGrossAtomic,
  evaluateBundledEconomics,
  feePerCapture,
  separateVersusBundledFees,
  termsAuthorizeFeeReadout,
} from "../src/economics.mjs";
import { validateBundle } from "../src/schema.mjs";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");

function load(name) {
  return JSON.parse(readFileSync(join(fixtures, name), "utf8"));
}

test("fee arithmetic is bound to imported FEE_BPS=500", () => {
  assert.equal(FEE_BPS, 500);
  assert.equal(FEE_MODULE, "vendor/hosted-wallet-market/src/fee.mjs");
  assert.equal(feePerCapture("1000000"), "50000");
  assert.equal(feePerCapture("19"), "0");
  assert.equal(feePerCapture("38"), "1");
});

test("break-even gross is twenty times measured cost", () => {
  assert.equal(breakEvenGrossAtomic("100000"), "2000000");
});

test("floor-delta fixture discloses cumulativeFloorDelta of 1", () => {
  const floors = separateVersusBundledFees(["19", "19"]);
  assert.equal(floors.separateFeeSumAtomic, "0");
  assert.equal(floors.bundledFeeAtomic, "1");
  assert.equal(floors.cumulativeFloorDelta, "1");

  const validated = validateBundle(load("floor-delta.json"));
  const economics = evaluateBundledEconomics(validated.bundle);
  assert.equal(economics.tasks[0].platformFeeAtomic, "0");
  assert.equal(economics.tasks[1].platformFeeAtomic, "0");
  assert.equal(economics.bundled.platformFeeAtomic, "1");
  assert.equal(economics.bundled.contributorNetAtomic, "37");
  assert.equal(economics.bundled.separateContributorNetSumAtomic, "38");
  assert.equal(economics.bundled.cumulativeFloorDelta, "1");
  assert.equal(economics.bundled.bundledFeeDiffersFromSeparateSum, true);
  assert.equal(economics.bundled.feeBps, 500);
  assert.equal(economics.bundled.feeBasis, "new_job_gross");
});

test("authorized bundle-helpful quotes match equal-net 5 percent floors", () => {
  const economics = evaluateBundledEconomics(validateBundle(load("bundle-helpful.json")).bundle);
  assert.equal(economics.tasks[0].platformFeeAtomic, "200000");
  assert.equal(economics.tasks[0].contributorNetAtomic, "3800000");
  assert.equal(economics.tasks[1].platformFeeAtomic, "200000");
  assert.equal(economics.bundled.platformFeeAtomic, "400000");
  assert.equal(economics.bundled.contributorNetAtomic, "7600000");
  assert.equal(economics.bundled.cumulativeFloorDelta, "0");
  assert.equal(economics.bundled.thisQuoteFeeIsExactFivePercent, true);
});

test("unauthorized terms do not invent a take rate", () => {
  assert.deepEqual(
    termsAuthorizeFeeReadout({ feeBps: 250, feeBasis: "old_work_net" }),
    { ok: false, reason: "terms_fee_bps_not_authorized" },
  );
  assert.deepEqual(
    termsAuthorizeFeeReadout({ feeBps: 500, feeBasis: "old_work_net" }),
    { ok: false, reason: "terms_fee_basis_not_authorized" },
  );
  assert.deepEqual(termsAuthorizeFeeReadout({}), { ok: false, reason: "terms_fee_fields_absent" });
  const economics = evaluateBundledEconomics(validateBundle(load("unauthorized-terms.json")).bundle);
  assert.equal(economics.tasks[0].feeReadout, "terms_fee_bps_not_authorized");
  assert.equal(economics.bundled.feeReadout, "no_authorized_task_quotes");
  assert.equal(economics.tasks[0].platformFeeAtomic, undefined);
});
