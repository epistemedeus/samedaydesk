import {
  ERROR_CODES,
  PROHIBITED_INFERENCES,
  RUN_BUYER_CLASSES,
  SETTLEMENT_BUYER_CLASSES,
} from "./pins.mjs";

export function refuse(code, message, extra = {}) {
  return {
    ok: false,
    refused: true,
    code,
    message,
    independentDemand: false,
    organicDemand: false,
    purchaseAuthority: false,
    jobRevenueUsdc: null,
    prohibitedInferences: [...PROHIBITED_INFERENCES],
    ...extra,
  };
}

/**
 * buyerClass is required and must be a labelled run class.
 * Settlement classes (independent|owner|sponsored) are not accepted as run labels.
 */
export function inspectBuyerClass(request = {}) {
  const raw = request.buyerClass ?? request["buyer-class"];
  if (raw == null || raw === "") {
    return refuse(ERROR_CODES.MISSING_BUYER_CLASS, "buyerClass is required on the request (owner-qa | fixture-buyer | unknown)");
  }
  if (typeof raw !== "string") {
    return refuse(ERROR_CODES.UNKNOWN_BUYER_CLASS, "buyerClass must be a string");
  }

  const wantsIndependent =
    request.independentDemand === true ||
    request.independent === true ||
    request.asIndependent === true ||
    request["independent-demand"] === true ||
    request.mapToIndependent === true ||
    request["map-to"] === "independent" ||
    request.settlementBuyerClass === "independent";

  if (raw === "independent") {
    return refuse(
      ERROR_CODES.INDEPENDENT_DEMAND_PROHIBITED,
      "analytics_count_is_independent_demand: labelled runs never accept buyerClass independent",
      { buyerClass: raw },
    );
  }

  if (SETTLEMENT_BUYER_CLASSES.includes(raw) && !RUN_BUYER_CLASSES.includes(raw)) {
    return refuse(
      ERROR_CODES.UNKNOWN_BUYER_CLASS,
      `buyerClass ${raw} is a settlement class, not a run label (owner-qa | fixture-buyer | unknown)`,
      { buyerClass: raw },
    );
  }

  if (!RUN_BUYER_CLASSES.includes(raw)) {
    return refuse(ERROR_CODES.UNKNOWN_BUYER_CLASS, `buyerClass ${raw} is not in the run closed set`, {
      buyerClass: raw,
    });
  }

  if (raw === "fixture-buyer" && wantsIndependent) {
    return refuse(
      ERROR_CODES.FIXTURE_BUYER_IS_NOT_INDEPENDENT,
      "fixture-buyer cannot be labelled independent demand",
      { buyerClass: raw },
    );
  }

  if (wantsIndependent) {
    return refuse(
      ERROR_CODES.INDEPENDENT_DEMAND_PROHIBITED,
      "analytics_count_is_independent_demand: labelled runs never infer independent demand",
      { buyerClass: raw },
    );
  }

  const acquisition = request.acquisition || request.organic || request.labels?.acquisition;
  if (acquisition === "organic" || request.organicDemand === true || request.organic === true) {
    return refuse(
      ERROR_CODES.ORGANIC_DEMAND_PROHIBITED,
      "labelled useful-job runs never infer organic demand",
      { buyerClass: raw },
    );
  }

  return {
    ok: true,
    buyerClass: raw,
    independentDemand: false,
    organicDemand: false,
  };
}
