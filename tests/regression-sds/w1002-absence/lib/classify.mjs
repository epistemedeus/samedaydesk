/**
 * Absence of SDS evidence is not market or paid demand (w1002).
 *
 * Window-local pack, disjoint from w7 / w802 / w822 / w902 / w922 and later
 * write trees. Rejects invented demand from documented-unavailable x402scan,
 * moltjobs composition≠conversion, non-additive sources, missing≠zero,
 * stale/partial, scoped no-change, presence snapshots, unpaid 402 traces,
 * owner-QA issues, empty pulse tool maps, GET /mcp hits, catalog counts,
 * analytics counts, in-process uniqueHumans estimates, seller-conformance
 * inspection, recruited Agent402 receipts, issue-evidence observations, and
 * unlabeled envelopes that still claim demand while withholding it.
 */
import { PRINCIPLE } from "./root.mjs";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function emptyCountsMap(value) {
  const obj = asObject(value);
  if (!obj) return false;
  const counts = asObject(obj.counts);
  if (counts) return Object.keys(counts).length === 0;
  if ("counts" in obj) return true;
  return Object.keys(obj).length === 0;
}

function claimBags(output, meta = {}) {
  const bags = [];
  for (const obj of [output, meta]) {
    if (!asObject(obj)) continue;
    bags.push(obj);
    if (asObject(obj.claims)) bags.push(obj.claims);
    if (asObject(obj.evidence)) {
      bags.push(obj.evidence);
      if (asObject(obj.evidence.claims)) bags.push(obj.evidence.claims);
    }
    if (asObject(obj.payment)) bags.push(obj.payment);
  }
  return bags;
}

function ratioKeys(paid) {
  const rows = Array.isArray(paid?.refusedRatios) ? paid.refusedRatios : [];
  return rows
    .map((row) => (asObject(row) ? row.key : row))
    .filter((key) => typeof key === "string" && key.length > 0);
}

function doesNotEstablishList(output, paid) {
  const lists = [paid?.doesNotEstablish, output?.doesNotEstablish];
  const out = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) out.push(String(item));
  }
  return out;
}

export function claimDemand(output) {
  if (!asObject(output)) return false;
  if (output.demand === true || output.hasDemand === true || output.paidDemand === true) return true;
  if (output.treatAbsenceAsDemand === true || output.absenceAsDemand === true) return true;
  if (output.inventedDemand === true) return true;
  if (output.marketDemand === true || output.organicDemandProven === true) return true;
  if (output.x402scanAsDemand === true || output.documentedUnavailableAsDemand === true) return true;
  if (output.compositionAsConversion === true || output.sourcesAdditiveAsDemand === true) return true;
  if (output.scopedNoChangeAsDemand === true || output.presenceSnapshotAsDemand === true) return true;
  if (output.liquidityFunnelAsDemand === true || output.seriesBuyersAsUniqueHumans === true) return true;
  if (output.buyerSetupTraceAsDemand === true || output.unpaid402AsDemand === true) return true;
  if (output.stalePartialAsDemand === true || output.missingAsZeroDemand === true) return true;
  if (output.conversionFunnel === true) return true;
  if (output.paidCustomersFromOrganic === true) return true;
  if (output.useCountAsDemand === true || output.catalogCountAsDemand === true) return true;
  if (output.mcpSurfaceGetAsDemand === true || output.uniqueHumansAsDemand === true) return true;
  if (output.discoveryAsDemand === true || output.ownerQaAsDemand === true) return true;
  if (output.analyticsCountAsDemand === true || output.catalogPresenceAsDemand === true) return true;
  if (output.sellerConformanceAsDemand === true || output.inspectionAsDemand === true) return true;
  if (output.recruitedReceiptAsDemand === true || output.recruitedAgent402AsDemand === true) return true;
  if (output.organicDemandFromInspection === true || output.issueEvidenceAsDemand === true) return true;
  if (output.verdict === "demand") return true;
  if (output.action === "create_demand" || output.action === "treat_as_demand") return true;
  if (
    output.recommendation === "add_route_as_demand" ||
    output.recommendation === "fill_absence_as_demand" ||
    output.recommendation === "call_unavailable_as_demand"
  ) {
    return true;
  }
  if (typeof output.demandSignal === "string" && /^(present|positive|high|paid)$/i.test(output.demandSignal)) {
    return true;
  }
  if (typeof output.paidCustomers === "number" && output.paidCustomers > 0) return true;
  if (typeof output.demandCount === "number" && output.demandCount > 0) return true;
  if (typeof output.crossSourceTotal === "number" && output.crossSourceTotal > 0 && output.additivity === "summed") {
    return true;
  }
  return false;
}

