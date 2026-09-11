import { ERROR_CODES, RUN_BUYER_CLASSES, SETTLEMENT_BUYER_CLASSES } from "./pins.mjs";
import { refuse } from "./refuse.mjs";

function wantsIndependent(request = {}) {
  return (
    request.independentDemand === true ||
    request.independent === true ||
    request.asIndependent === true ||
    request["independent-demand"] === true ||
    request.mapToIndependent === true ||
    request["map-to"] === "independent"
  );
}

export function inspectRunBuyerClass(request = {}) {
  const raw = request.buyerClass ?? request["buyer-class"];
  if (raw == null || raw === "") {
    return refuse(
      ERROR_CODES.MISSING_BUYER_CLASS,
      "buyerClass is required on an invocation (owner-qa | fixture-buyer | unknown)",
    );
  }
  if (typeof raw !== "string") {
    return refuse(ERROR_CODES.UNKNOWN_BUYER_CLASS, "buyerClass must be a string");
  }
  if (raw === "independent") {
    return refuse(
      ERROR_CODES.INDEPENDENT_DEMAND_PROHIBITED,
      "run buyerClass cannot be independent; that class belongs on a settlement document",
      { buyerClass: raw },
    );
  }
  if (SETTLEMENT_BUYER_CLASSES.includes(raw) && !RUN_BUYER_CLASSES.includes(raw)) {
    return refuse(
      ERROR_CODES.UNKNOWN_BUYER_CLASS,
      `buyerClass ${raw} is a settlement class, not a run label`,
      { buyerClass: raw },
    );
  }
  if (!RUN_BUYER_CLASSES.includes(raw)) {
    return refuse(ERROR_CODES.UNKNOWN_BUYER_CLASS, `buyerClass ${raw} is not in the run closed set`, {
      buyerClass: raw,
    });
  }
  if (raw === "fixture-buyer" && wantsIndependent(request)) {
    return refuse(
      ERROR_CODES.FIXTURE_BUYER_IS_NOT_INDEPENDENT,
      "fixture-buyer cannot be labelled independent demand",
      { buyerClass: raw },
    );
  }
  if (wantsIndependent(request)) {
    return refuse(
      ERROR_CODES.INDEPENDENT_DEMAND_PROHIBITED,
      "labelled runs never infer independent demand",
      { buyerClass: raw },
    );
  }
  if (request.organicDemand === true || request.organic === true) {
    return refuse(
      ERROR_CODES.ORGANIC_DEMAND_PROHIBITED,
      "labelled runs never infer organic demand",
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

export function inspectActorClass(request = {}) {
  const raw = request.actorClass ?? request.buyerClass ?? "unknown";
  if (raw === "independent") {
    return refuse(
      ERROR_CODES.INDEPENDENT_DEMAND_PROHIBITED,
      "presentation actorClass cannot be independent without a settlement join",
    );
  }
  if (!RUN_BUYER_CLASSES.includes(raw)) {
    return refuse(ERROR_CODES.UNKNOWN_BUYER_CLASS, `actorClass ${raw} is not a run label`, {
      actorClass: raw,
    });
  }
  return { ok: true, actorClass: raw };
}
