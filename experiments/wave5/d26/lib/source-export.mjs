import {
  H04_SHA,
  LIVE_LOCKFILE_PATH,
  LIVE_LOCKFILE_PRICE_ATOMIC,
  LIVE_LOCKFILE_PRICE_USDC,
  MERCHANT_FACILITATOR_CDP_URL,
  MERCHANT_FACILITATOR_DEFAULT,
  MERCHANT_FACILITATOR_DEFAULT_URL,
  MERCHANT_SHA,
  MERCHANT_VERSION,
  PRODUCTION_RAILWAY_OBSERVATION,
  RAILWAY_MODEL,
  SCHEMA_SOURCE_EXPORT,
} from "./pins.mjs";
import { loadCorpusManifest } from "./corpus.mjs";

export function buildSourceExport({ environment, merchantRoot, h04Root } = {}) {
  const manifest = loadCorpusManifest();
  return {
    schema: SCHEMA_SOURCE_EXPORT,
    assignment: "W5-D26",
    liveService: {
      repo: "epistemedeus/x402-url-extractor",
      sha: MERCHANT_SHA,
      version: MERCHANT_VERSION,
      route: LIVE_LOCKFILE_PATH,
      method: "POST",
      priceUsdc: LIVE_LOCKFILE_PRICE_USDC,
      priceAtomic: LIVE_LOCKFILE_PRICE_ATOMIC,
      payment: "x402-only",
      hosting: "Railway",
      notPriorVendorBudgetWrapper: true,
      priorHistoricalKit: "experiments/wave5/d26 F08 vendor-budget-impact at 0.003 with assumed T3/60s",
    },
    merchantWorktree: merchantRoot || null,
    facilitatorFromMerchantSource: {
      default: MERCHANT_FACILITATOR_DEFAULT,
      defaultUrl: MERCHANT_FACILITATOR_DEFAULT_URL,
      cdpUrl: MERCHANT_FACILITATOR_CDP_URL,
      file: "server.js",
      sourceDefaultNotProduction: true,
      note:
        "SOURCE default FACILITATOR=xpay → https://facilitator.xpay.sh. Local tests inject FACILITATOR=xpay and FACILITATOR_URL=<fake> so handlers run without credentials. That is measurement transport, not the production facilitator.",
    },
    facilitatorProductionObserved: {
      observedAt: PRODUCTION_RAILWAY_OBSERVATION.observedAt,
      observer: PRODUCTION_RAILWAY_OBSERVATION.observer,
      merchantSha: PRODUCTION_RAILWAY_OBSERVATION.merchantSha,
      merchantVersion: PRODUCTION_RAILWAY_OBSERVATION.merchantVersion,
      allowlistedVariables: PRODUCTION_RAILWAY_OBSERVATION.allowlistedVariables,
      productionFacilitator: PRODUCTION_RAILWAY_OBSERVATION.allowlistedVariables.FACILITATOR,
      sourceDefault: MERCHANT_FACILITATOR_DEFAULT,
      sourceDefaultNotProduction: true,
      noOtherValuesExposed: PRODUCTION_RAILWAY_OBSERVATION.noOtherValuesExposed,
      noMutation: PRODUCTION_RAILWAY_OBSERVATION.noMutation,
      cdpAccountBalanceUnread: PRODUCTION_RAILWAY_OBSERVATION.cdpAccountBalanceUnread,
      cdpFreeTierRemainingUnread: PRODUCTION_RAILWAY_OBSERVATION.cdpFreeTierRemainingUnread,
      railwayPlanUnread: PRODUCTION_RAILWAY_OBSERVATION.railwayPlanUnread,
      extractBatchAlsoOnSameProcess:
        PRODUCTION_RAILWAY_OBSERVATION.allowlistedVariables.EXTRACT_BATCH_ENABLED === "1",
      note:
        "Root read of the live Railway service allowlisted variables on 2026-09-12 ~02:00 UTC. Production is FACILITATOR=cdp. CDP keys, remaining free-tier quota, account balance, and Railway plan were not read and are not claimed.",
    },
    lockfileHandler: {
      config: "lockfile-pin-delta-config.mjs",
      adapter: "lockfile-pin-delta.mjs",
      worker: "lockfile-pin-delta-worker.mjs",
      maxRequestBytes: 256 * 1024,
      maxLockfileBytes: 128 * 1024,
      timeoutMs: 5000,
      maxPins: 8000,
      executeBeforeSettle: "HTTP >=400 cancels settlement (charged false)",
    },
    h04Corpus: {
      repo: "epistemedeus/samedaydesk",
      sha: H04_SHA,
      worktree: h04Root || null,
      pairs: manifest.pairs.map((p) => ({
        id: p.id,
        rel: p.rel,
        before: p.before,
        after: p.after,
        httpMode: p.httpMode || "full",
      })),
    },
    pricingDocuments: {
      railway: {
        source: RAILWAY_MODEL.source,
        plansSource: RAILWAY_MODEL.plansSource,
        retrievedAt: RAILWAY_MODEL.retrievedAt,
        cpuUsdPerVcpuSecond: RAILWAY_MODEL.cpuUsdPerVcpuSecond,
        memoryUsdPerGbSecond: RAILWAY_MODEL.memoryUsdPerGbSecond,
        accountPlan: "unknown",
      },
      cdpFacilitator: {
        source: "https://docs.cdp.coinbase.com/x402/core-concepts/facilitator",
        retrievedAt: "2026-09-12",
        verifyUsd: "0",
        usageBasedUsdPerOnchainTx: "0.001",
        freeTierMonthlyOnchain: 1000,
        freeTierIsNotUnitCost: true,
        productionObservedFacilitator: "cdp",
        remainingQuotaUnread: true,
        accountBalanceUnread: true,
        localTimeout503Settle0IsNotCdpFeeProof: true,
        appliesBecause:
          "production Railway allowlist FACILITATOR=cdp observed 2026-09-12T02:00:00Z",
      },
      xpay: {
        feeSchedule: "unknown",
        defaultInMerchantSource: true,
        notProductionFacilitator: true,
      },
    },
    measurementMethod: environment?.method || null,
    environment: environment
      ? {
          node: environment.node,
          cpuCount: environment.cpuCount,
          memAvailableBytes: environment.memAvailableBytes,
          capturedAt: environment.capturedAt,
        }
      : null,
    replay: {
      merchantInstall: "cp merchant pin into a disposable worktree; npm install --omit=dev (not on Mac, not into SDS)",
      h04Worktree: `git fetch <sds> ${H04_SHA} && git worktree add --detach <dir> ${H04_SHA}`,
      command: "node bin/price-floor.mjs profile --buyer-class owner-qa",
      rebindWithoutRemount: "node bin/price-floor.mjs rebind-measured",
      tests: "node --test --test-concurrency=1 test/*.test.mjs",
    },
  };
}