export function demandWithheld(output, meta = {}) {
  if (!asObject(output) && !asObject(meta)) return false;
  for (const bag of claimBags(output, meta)) {
    if (bag.notDemand === true) return true;
    if (bag.demand === "not_observed") return true;
    if (bag.demandSignal === "withheld" || bag.demandSignal === "absent-not-demand") return true;
    const withheld = bag.withheldConclusions;
    if (Array.isArray(withheld) && withheld.some((item) => /demand/i.test(String(item)))) return true;
  }
  if (asObject(output) && output.demand === false && output.paidDemand === false) return true;
  return false;
}

export function evidenceAbsent(output, meta = {}) {
  const reasons = [];
  if (!asObject(output) && !asObject(meta)) return reasons;

  const paid = asObject(output.paidActivity) || asObject(meta.paidActivity);
  const claims = asObject(output.claims);
  const evidence = asObject(output.evidence) || asObject(meta.evidence);
  const nestedClaims = asObject(evidence?.claims) || claims;
  const payment = asObject(output.payment) || asObject(meta.payment);
  const refused = ratioKeys(paid);
  const doesNot = doesNotEstablishList(output, paid);

  if (paid && paid.available === false) reasons.push("paid_activity_unavailable");
  if (paid && (paid.state === "missing" || asObject(paid.reconcile)?.state === "missing")) {
    reasons.push("paid_activity_missing");
  }

  const sourceId = output.sourceId || meta.sourceId || paid?.sourceId;
  if (
    sourceId === "x402scan" ||
    output.documentedUnavailable === true ||
    output.x402scanAsDemand === true ||
    output.documentedUnavailableAsDemand === true
  ) {
    reasons.push("documented_unavailable");
  }
  if (output.called === false && (sourceId === "x402scan" || output.documentedUnavailable === true)) {
    reasons.push("documented_unavailable");
  }

  if (
    output.composition === true ||
    output.compositionAsConversion === true ||
    output.refusedRatioKey === "marketplaceJobs_over_totalJobs_as_conversion" ||
    refused.includes("marketplaceJobs_over_totalJobs_as_conversion") ||
    output.evidenceClass === "composition_not_conversion" ||
    sourceId === "moltjobs"
  ) {
    reasons.push("composition_not_conversion");
  }

  if (
    output.additivity === "not_additive" ||
    output.additivity === "summed" ||
    output.sourcesAdditiveAsDemand === true ||
    output.notAdditive === true
  ) {
    reasons.push("not_additive");
  }

  if (
    output.missingMetrics === true ||
    output.missingNotZero === true ||
    output.missingAsZero === true ||
    output.missingMetricsAsZero === true ||
    output.missingAsZeroDemand === true
  ) {
    reasons.push("missing_not_zero");
  }
  if (Array.isArray(output.metrics) && output.metrics.some((row) => asObject(row) && row.state === "missing" && row.value == null)) {
    reasons.push("missing_not_zero");
  }

  const availability = output.availability || meta.availability;
  if (availability === "stale" || availability === "partial" || availability === "unavailable") {
    reasons.push("stale_or_partial");
  }
  if (output.stalePartialAsDemand === true || output.stale === true || output.partial === true) {
    reasons.push("stale_or_partial");
  }

  if (
    output.paidValueClaim === false ||
    output.scopedNoChange === true ||
    output.scopedNoChangeAsDemand === true
  ) {
    reasons.push("scoped_no_change");
  }

  if (
    output.presenceSnapshot === true ||
    output.presenceSnapshotAsDemand === true ||
    output.surface === "presence" ||
    meta.surface === "presence"
  ) {
    reasons.push("presence_snapshot");
  }

  if (
    output.liquidityNotFunnel === true ||
    output.liquidityFunnelAsDemand === true ||
    output.evidenceClass === "liquidity_not_funnel" ||
    output.conversionFunnel === true ||
    (typeof output.paidCustomers === "number" && output.paidCustomers > 0 && sourceId === "moltjobs") ||
    refused.some((key) => /everPaid_over_registered|bidding30d_over_registered|everPaid_over_bidding/.test(key)) ||
    doesNot.some((item) => /conversion funnel/i.test(item))
  ) {
    reasons.push("liquidity_not_funnel");
  }

  if (
    output.seriesBuyersNotHumans === true ||
    output.seriesBuyersAsUniqueHumans === true ||
    output.evidenceClass === "series_buyers_not_humans" ||
    sourceId === "x402stats" ||
    refused.some((key) => /series_buyers/.test(key)) ||
    doesNot.some((item) => /unique humans/i.test(item))
  ) {
    reasons.push("series_buyers_not_humans");
  }

  if (
    output.unpaid402 === true ||
    output.buyerSetupTrace === true ||
    output.buyerSetupTraceAsDemand === true ||
    output.unpaid402AsDemand === true ||
    output.surface === "buyer-setup-trace" ||
    meta.surface === "buyer-setup-trace" ||
    output.recipeId === "buyer-setup-trace" ||
    evidence?.kind === "buyer_setup_trace"
  ) {
    reasons.push("unpaid_402_trace");
  }
  if (output.paymentSent === false && (output.buyerSetupTrace === true || output.unpaid402 === true)) {
    reasons.push("unpaid_402_trace");
  }
  if (
    (nestedClaims?.paymentSent === false || payment?.paid === false || payment?.signed === false) &&
    (output.recipeId === "buyer-setup-trace" || evidence?.kind === "buyer_setup_trace" || output.surface === "buyer-setup-trace")
  ) {
    reasons.push("unpaid_402_trace");
  }

  if (output.catalogOnly === true || output.evidenceClass === "catalog_registration" || output.catalogCountAsDemand === true) {
    reasons.push("catalog_only");
  }
  if (output.organicHeuristic === true || output.evidenceClass === "organic_heuristic") {
    reasons.push("organic_heuristic");
  }

  if (output.emptyToolMap === true || output.emptyCountsMap === true) reasons.push("empty_tool_map");
  const toolMap = output.toolCallsByName || asObject(output.mcpProtocol)?.toolCallsByName;
  if (emptyCountsMap(toolMap)) reasons.push("empty_tool_map");

  if (output.ownerQa === true || output.ownerQaOnly === true || claims?.ownerQaOnly === true) {
    reasons.push("owner_qa");
  }

  if (asObject(output.uniqueHumansEstimate) || output.uniqueHumansAsDemand === true) {
    reasons.push("unique_humans_estimate");
  }
  if (asObject(output.mcpSurfaceGet) || output.mcpSurfaceGetAsDemand === true) {
    reasons.push("mcp_surface_get");
  }
  if (output.discovery === true || output.discoveryAsDemand === true || output.surface === "discovery" || meta.surface === "discovery") {
    reasons.push("discovery");
  }

  if (
    output.analyticsCountAsDemand === true ||
    output.evidenceClass === "analytics_count" ||
    output.prohibitedInference === "analytics_count_is_independent_demand"
  ) {
    reasons.push("analytics_count");
  }
  if (
    output.catalogPresenceAsDemand === true ||
    output.prohibitedInference === "catalog_presence_is_demand"
  ) {
    reasons.push("catalog_presence");
  }

  if (
    output.sellerConformance === true ||
    output.sellerConformanceAsDemand === true ||
    output.inspectionAsDemand === true ||
    output.inspectionNotDemand === true ||
    output.surface === "seller-conformance" ||
    meta.surface === "seller-conformance"
  ) {
    reasons.push("seller_conformance_inspection");
  }

  if (
    output.recruitedAgent402 === true ||
    output.recruitedReceiptAsDemand === true ||
    output.recruitedAgent402AsDemand === true ||
    output.organicDemandFromInspection === true
  ) {
    reasons.push("recruited_receipt");
  }

  if (
    output.issueEvidence === true ||
    output.issueEvidenceAsDemand === true ||
    output.notDemandSignal === true ||
    output.kind === "issue_evidence" ||
    output.kind === "issue_evidence_work_brief" ||
    output.surface === "issue-evidence" ||
    meta.surface === "issue-evidence" ||
    evidence?.kind === "issue_evidence"
  ) {
    reasons.push("issue_evidence");
  }

  if (output.absence === true || output.absent === true || meta.absence === true) {
    reasons.push("explicit_absence");
  }
  if (output.treatAbsenceAsDemand === true || output.absenceAsDemand === true) {
    reasons.push("explicit_absence");
  }

  if ((nestedClaims?.notDemand === true || claims?.notDemand === true) && claimDemand(output)) {
    reasons.push("contradiction_not_demand");
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
  if (output.missingAsZero === true || output.missingMetricsAsZero === true) return true;
  if (output.missingAsZeroDemand === true) return true;
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
  const withheld = demandWithheld(output, meta);
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
    if (absenceReasons.includes("missing_not_zero")) {
      reasons.push("missing_as_zero_demand");
    }
  }

  if (demanded && withheld) {
    reasons.push("contradiction_not_demand");
  }

  if (absenceReasons.length > 0 && demanded) {
    if (absenceReasons.includes("documented_unavailable") || absenceReasons.includes("paid_activity_unavailable")) {
      if (output.sourceId === "x402scan" || output.x402scanAsDemand === true || output.documentedUnavailable === true) {
        reasons.push("x402scan_unavailable_as_demand");
      }
      if (absenceReasons.includes("paid_activity_unavailable") || absenceReasons.includes("paid_activity_missing")) {
        reasons.push("unavailable_paid_activity_as_demand");
      }
    }
    if (absenceReasons.includes("composition_not_conversion")) {
      reasons.push("composition_as_conversion");
    }
    if (absenceReasons.includes("not_additive")) {
      reasons.push("sources_additive_as_demand");
    }
    if (absenceReasons.includes("missing_not_zero") && !reasons.includes("missing_as_zero_demand")) {
      reasons.push("missing_as_zero_demand");
    }
    if (absenceReasons.includes("stale_or_partial")) {
      reasons.push("stale_partial_as_demand");
    }
    if (absenceReasons.includes("scoped_no_change")) {
      reasons.push("scoped_no_change_as_demand");
    }
    if (absenceReasons.includes("presence_snapshot")) {
      reasons.push("presence_snapshot_as_demand");
    }
    if (absenceReasons.includes("liquidity_not_funnel")) {
      reasons.push("liquidity_funnel_as_demand");
    }
    if (absenceReasons.includes("series_buyers_not_humans")) {
      reasons.push("series_buyers_as_unique_humans");
    }
    if (absenceReasons.includes("unpaid_402_trace")) {
      reasons.push("unpaid_402_trace_as_demand");
    }
    if (absenceReasons.includes("catalog_only")) {
      reasons.push("catalog_count_as_demand");
    }
    if (absenceReasons.includes("organic_heuristic")) {
      reasons.push("organic_heuristic_as_paid_demand");
    }
    if (absenceReasons.includes("empty_tool_map")) {
      reasons.push("empty_tool_map_as_demand");
    }
    if (absenceReasons.includes("owner_qa")) {
      reasons.push("owner_qa_as_demand");
    }
    if (absenceReasons.includes("unique_humans_estimate")) {
      reasons.push("unique_humans_as_demand");
    }
    if (absenceReasons.includes("mcp_surface_get")) {
      reasons.push("mcp_surface_get_as_demand");
    }
    if (absenceReasons.includes("discovery")) {
      reasons.push("discovery_as_demand");
    }
    if (absenceReasons.includes("analytics_count")) {
      reasons.push("analytics_count_as_demand");
    }
    if (absenceReasons.includes("catalog_presence")) {
      reasons.push("catalog_presence_as_demand");
    }
    if (absenceReasons.includes("seller_conformance_inspection")) {
      reasons.push("seller_conformance_as_demand");
    }
    if (absenceReasons.includes("recruited_receipt")) {
      reasons.push("recruited_receipt_as_demand");
    }
    if (absenceReasons.includes("issue_evidence")) {
      reasons.push("issue_evidence_as_demand");
    }
    if (absenceReasons.includes("contradiction_not_demand") && !reasons.includes("contradiction_not_demand")) {
      reasons.push("contradiction_not_demand");
    }
    if (absenceReasons.includes("explicit_absence") && !reasons.includes("treat_absence_as_demand")) {
      reasons.push("treat_absence_as_demand");
    }
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
