import assert from "node:assert/strict";
import test from "node:test";
import { classifyAbsenceAsDemand, claimDemand, demandWithheld, finiteNumber } from "./lib/classify.mjs";

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

test("nested claims.demand on documented-unavailable x402scan is rejected", () => {
  const v = classifyAbsenceAsDemand({
    sourceId: "x402scan",
    documentedUnavailable: true,
    called: false,
    paidActivity: { available: false },
    claims: { demand: true, paidDemand: true, demandCount: 9 },
  });
  assert.equal(v.reject, true, JSON.stringify(v.reasons));
  assert.equal(v.detail.claimedDemand, true);
  assert.ok(v.reasons.includes("x402scan_unavailable_as_demand"));
  assert.equal(claimDemand({ claims: { demand: true } }), true);
});

test("nested claims.demand plus notDemand is a contradiction reject", () => {
  const v = classifyAbsenceAsDemand({
    claims: { demand: true, notDemand: true },
  });
  assert.equal(v.reject, true, JSON.stringify(v.reasons));
  assert.ok(v.reasons.includes("contradiction_not_demand"));
});

test("numeric-string x402stats paidCustomers is rejected", () => {
  const v = classifyAbsenceAsDemand({
    sourceId: "x402stats",
    paidCustomers: "1200",
  });
  assert.equal(v.reject, true, JSON.stringify(v.reasons));
  assert.ok(v.reasons.includes("series_buyers_as_unique_humans"));
});

test("non-finite and bool counts are not numeric demand", () => {
  assert.equal(finiteNumber(true), null);
  assert.equal(finiteNumber(NaN), null);
  assert.equal(finiteNumber(Infinity), null);
  assert.equal(finiteNumber("0x10"), null);
  assert.equal(finiteNumber("1200"), 1200);
  const inf = classifyAbsenceAsDemand({
    sourceId: "x402stats",
    paidCustomers: Infinity,
  });
  assert.equal(inf.detail.claimedDemand, false, JSON.stringify(inf));
  assert.equal(inf.reject, false);
  const boolCount = classifyAbsenceAsDemand({
    sourceId: "x402stats",
    paidCustomers: true,
  });
  assert.equal(boolCount.reject, true, JSON.stringify(boolCount.reasons));
  assert.ok(boolCount.reasons.includes("series_buyers_as_unique_humans"));
});

test("unlabeled moltjobs conversionFunnel is rejected as liquidity-as-funnel", () => {
  const v = classifyAbsenceAsDemand({
    sourceId: "moltjobs",
    conversionFunnel: true,
    demand: true,
    paidDemand: true,
    paidCustomers: 62,
  });
  assert.equal(v.reject, true, JSON.stringify(v.reasons));
  assert.ok(v.reasons.includes("liquidity_funnel_as_demand"));
});
