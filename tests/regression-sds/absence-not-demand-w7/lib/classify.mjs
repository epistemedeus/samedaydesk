/**
 * Classify claim envelopes that treat absence as demand.
 * Defect = inventing paid/market demand from missing, unavailable, empty,
 * organic-heuristic, catalog-only, or route-absent evidence.
 */
import { PRINCIPLE } from "./pin.mjs";

function claimSuccess(output) {
  if (!output || typeof output !== "object") return false;
  if (output.ok === true) return true;
  if (output.status === "pass" || output.status === "ok" || output.status === "success")
    return true;
  if (output.verdict === "pass" || output.verdict === "accept" || output.verdict === "demand")
    return true;
  if (output.pass === true) return true;
  if (output.demand === true || output.hasDemand === true || output.paidDemand === true)
    return true;
  return false;
}

function claimDemand(output) {
  if (!output || typeof output !== "object") return false;
  if (output.demand === true || output.hasDemand === true || output.paidDemand === true)
    return true;
  if (output.treatAbsenceAsDemand === true || output.absenceAsDemand === true) return true;
  if (output.inventedDemand === true) return true;
  if (typeof output.demandSignal === "string" && /^(present|positive|high|paid)$/i.test(output.demandSignal))
    return true;
  if (typeof output.paidCustomers === "number" && output.paidCustomers > 0) return true;
  if (typeof output.demandCount === "number" && output.demandCount > 0) return true;
  if (output.marketDemand === true || output.organicDemandProven === true) return true;
  if (output.action === "create_demand" || output.action === "treat_as_demand") return true;
  if (output.recommendation === "add_route_as_demand" || output.recommendation === "fill_absence_as_demand")
    return true;
  return false;
}

function evidenceAbsent(output, meta = {}) {
  const reasons = [];
  const paid = output.paidActivity || meta.paidActivity || null;
  const evidence = output.evidence || meta.evidence || null;

  if (paid && paid.available === false) {
    reasons.push("paid_activity_unavailable");
  }
  if (paid && (paid.state === "missing" || paid.reconcile?.state === "missing")) {
    reasons.push("paid_activity_missing");
  }
  if (output.routeAbsent === true || output.route_absent === true || evidence?.routeAbsent === true) {
    reasons.push("route_absent");
  }
  if (
    output.missingRoute === true ||
    (typeof output.missingRouteId === "string" && output.missingRouteId.length > 0)
  ) {
    reasons.push("route_absent");
  }
  if (output.pricingRowAbsent === true || output.pricingRowsEmpty === true) {
    reasons.push("pricing_row_absent");
  }
  if (Array.isArray(output.pricingRows) && output.pricingRows.length === 0) {
    reasons.push("pricing_row_absent");
  }
  if (output.commerceDemandEmpty === true || output.commerceDemand == null) {
    if (output.surface === "commerce-demand" || meta.surface === "commerce-demand" || output.commerceDemandEmpty) {
      reasons.push("commerce_demand_empty");
    }
  }
  if (Array.isArray(output.commerceDemand) && output.commerceDemand.length === 0) {
    reasons.push("commerce_demand_empty");
  }
  if (output.catalogOnly === true || output.evidenceClass === "catalog_registration") {
    reasons.push("catalog_only");
  }
  if (output.organicHeuristic === true || output.evidenceClass === "organic_heuristic") {
    reasons.push("organic_heuristic");
  }
  if (typeof output.sourceNote === "string") {
    if (/not (a )?paid|not market demand|not traffic|heuristic|catalog registration/i.test(output.sourceNote)) {
      if (/organic/i.test(output.sourceNote)) reasons.push("organic_heuristic");
      if (/catalog/i.test(output.sourceNote)) reasons.push("catalog_only");
    }
  }
  if (output.absence === true || output.absent === true || meta.absence === true) {
    reasons.push("explicit_absence");
  }
  if (output.treatAbsenceAsDemand === true || output.absenceAsDemand === true) {
    reasons.push("explicit_absence");
  }

  return [...new Set(reasons)];
}

/**
 * @param {object} output
 * @param {object} [meta]
 * @returns {{ reject: boolean, absenceAsDemand: boolean, reasons: string[], detail: object }}
 */
export function classifyAbsenceAsDemand(output, meta = {}) {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return {
      reject: false,
      absenceAsDemand: false,
      reasons: [],
      detail: {
        claimedSuccess: false,
        claimedDemand: false,
        absenceReasons: [],
        principle: PRINCIPLE,
        surface: meta.surface || "unknown",
        invalidOutput: true,
      },
    };
  }

  const absenceReasons = evidenceAbsent(output, meta);
  const demanded = claimDemand(output);
  const success = claimSuccess(output);
  const reasons = [];
  const detail = {
    claimedSuccess: success,
    claimedDemand: demanded,
    absenceReasons,
    principle: PRINCIPLE,
    surface: meta.surface || output.surface || "unknown",
  };

  // Explicit flag always rejects
  if (output.treatAbsenceAsDemand === true || output.absenceAsDemand === true) {
    reasons.push("treat_absence_as_demand");
  }
  if (output.inventedDemand === true) {
    reasons.push("invented_demand");
  }

  // Absence plus a demand claim is the defect; ok:true alone is an honest report.
  if (absenceReasons.length > 0 && demanded) {
    if (absenceReasons.includes("paid_activity_unavailable") || absenceReasons.includes("paid_activity_missing")) {
      reasons.push("unavailable_paid_activity_as_demand");
    }
    if (absenceReasons.includes("route_absent")) {
      reasons.push("route_absent_as_demand");
    }
    if (absenceReasons.includes("pricing_row_absent")) {
      reasons.push("pricing_absence_as_demand");
    }
    if (absenceReasons.includes("commerce_demand_empty")) {
      reasons.push("empty_commerce_demand_invented");
    }
    if (absenceReasons.includes("catalog_only")) {
      reasons.push("catalog_count_as_demand");
    }
    if (absenceReasons.includes("organic_heuristic")) {
      reasons.push("organic_heuristic_as_paid_demand");
    }
    if (absenceReasons.includes("explicit_absence") && !reasons.includes("treat_absence_as_demand")) {
      reasons.push("treat_absence_as_demand");
    }
  }

  // Heuristic/organic labeled as paid demand without paidActivity.available
  if (
    (output.organicDemandProven === true || output.paidCustomersFromOrganic === true) &&
    (!output.paidActivity || output.paidActivity.available !== true)
  ) {
    reasons.push("organic_heuristic_as_paid_demand");
  }

  // Catalog useCount / totalCount sold as paid demand
  if (
    (output.useCountAsDemand === true || output.catalogCountAsDemand === true) &&
    (!output.paidActivity || output.paidActivity.available !== true)
  ) {
    reasons.push("catalog_count_as_demand");
  }

  const unique = [...new Set(reasons)];
  const reject = unique.length > 0;
  const absenceAsDemand = reject;

  if (absenceAsDemand && !unique.includes("absence_as_demand")) {
    unique.unshift("absence_as_demand");
  }

  return {
    reject,
    absenceAsDemand,
    reasons: unique,
    detail,
  };
}

export { claimSuccess, claimDemand };
