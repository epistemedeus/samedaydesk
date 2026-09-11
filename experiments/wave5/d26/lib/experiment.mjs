import {
  ASSIGNMENT_ID,
  BUYER_CLASSES,
  CO16_READ_ONLY_PR,
  CO16_READ_ONLY_SHA,
  COMPUTE_MODEL,
  CONFIRM_JOB_ID,
  ERROR_CODES,
  F08_MODULE,
  LIVE_ASSET,
  LIVE_EXTRACT_PRICE_USDC,
  LIVE_NETWORK,
  LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC,
  PILOT_PACKET_SHA,
  PROPOSED_JOB_ID,
  PROPOSED_PRICE_USDC,
  SCHEMA_EXPERIMENT,
  SCHEMA_OFFER,
  TESTED_SDS_PR,
  TESTED_SDS_REF,
  TESTED_SDS_SHA,
  X402_RAIL_ID,
  USDC_DECIMALS,
} from "./pins.mjs";
import { ExperimentRefuse, refuse } from "./refuse.mjs";
import { measureJob } from "./measure.mjs";
import { priceFloor } from "./floor.mjs";
import { formatUsdc, parseDecimal } from "./money.mjs";

function remainingBindings() {
  return {
    "W5-D01":
      "Supplied-input contract export is not on this branch. This kit consumed F08 runPaidOffer/CLI at SDS PR52 aeef964fa188443078958d9d6d393afae1d542ee.",
    "W5-D25":
      "Buyer-journey harness experiments/wave5/d25/ is not on this branch. Two owner-qa F08 CLI jobs here are a current-interface stand-in, not D25 acceptance.",
    "W5-M12": "Machine-readable capability/pricing description remains a later consumer of this floor.",
  };
}

function guardRequest(request) {
  const buyerClass = request.buyerClass;
  if (!buyerClass) {
    return refuse(ERROR_CODES.MISSING_BUYER_CLASS, "buyerClass is required (owner-qa | fixture-buyer | unknown)");
  }
  if (!BUYER_CLASSES.includes(buyerClass)) {
    return refuse(ERROR_CODES.UNKNOWN_BUYER_CLASS, `unknown buyerClass ${buyerClass}`);
  }
  if (buyerClass === "fixture-buyer" && request.independentDemand === true) {
    return refuse(
      ERROR_CODES.FIXTURE_BUYER_IS_NOT_INDEPENDENT,
      "fixture-buyer cannot be labelled independent demand",
    );
  }
  if (request.citedBankedAsCostCover === true) {
    return refuse(
      ERROR_CODES.CITED_BANKED_IS_NOT_COST_COVER,
      "Cited banked 8.105 USDC is not this job's revenue or cost cover",
    );
  }
  if (request.includeOperation === "early-x402-revenue") {
    return refuse(
      ERROR_CODES.SETTLEMENT_IS_NOT_JOB_REVENUE,
      "early-x402-revenue is a settlement observation, not this job's revenue",
    );
  }
  if (request.settle === true || request.liveSettle === true) {
    return refuse(
      ERROR_CODES.LIVE_SETTLE_OUT_OF_SCOPE,
      "Live settlement is out of scope. This kit does not call a facilitator.",
    );
  }
  if (request.forceUnlikeUnitsEqual === true) {
    return refuse(
      ERROR_CODES.UNLIKE_UNITS_FORCED_EQUAL,
      "USDC atomic (6dp) and Stripe cents (2dp) stay distinct; this kit will not hash them equal",
    );
  }
  if (request.rewriteLiveExtract === true || request.rewriteLiveSia === true) {
    return refuse(
      ERROR_CODES.LIVE_PRICE_REWRITE_REFUSED,
      "Live extract $0.005 and seller-integrity-audit $0.01 are not rewritten by D26",
    );
  }
  return null;
}

function oneJob(request, jobId) {
  const measured = measureJob({
    jobId,
    example: request.example === true,
    funding: request.funding,
    paymentPath: request.paymentPath,
    settle: request.settle === true,
    args: request.args,
    timeoutMs: request.timeoutMs,
  });
  if (!measured.ok) return measured;

  const floor = priceFloor({
    railId: request.railId || X402_RAIL_ID,
    proposedPriceUsdc: request.proposedPriceUsdc || PROPOSED_PRICE_USDC,
    durationMs: measured.durationMs,
    feeTier: request.feeTier,
    measurementOk: true,
    certifyAsX402Offer: request.certifyAsX402Offer === true,
  });
  if (!floor.ok) return { ...floor, measurement: measured.measurement };

  return { measured, floor };
}

