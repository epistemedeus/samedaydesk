/**
 * Classify claim envelopes that treat SDS absence as demand (w822).
 *
 * Distinct from w7 (route/catalog/organic/pricing/commerce) and w1122
 * (pulse GET /mcp, owner-QA, uniqueHumans). This classifier covers:
 * documented-unavailable x402scan, moltjobs composition≠conversion,
 * non-additive sources, missing≠zero, stale/partial, scoped no-change,
 * presence snapshots, liquidity-as-funnel, series-buyers-as-humans,
 * unpaid 402 traces.
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
  if (output.x402scanAsDemand === true || output.documentedUnavailableAsDemand === true) return true;
  if (output.compositionAsConversion === true || output.sourcesAdditiveAsDemand === true) return true;
  if (output.scopedNoChangeAsDemand === true || output.presenceSnapshotAsDemand === true) return true;
  if (output.liquidityFunnelAsDemand === true || output.seriesBuyersAsUniqueHumans === true) return true;
  if (output.buyerSetupTraceAsDemand === true || output.unpaid402AsDemand === true) return true;
  if (output.stalePartialAsDemand === true || output.missingAsZeroDemand === true) return true;
  if (output.conversionFunnel === true) return true;
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

export function evidenceAbsent(output, meta = {}) {
  const reasons = [];
  if (!asObject(output) && !asObject(meta)) return reasons;

  const paid = asObject(output.paidActivity) || asObject(meta.paidActivity);
  const claims = asObject(output.claims);

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
    output.evidenceClass === "composition_not_conversion"
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
    output.evidenceClass === "liquidity_not_funnel"
  ) {
    reasons.push("liquidity_not_funnel");
  }

  if (
    output.seriesBuyersNotHumans === true ||
    output.seriesBuyersAsUniqueHumans === true ||
    output.evidenceClass === "series_buyers_not_humans"
  ) {
    reasons.push("series_buyers_not_humans");
  }

  if (
    output.unpaid402 === true ||
    output.buyerSetupTrace === true ||
    output.buyerSetupTraceAsDemand === true ||
    output.unpaid402AsDemand === true ||
    output.surface === "buyer-setup-trace" ||
    meta.surface === "buyer-setup-trace"
  ) {
    reasons.push("unpaid_402_trace");
  }
  if (output.paymentSent === false && (output.buyerSetupTrace === true || output.unpaid402 === true)) {
    reasons.push("unpaid_402_trace");
  }

  if (output.absence === true || output.absent === true || meta.absence === true) {
    reasons.push("explicit_absence");
  }
  if (output.treatAbsenceAsDemand === true || output.absenceAsDemand === true) {
    reasons.push("explicit_absence");
  }

  if (claims?.notDemand === true && claimDemand(output)) {
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
    if (absenceReasons.includes("missing_not_zero")) {
      reasons.push("missing_as_zero_demand");
    }
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
    if (absenceReasons.includes("contradiction_not_demand")) {
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
