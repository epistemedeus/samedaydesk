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