export function runExperiment(request = {}) {
  try {
    const blocked = guardRequest(request);
    if (blocked) return blocked;

    const proposedJobId = request.jobId || PROPOSED_JOB_ID;
    const primary = oneJob(request, proposedJobId);
    if (!primary.measured) return primary;

    let confirm = null;
    if (request.confirmJob !== false) {
      confirm = oneJob({ ...request, example: false, funding: undefined, paymentPath: undefined }, CONFIRM_JOB_ID);
      if (!confirm.measured) return confirm;
    }

    const proposedAtomic = parseDecimal(request.proposedPriceUsdc || PROPOSED_PRICE_USDC, USDC_DECIMALS);
    const liveExtractAtomic = parseDecimal(LIVE_EXTRACT_PRICE_USDC, USDC_DECIMALS);
    const certified =
      primary.floor.certified === true &&
      (request.railId || X402_RAIL_ID) === X402_RAIL_ID &&
      primary.measured.sold !== true &&
      primary.measured.sample !== true;

    if (!primary.floor.coversFloor) {
      return {
        ...refuse(
          ERROR_CODES.PROPOSED_BELOW_FLOOR,
          `proposed ${formatUsdc(proposedAtomic)} USDC is below floor ${primary.floor.floorUsdc}`,
          { floor: primary.floor },
        ),
        measurement: primary.measured.measurement,
      };
    }

    const offer = {
      schema: SCHEMA_OFFER,
      assignment: ASSIGNMENT_ID,
      jobId: proposedJobId,
      railId: request.railId || X402_RAIL_ID,
      scheme: "exact",
      network: LIVE_NETWORK,
      asset: LIVE_ASSET,
      proposedPriceUsdc: formatUsdc(proposedAtomic),
      proposedPriceAtomic: proposedAtomic.toString(),
      publishedToLiveCatalog: false,
      liveSettleAttempted: false,
      purchaseAuthority: false,
      buyerClass: request.buyerClass,
      independentDemand: false,
      sold: false,
      sample: false,
      nonLossmaking: certified && primary.floor.nonLossmaking,
      certified,
      floorUsdc: primary.floor.floorUsdc,
      variableComputeUsdc: primary.floor.variableComputeUsdc,
      paymentFeeUsdc: primary.floor.paymentFeeUsdc,
      feeTier: primary.floor.feeTier,
      billedComputeSeconds: primary.floor.billedComputeSeconds,
      liveExtractPriceUsdc: LIVE_EXTRACT_PRICE_USDC,
      liveSellerIntegrityAuditPriceUsdc: LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC,
      distinctFromLiveExtract: proposedAtomic !== liveExtractAtomic,
    };

    return {
      ok: true,
      schema: SCHEMA_EXPERIMENT,
      assignment: ASSIGNMENT_ID,
      certified,
      nonLossmaking: offer.nonLossmaking,
      sold: false,
      publishedToLiveCatalog: false,
      liveSettleAttempted: false,
      purchaseAuthority: false,
      independentDemand: false,
      buyerClass: request.buyerClass,
      offer,
      primary: {
        jobId: proposedJobId,
        durationMs: primary.measured.durationMs,
        fundingState: primary.measured.fundingState,
        outputBytes: primary.measured.outputBytes,
        inputsDigest: primary.measured.inputsDigest,
        outputsDigest: primary.measured.outputsDigest,
        floor: primary.floor,
      },
      confirm: confirm
        ? {
            jobId: CONFIRM_JOB_ID,
            durationMs: confirm.measured.durationMs,
            fundingState: confirm.measured.fundingState,
            outputBytes: confirm.measured.outputBytes,
            floor: confirm.floor,
          }
        : null,
      computeModel: COMPUTE_MODEL,
      testedImplementation: {
        repo: "epistemedeus/samedaydesk",
        sha: TESTED_SDS_SHA,
        ref: TESTED_SDS_REF,
        pr: TESTED_SDS_PR,
        module: F08_MODULE,
      },
      readOnlyRefs: {
        co16BuyerValueLedger: { sha: CO16_READ_ONLY_SHA, pr: CO16_READ_ONLY_PR, vendored: false },
        pilotPacket: { sha: PILOT_PACKET_SHA, path: "overview/research/cursor-wave5-20260911" },
      },
      remainingBindings: remainingBindings(),
    };
  } catch (err) {
    if (err instanceof ExperimentRefuse) {
      return refuse(err.code, err.message, err.detail);
    }
    return refuse(ERROR_CODES.WRAPPER_FAILURE_IS_NOT_COST_BASIS, err.message || String(err));
  }
}
