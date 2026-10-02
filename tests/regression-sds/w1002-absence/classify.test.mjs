import assert from "node:assert/strict";
import test from "node:test";
import { classifyAbsenceAsDemand, claimDemand, demandWithheld } from "./lib/classify.mjs";

test("honest withheld absence does not invent demand", () => {
  const v = classifyAbsenceAsDemand({
    ok: true,
    status: "pass",
    surface: "observatory",
    sourceId: "x402scan",
    availability: "unavailable",
    called: false,
    documentedUnavailable: true,
    demand: false,
    paidDemand: false,
    notDemand: true,
    demandSignal: "withheld",
    withheldConclusions: ["demand"],
    paidActivity: { available: false, reason: "never called as success" },
  });
  assert.equal(v.reject, false, JSON.stringify(v.reasons));
  assert.equal(v.absenceAsDemand, false);
  assert.equal(v.detail.claimedDemand, false);
  assert.equal(v.detail.demandWithheld, true);
});

test("seeded x402scan absence-as-demand is rejected", () => {
  const v = classifyAbsenceAsDemand({
    ok: true,
    sourceId: "x402scan",
    documentedUnavailable: true,
    called: false,
    x402scanAsDemand: true,
    treatAbsenceAsDemand: true,
    demand: true,
    paidDemand: true,
    paidActivity: { available: false },
  });
  assert.equal(v.reject, true);
  assert.ok(v.reasons.includes("absence_as_demand"));
  assert.ok(v.reasons.includes("x402scan_unavailable_as_demand"));
});

test("composition claimed as conversion is rejected", () => {
  const v = classifyAbsenceAsDemand({
    composition: true,
    compositionAsConversion: true,
    refusedRatioKey: "marketplaceJobs_over_totalJobs_as_conversion",
    demand: true,
  });
  assert.equal(v.reject, true);
  assert.ok(v.reasons.includes("composition_as_conversion"));
});

test("GET /mcp surface hits as demand is rejected", () => {
  const v = classifyAbsenceAsDemand({
    mcpSurfaceGetAsDemand: true,
    demand: true,
    mcpSurfaceGet: { requests: 19 },
  });
  assert.equal(v.reject, true);
  assert.ok(v.reasons.includes("mcp_surface_get_as_demand"));
});

test("owner-QA issue as demand is rejected", () => {
  const v = classifyAbsenceAsDemand({
    ownerQa: true,
    ownerQaOnly: true,
    ownerQaAsDemand: true,
    demand: true,
    claims: { ownerQaOnly: true, notDemand: true },
  });
  assert.equal(v.reject, true);
  assert.ok(v.reasons.includes("owner_qa_as_demand"));
});

test("analytics count as independent demand is rejected", () => {
  const v = classifyAbsenceAsDemand({
    evidenceClass: "analytics_count",
    analyticsCountAsDemand: true,
    prohibitedInference: "analytics_count_is_independent_demand",
    demand: true,
    demandCount: 412,
  });
  assert.equal(v.reject, true);
  assert.ok(v.reasons.includes("analytics_count_as_demand"));
});

test("empty envelope does not reject", () => {
  const v = classifyAbsenceAsDemand({});
  assert.equal(v.reject, false);
  assert.equal(claimDemand({}), false);
  assert.equal(demandWithheld({}), false);
});

test("notDemand plus demand is a contradiction reject", () => {
  const v = classifyAbsenceAsDemand({
    unpaid402: true,
    buyerSetupTrace: true,
    demand: true,
    claims: { notDemand: true },
  });
  assert.equal(v.reject, true);
  assert.ok(v.reasons.includes("unpaid_402_trace_as_demand"));
});

test("missing-as-zero is rejected even without a positive demand count", () => {
  const v = classifyAbsenceAsDemand({
    missingMetrics: true,
    missingAsZero: true,
    provenNoDemand: true,
    demandCount: 0,
    metrics: [{ key: "jobCount", value: null, state: "missing" }],
  });
  assert.equal(v.reject, true);
  assert.ok(v.reasons.includes("missing_as_zero_demand"));
});

test("unlabeled moltjobs withheldConclusions plus demand is rejected", () => {
  const v = classifyAbsenceAsDemand({
    sourceId: "moltjobs",
    withheldConclusions: ["demand", "conversion_funnel", "paid_demand_population"],
    paidActivity: {
      refusedRatios: [{ key: "marketplaceJobs_over_totalJobs_as_conversion" }],
      doesNotEstablish: ["a registration-to-paid conversion funnel"],
    },
    demand: true,
    demandCount: 48,
  });
  assert.equal(v.reject, true, JSON.stringify(v.reasons));
  assert.ok(v.reasons.includes("absence_as_demand"));
  assert.ok(v.reasons.includes("composition_as_conversion"));
  assert.equal(v.detail.demandWithheld, true);
});

