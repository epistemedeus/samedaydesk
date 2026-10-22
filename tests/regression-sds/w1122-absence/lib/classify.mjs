/**
 * Classify claim envelopes that treat SDS absence as demand.
 * Defect = inventing paid/market demand from missing, unavailable, empty,
 * organic-heuristic, catalog-only, owner-QA, discovery, pulse-estimate,
 * or MCP-surface evidence; or treating empty/unavailable as proven zero demand.
 */
import { PRINCIPLE } from "./root.mjs";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

export function claimDemand(output) {
  if (!asObject(output)) return false;
  if (output.demand === true || output.hasDemand === true || output.paidDemand === true) return true;
  if (output.treatAbsenceAsDemand === true || output.absenceAsDemand === true) return true;
  if (output.inventedDemand === true) return true;
  if (output.marketDemand === true || output.organicDemandProven === true) return true;
  if (output.paidCustomersFromOrganic === true) return true;
  if (output.useCountAsDemand === true || output.catalogCountAsDemand === true) return true;
  if (output.mcpSurfaceGetAsDemand === true || output.uniqueHumansAsDemand === true) return true;
  if (output.discoveryAsDemand === true || output.ownerQaAsDemand === true) return true;
  if (output.verdict === "demand") return true;
  if (output.action === "create_demand" || output.action === "treat_as_demand") return true;
  if (
    output.recommendation === "add_route_as_demand" ||
    output.recommendation === "fill_absence_as_demand"
  ) {
    return true;
  }
  if (typeof output.demandSignal === "string" && /^(present|positive|high|paid)$/i.test(output.demandSignal)) {
    return true;
  }
  if (typeof output.paidCustomers === "number" && output.paidCustomers > 0) return true;
  if (typeof output.demandCount === "number" && output.demandCount > 0) return true;
  return false;
}

export function demandWithheld(output) {
  if (!asObject(output)) return false;
  if (output.notDemand === true) return true;
  if (output.claims && output.claims.notDemand === true) return true;
  if (output.demand === false && output.paidDemand === false) return true;
  if (output.demandSignal === "withheld" || output.demandSignal === "absent-not-demand") return true;
  const withheld = output.withheldConclusions;
  if (Array.isArray(withheld) && withheld.some((item) => /demand/i.test(String(item)))) return true;
  return false;
}

function emptyCountsMap(value) {
  const obj = asObject(value);
  if (!obj) return false;
  const counts = asObject(obj.counts) || (asObject(value) && !("counts" in obj) ? obj : null);
  if (!counts) return Object.keys(obj).length === 0;
  return Object.keys(counts).length === 0;
}

