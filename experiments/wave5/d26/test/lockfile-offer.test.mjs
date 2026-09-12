import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  LIVE_LOCKFILE_PRICE_ATOMIC,
  LIVE_LOCKFILE_PRICE_USDC,
  OWNED_DIR,
  PRODUCTION_RAILWAY_OBSERVATION,
  USDC_DECIMALS,
} from "../lib/pins.mjs";
import { formatUsdc, parseDecimal } from "../lib/money.mjs";
import {
  formatUsd12,
  railwayRates,
  railwayVariableCost,
  usd12ToUsdcAtomicCeil,
} from "../lib/railway-fees.mjs";
import { facilitatorAttemptCost } from "../lib/facilitator-cost.mjs";
import { recommendLiveLockfileOffer } from "../lib/lockfile-offer.mjs";
import { buildSourceExport } from "../lib/source-export.mjs";
import { rebindMeasuredReport } from "../lib/rebind-measured.mjs";
import { nextPaymentId } from "../lib/merchant-harness.mjs";

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

  it("payment identifiers stay unique when labels are long", () => {
    const ids = new Set(Array.from({ length: 40 }, () => nextPaymentId("h04-pub-lock-01")));
    assert.equal(ids.size, 40);
    for (const id of ids) assert.ok(id.startsWith("lockfile_"));
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

  it("separates source-default xpay from production cdp and does not claim unread quota", () => {
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
          wallMs: 5065.022093,
        },
      ],
      allocatedHour: { variableUsd: "0.002447109008" },
      allocatedMonth: { variableUsd: "1.761918486328" },
      localSuccessfulMeanWallMs: 47.5765309,
    });
    assert.equal(rec.priceChange, false);
    assert.equal(rec.priceUsdc, "0.005");
    assert.equal(rec.priceAtomic, "5000");
    assert.equal(rec.facilitator.sourceDefault, "xpay");
    assert.equal(rec.facilitator.sourceDefaultNotProduction, true);
    assert.equal(rec.facilitator.productionFacilitator, "cdp");
    assert.equal(
      rec.facilitator.productionObserved.FACILITATOR,
      PRODUCTION_RAILWAY_OBSERVATION.allowlistedVariables.FACILITATOR,
    );
    assert.equal(rec.facilitator.cdp.usageBasedUsdPerOnchainTx, "0.001");
    assert.equal(rec.facilitator.cdp.freeTierMonthlyOnchain, 1000);
    assert.equal(rec.facilitator.cdp.freeTierIsNotUnitCost, true);
    assert.equal(rec.facilitator.cdp.accountBalanceUnread, true);
    assert.equal(rec.facilitator.cdp.remainingFreeQuotaUnread, true);
    assert.equal(rec.latency.notProductionLatency, true);
    assert.equal(rec.latency.localSuccessfulMeanWallMs, 47.5765309);
    assert.equal(rec.failedVersusSuccessful.localTimeout503Settle0IsNotCdpFeeProof, true);
    assert.equal(rec.failedVersusSuccessful.timeoutSettleCalls, 0);
    assert.equal(rec.allocatedFixed.notUnitMarginal, true);
    assert.equal(rec.allocatedFixed.notProjectProfit, true);
    assert.equal(rec.allocatedFixed.sharedWithExtractBatch, true);
    assert.equal(rec.unitMarginal.doesNotIncludeIdleReplica, true);
    assert.equal(rec.unitMarginalVsAllocated.thisVmIdleCoverIllustration.notProjectProfit, true);
    assert.equal(rec.profitGuarantee, false);
    assert.equal(rec.economicsUse, "bounded-launch-decision");
  });

  it("CDP official schedule is the production model; local settle 0 is not a CDP invoice", () => {
    const none = facilitatorAttemptCost({ facilitator: "cdp", settleCalls: 0, verifyCalls: 1 });
    assert.equal(none.settleFeeUsdc, "0.000000");
    assert.match(none.note, /Production Railway allowlist observed FACILITATOR=cdp/);
    assert.match(none.note, /not a CDP fee invoice/);
    const xpay = facilitatorAttemptCost({ facilitator: "xpay", settleCalls: 1, verifyCalls: 1 });
    assert.equal(xpay.feeKnown, false);
    assert.match(xpay.note, /SOURCE default/);
    assert.match(xpay.note, /Production was observed FACILITATOR=cdp/);
  });

  it("source export keeps merchant xpay default distinct from observed production cdp", () => {
    const exp = buildSourceExport();
    assert.equal(exp.facilitatorFromMerchantSource.default, "xpay");
    assert.equal(exp.facilitatorFromMerchantSource.sourceDefaultNotProduction, true);
    assert.equal(exp.facilitatorProductionObserved.productionFacilitator, "cdp");
    assert.equal(exp.facilitatorProductionObserved.cdpAccountBalanceUnread, true);
    assert.equal(exp.facilitatorProductionObserved.cdpFreeTierRemainingUnread, true);
    assert.equal(exp.pricingDocuments.cdpFacilitator.productionObservedFacilitator, "cdp");
    assert.equal(exp.pricingDocuments.cdpFacilitator.remainingQuotaUnread, true);
    assert.equal(exp.pricingDocuments.cdpFacilitator.accountBalanceUnread, true);
    assert.equal(exp.pricingDocuments.xpay.notProductionFacilitator, true);
    assert.equal(exp.liveService.priceUsdc, "0.005");
  });

  it("rebinds captured profile rows without remounting or changing 0.005", () => {
    const rebound = rebindMeasuredReport(
      {
        capturedAt: "2026-09-12T01:48:47.197Z",
        rows: [
          {
            classification: "successful",
            railwayVariableUsdcAtomicCeil: "1",
            settleCalls: 1,
            family: "h04",
          },
        ],
        allocated: {
          hour: { variableUsd: "0.002447109008" },
          monthApprox30d: { variableUsd: "1.761918486328" },
        },
        latencyMs: { successfulMeanWall: 47.5765309 },
        environment: {
          capturedAt: "2026-09-12T01:48:47.197Z",
          merchantRoot: "/tmp/d26-merchant",
          h04Root: "/tmp/readonly-refs/sds-h04",
        },
      },
      { reboundAt: "2026-09-12T02:05:00Z" },
    );
    assert.equal(rebound.capturedAt, "2026-09-12T01:48:47.197Z");
    assert.equal(rebound.reboundFromCapturedAt, "2026-09-12T01:48:47.197Z");
    assert.equal(rebound.rows.length, 1);
    assert.equal(rebound.recommendation.priceAtomic, "5000");
    assert.equal(rebound.recommendation.priceChange, false);
    assert.equal(rebound.recommendation.facilitator.productionFacilitator, "cdp");
    assert.equal(rebound.recommendation.facilitator.sourceDefault, "xpay");
    assert.equal(rebound.latencyMs.notProductionLatency, true);
    assert.equal(rebound.productionRailwayObservation.allowlistedVariables.FACILITATOR, "cdp");
  });

  it("production Railway allowlist fixture exposes only the three observed variables", () => {
    const obs = JSON.parse(
      readFileSync(join(OWNED_DIR, "fixtures/production-railway-allowlist.json"), "utf8"),
    );
    assert.equal(obs.allowlistedVariables.FACILITATOR, "cdp");
    assert.equal(obs.allowlistedVariables.EXTRACT_BATCH_ENABLED, "1");
    assert.equal(obs.allowlistedVariables.LOCKFILE_PIN_DELTA_ENABLED, "1");
    assert.deepEqual(
      Object.keys(obs.allowlistedVariables).sort(),
      ["EXTRACT_BATCH_ENABLED", "FACILITATOR", "LOCKFILE_PIN_DELTA_ENABLED"],
    );
    assert.equal(obs.noMutation, true);
    assert.ok(obs.unread.includes("cdp-account-balance"));
    assert.ok(obs.unread.includes("cdp-free-tier-remaining-onchain-count"));
  });

  it("measured recommendation is rebound to production cdp without changing 0.005", () => {
    const rec = JSON.parse(readFileSync(join(OWNED_DIR, "measured/recommendation.json"), "utf8"));
    assert.equal(rec.priceUsdc, "0.005");
    assert.equal(rec.priceAtomic, "5000");
    assert.equal(rec.priceChange, false);
    assert.equal(rec.facilitator.productionFacilitator, "cdp");
    assert.equal(rec.facilitator.sourceDefault, "xpay");
    assert.equal(rec.facilitator.cdp.accountBalanceUnread, true);
    assert.equal(rec.facilitator.cdp.remainingFreeQuotaUnread, true);
    assert.equal(rec.latency.notProductionLatency, true);
    assert.equal(rec.failedVersusSuccessful.localTimeout503Settle0IsNotCdpFeeProof, true);
    assert.equal(rec.profitGuarantee, false);
    assert.equal(rec.allocatedFixed.notProjectProfit, true);
    const exp = JSON.parse(readFileSync(join(OWNED_DIR, "measured/source-export.json"), "utf8"));
    assert.equal(exp.facilitatorProductionObserved.productionFacilitator, "cdp");
    assert.equal(exp.facilitatorFromMerchantSource.default, "xpay");
  });
});