test("unlabeled moltjobs conversionFunnel plus paidCustomers is rejected as liquidity funnel", () => {
  const v = classifyAbsenceAsDemand({
    sourceId: "moltjobs",
    conversionFunnel: true,
    demand: true,
    paidDemand: true,
    paidCustomers: 62,
    demandSignal: "paid",
  });
  assert.equal(v.reject, true, JSON.stringify(v.reasons));
  assert.ok(v.reasons.includes("absence_as_demand"));
  assert.ok(v.reasons.includes("liquidity_funnel_as_demand"));
});

test("honest scoped no-change does not invent demand", () => {
  const v = classifyAbsenceAsDemand({
    surface: "record-recipes",
    scopedNoChange: true,
    paidValueClaim: false,
    demand: false,
    paidDemand: false,
    notDemand: true,
    demandSignal: "withheld",
    withheldConclusions: ["demand"],
  });
  assert.equal(v.reject, false, JSON.stringify(v.reasons));
  assert.equal(v.absenceAsDemand, false);
  assert.equal(v.detail.claimedDemand, false);
});

test("scoped no-change sold as demand is rejected", () => {
  const v = classifyAbsenceAsDemand({
    scopedNoChange: true,
    scopedNoChangeAsDemand: true,
    paidValueClaim: false,
    demand: true,
    marketDemand: true,
    demandSignal: "positive",
  });
  assert.equal(v.reject, true);
  assert.ok(v.reasons.includes("scoped_no_change_as_demand"));
});

test("unlabeled x402stats paidCustomers is rejected as series-buyers-as-humans", () => {
  const v = classifyAbsenceAsDemand({
    sourceId: "x402stats",
    paidDemand: true,
    paidCustomers: 1200,
    demandSignal: "paid",
  });
  assert.equal(v.reject, true, JSON.stringify(v.reasons));
  assert.ok(v.reasons.includes("series_buyers_as_unique_humans"));
});

test("top-level notDemand plus demand is rejected", () => {
  const v = classifyAbsenceAsDemand({
    notDemand: true,
    demand: true,
  });
  assert.equal(v.reject, true, JSON.stringify(v.reasons));
  assert.ok(v.reasons.includes("contradiction_not_demand"));
});

test("honest seller-conformance inspection does not invent demand", () => {
  const v = classifyAbsenceAsDemand({
    surface: "seller-conformance",
    sellerConformance: true,
    inspectionNotDemand: true,
    recruitedAgent402: true,
    demand: false,
    paidDemand: false,
    organicDemandProven: false,
    notDemand: true,
    demandSignal: "withheld",
    withheldConclusions: ["demand", "organic_demand", "repeat_demand"],
  });
  assert.equal(v.reject, false, JSON.stringify(v.reasons));
  assert.equal(v.absenceAsDemand, false);
  assert.equal(v.detail.claimedDemand, false);
  assert.equal(v.detail.demandWithheld, true);
});

test("seller-conformance inspection as demand is rejected", () => {
  const v = classifyAbsenceAsDemand({
    surface: "seller-conformance",
    sellerConformance: true,
    sellerConformanceAsDemand: true,
    inspectionAsDemand: true,
    demand: true,
    paidDemand: true,
  });
  assert.equal(v.reject, true);
  assert.ok(v.reasons.includes("absence_as_demand"));
  assert.ok(v.reasons.includes("seller_conformance_as_demand"));
});

test("recruited Agent402 receipt as organic demand is rejected", () => {
  const v = classifyAbsenceAsDemand({
    recruitedAgent402: true,
    recruitedReceiptAsDemand: true,
    organicDemandFromInspection: true,
    demand: true,
    paidDemand: true,
  });
  assert.equal(v.reject, true);
  assert.ok(v.reasons.includes("recruited_receipt_as_demand"));
});

test("issue-evidence notDemandSignal as demand is rejected", () => {
  const v = classifyAbsenceAsDemand({
    surface: "issue-evidence",
    kind: "issue_evidence",
    issueEvidence: true,
    issueEvidenceAsDemand: true,
    notDemandSignal: true,
    demand: true,
    evidence: { kind: "issue_evidence", claims: { notDemand: true } },
  });
  assert.equal(v.reject, true, JSON.stringify(v.reasons));
  assert.ok(v.reasons.includes("issue_evidence_as_demand"));
});

test("nested buyer-setup-trace evidence plus demand is rejected", () => {
  const v = classifyAbsenceAsDemand({
    ok: true,
    recipeId: "buyer-setup-trace",
    payment: { signed: false, paid: false },
    evidence: {
      kind: "buyer_setup_trace",
      claims: { paymentSent: false, notDemand: true },
    },
    demand: true,
  });
  assert.equal(v.reject, true, JSON.stringify(v.reasons));
  assert.ok(v.reasons.includes("unpaid_402_trace_as_demand"));
  assert.equal(v.detail.demandWithheld, true);
});