export function evidenceAbsent(output, meta = {}) {
  const reasons = [];
  if (!asObject(output) && !asObject(meta)) return reasons;

  const paid = asObject(output.paidActivity) || asObject(meta.paidActivity);
  const evidence = asObject(output.evidence) || asObject(meta.evidence);
  const claims = asObject(output.claims);

  if (paid && paid.available === false) reasons.push("paid_activity_unavailable");
  if (paid && (paid.state === "missing" || asObject(paid.reconcile)?.state === "missing")) {
    reasons.push("paid_activity_missing");
  }

  if (output.routeAbsent === true || output.route_absent === true || evidence?.routeAbsent === true) {
    reasons.push("route_absent");
  }
  if (output.missingRoute === true || typeof output.missingRouteId === "string") {
    reasons.push("route_absent");
  }

  if (output.pricingRowAbsent === true || output.pricingRowsEmpty === true) {
    reasons.push("pricing_row_absent");
  }
  if (Array.isArray(output.pricingRows) && output.pricingRows.length === 0) {
    reasons.push("pricing_row_absent");
  }

  if (output.commerceDemandEmpty === true || (output.surface === "commerce-demand" && output.commerceDemand == null)) {
    reasons.push("commerce_demand_empty");
  }
  if (Array.isArray(output.commerceDemand) && output.commerceDemand.length === 0) {
    reasons.push("commerce_demand_empty");
  }
  if (meta.surface === "commerce-demand" && (output.commerceDemandEmpty || output.commerceDemand == null)) {
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

  if (output.emptyToolMap === true || output.emptyCountsMap === true) reasons.push("empty_tool_map");
  const toolMap = output.toolCallsByName || asObject(output.mcpProtocol)?.toolCallsByName;
  if (emptyCountsMap(toolMap)) reasons.push("empty_tool_map");

  if (
    output.ownerQa === true ||
    output.ownerQaOnly === true ||
    claims?.ownerQaOnly === true ||
    claims?.notDemand === true
  ) {
    reasons.push("owner_qa");
  }

  if (asObject(output.uniqueHumansEstimate) || output.uniqueHumansAsDemand === true) {
    reasons.push("unique_humans_estimate");
  }
  if (asObject(output.mcpSurfaceGet) || output.mcpSurfaceGetAsDemand === true) {
    reasons.push("mcp_surface_get");
  }
  if (output.discovery === true || output.discoveryAsDemand === true || output.surface === "discovery") {
    reasons.push("discovery");
  }

  if (output.absence === true || output.absent === true || meta.absence === true) {
    reasons.push("explicit_absence");
  }
  if (output.treatAbsenceAsDemand === true || output.absenceAsDemand === true) {
    reasons.push("explicit_absence");
  }

  return [...new Set(reasons)];
}

function treatsAbsenceAsZero(output) {
  if (!asObject(output)) return false;
  if (output.absenceProvesZeroDemand === true) return true;
  if (output.emptyMapMeansZero === true) return true;
  if (output.provenNoDemand === true) return true;
  if (output.unavailableAsZero === true) return true;
  if (output.absenceMeansZero === true) return true;
  return false;
}

/**
 * @param {object} output
 * @param {object} [meta]
 * @returns {{ reject: boolean, absenceAsDemand: boolean, reasons: string[], detail: object }}
 */
export function classifyAbsenceAsDemand(output, meta = {}) {
  const absenceReasons = evidenceAbsent(output, meta);
  const demanded = claimDemand(output);
  const withheld = demandWithheld(output);
  const asZero = treatsAbsenceAsZero(output);
  const reasons = [];
  const detail = {
    claimedDemand: demanded,
    demandWithheld: withheld,
    absenceReasons,
    treatsAbsenceAsZero: asZero,
    principle: PRINCIPLE,
    surface: meta.surface || output?.surface || "unknown",
  };

  if (!asObject(output)) {
    return { reject: false, absenceAsDemand: false, reasons, detail };
  }

  if (output.treatAbsenceAsDemand === true || output.absenceAsDemand === true) {
    reasons.push("treat_absence_as_demand");
  }
  if (output.inventedDemand === true) {
    reasons.push("invented_demand");
  }

  if (asZero && absenceReasons.length > 0) {
    reasons.push("absence_as_zero_demand");
  }

  if (absenceReasons.length > 0 && demanded) {
    if (absenceReasons.includes("paid_activity_unavailable") || absenceReasons.includes("paid_activity_missing")) {
      reasons.push("unavailable_paid_activity_as_demand");
    }
    if (absenceReasons.includes("route_absent")) reasons.push("route_absent_as_demand");
    if (absenceReasons.includes("pricing_row_absent")) reasons.push("pricing_absence_as_demand");
    if (absenceReasons.includes("commerce_demand_empty")) reasons.push("empty_commerce_demand_invented");
    if (absenceReasons.includes("catalog_only")) reasons.push("catalog_count_as_demand");
    if (absenceReasons.includes("organic_heuristic")) reasons.push("organic_heuristic_as_paid_demand");
    if (absenceReasons.includes("empty_tool_map")) reasons.push("empty_tool_map_as_demand");
    if (absenceReasons.includes("owner_qa")) reasons.push("owner_qa_as_demand");
    if (absenceReasons.includes("unique_humans_estimate")) reasons.push("unique_humans_as_demand");
    if (absenceReasons.includes("mcp_surface_get")) reasons.push("mcp_surface_get_as_demand");
    if (absenceReasons.includes("discovery")) reasons.push("discovery_as_demand");
    if (absenceReasons.includes("explicit_absence") && !reasons.includes("treat_absence_as_demand")) {
      reasons.push("treat_absence_as_demand");
    }
  }

  if (
    (output.organicDemandProven === true || output.paidCustomersFromOrganic === true) &&
    (!output.paidActivity || output.paidActivity.available !== true)
  ) {
    reasons.push("organic_heuristic_as_paid_demand");
  }

  if (
    (output.useCountAsDemand === true || output.catalogCountAsDemand === true) &&
    (!output.paidActivity || output.paidActivity.available !== true)
  ) {
    reasons.push("catalog_count_as_demand");
  }

  const unique = [...new Set(reasons)];
  const reject = unique.length > 0;
  if (reject && !unique.includes("absence_as_demand")) unique.unshift("absence_as_demand");

  return {
    reject,
    absenceAsDemand: reject,
    reasons: unique,
    detail,
  };
}
