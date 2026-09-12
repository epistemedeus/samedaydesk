import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LIVE_LOCKFILE_PRICE_ATOMIC, LIVE_LOCKFILE_PRICE_USDC, USDC_DECIMALS } from "../lib/pins.mjs";
import { formatUsdc, parseDecimal } from "../lib/money.mjs";
import {
  formatUsd12,
  railwayRates,
  railwayVariableCost,
  usd12ToUsdcAtomicCeil,
} from "../lib/railway-fees.mjs";
import { facilitatorAttemptCost } from "../lib/facilitator-cost.mjs";
import { recommendLiveLockfileOffer } from "../lib/lockfile-offer.mjs";

describe("live lockfile 0.005 / Railway units", () => {
  it("0.005 USDC is 5000 atomic and is the live lockfile quote", () => {
    assert.equal(LIVE_LOCKFILE_PRICE_USDC, "0.005");
    assert.equal(LIVE_LOCKFILE_PRICE_ATOMIC, "5000");
    assert.equal(parseDecimal(LIVE_LOCKFILE_PRICE_USDC, USDC_DECIMALS), 5000n);
    assert.equal(formatUsdc(5000n), "0.005000");
  });

  it("Railway 1 vCPU-second is 0.00000772 USD and ceils to 8 USDC atomic", () => {
    const rates = railwayRates();
    assert.equal(formatUsd12(rates.cpuUsd12PerVcpuSecond), "0.000007720000");
    const one = railwayVariableCost({ cpuSeconds: 1, wallSeconds: 0, peakRssBytes: 0 });
    assert.equal(one.variableUsd, "0.000007720000");
    assert.equal(one.onDemandMinimumSeconds, 0);
    assert.equal(one.variableUsdcAtomicCeil, "8");
    assert.equal(usd12ToUsdcAtomicCeil(rates.cpuUsd12PerVcpuSecond), 8n);
  });

  it("does not bill a 60s AWS minimum for a 50ms Railway attribution", () => {
    const short = railwayVariableCost({
      cpuSeconds: 0.05,
      wallSeconds: 0.05,
      peakRssBytes: 50 * 1024 * 1024,
    });
    assert.ok(Number(short.variableUsd) < 0.00001);
    assert.ok(Number(short.variableUsdcAtomicCeil) <= 2);
    assert.notEqual(short.wallSeconds, 60);
  });

  it("CDP settle fee is zero when settleCalls is zero", () => {
    const none = facilitatorAttemptCost({ facilitator: "cdp", settleCalls: 0, verifyCalls: 1 });
    assert.equal(none.ok, true);
    assert.equal(none.settleFeeUsdc, "0.000000");
    assert.equal(none.settleFeeAtomic, "0");
    const one = facilitatorAttemptCost({ facilitator: "cdp", settleCalls: 1, verifyCalls: 1 });
    assert.equal(one.settleFeeUsdc, "0.001000");
  });

  it("xpay fees stay unknown and are not CDP $0.001", () => {
    const xpay = facilitatorAttemptCost({ facilitator: "xpay", settleCalls: 1, verifyCalls: 1 });
    assert.equal(xpay.ok, true);
    assert.equal(xpay.feeKnown, false);
    assert.equal(xpay.appliesCdp001, false);
    assert.equal(xpay.settleFeeUsdc, null);
  });

  it("current 0.005 offer is not certified no-loss", () => {
    const rec = recommendLiveLockfileOffer({
      rows: [
        {
          classification: "successful",
          railwayVariableUsdcAtomicCeil: "1",
          settleCalls: 1,
        },
        {
          classification: "failed",
          id: "controlled-timeout",
          settleCalls: 0,
          wallMs: 5100,
        },
      ],
    });
    assert.equal(rec.priceChange, false);
    assert.equal(rec.certifiedNoLoss, false);
    assert.equal(rec.nonLossmaking, false);
    assert.equal(rec.offer.keepCurrentOffer, true);
    assert.equal(rec.priceAtomic, "5000");
    assert.ok(rec.mustMeasureBeforeNoLoss.length >= 5);
  });
});
