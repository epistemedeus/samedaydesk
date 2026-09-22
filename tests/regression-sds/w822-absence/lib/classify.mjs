/**
 * Absence of SDS evidence is not market or paid demand.
 */
import { PRINCIPLE } from "./root.mjs";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
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

const UNKNOWN_STATES = new Set(["missing", "unknown", "unavailable", "absent"]);

/**
 * Missing or unknown observations are not a measured zero.
 * `unknown` — no observation (null / withheld).
 * `observed_zero` — a real measurement whose value is zero.
 * `unknown_as_zero` — a missing observation stored or claimed as zero.
 * `no_demand` — demand explicitly withheld without a missing metric.
 */
export function observationClass(output) {
  if (!asObject(output)) return "unspecified";
  const metrics = Array.isArray(output.metrics) ? output.metrics.filter(asObject) : [];
  const unknownZero = metrics.some(
    (row) => UNKNOWN_STATES.has(String(row.state || "")) && typeof row.value === "number",
  );
  const unknownNull = metrics.some(
    (row) =>
      UNKNOWN_STATES.has(String(row.state || "")) &&
      (row.value === null || row.value === undefined),
  );
  const observedZero = metrics.some((row) => row.state === "ok" && row.value === 0);
  if (
    output.unknownAsZero === true ||
    output.missingAsZero === true ||
    output.missingMetricsAsZero === true ||
    output.absenceProvesZeroDemand === true ||
    output.provenNoDemand === true ||
    unknownZero
  ) {
    return "unknown_as_zero";
  }
  if (unknownNull && typeof output.demandCount === "number") return "unknown_as_zero";
  if (
    output.missingMetrics === true ||
    output.missingNotZero === true ||
    unknownNull ||
    output.availability === "unavailable" ||
    output.documentedUnavailable === true
  ) {
    return "unknown";
  }
  if (output.observationClass === "observed_zero" || observedZero) return "observed_zero";
  if (output.demand === false && output.paidDemand === false) return "no_demand";
  return "unspecified";
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
  const observed = observationClass(output);
  const reasons = [];
  const detail = {
    claimedDemand: demanded,
    demandWithheld: withheld,
    absenceReasons,
    treatsAbsenceAsZero: asZero,
    observationClass: observed,
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

  if (observed === "unknown_as_zero") {
    reasons.push("unknown_as_zero");
    reasons.push("absence_as_zero_demand");
    reasons.push("missing_as_zero_demand");
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
