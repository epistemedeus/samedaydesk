import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyCohort } from "../lib/cohort.mjs";
import { asObservations, readJson } from "./helpers.mjs";

function row(readout, id) {
  return readout.rows.find((item) => item.id === id);
}

describe("use-class distinctions", () => {
  it("a presented offer with no later observation is no-reply", () => {
    const readout = classifyCohort(asObservations(readJson("observations/no-reply.json")));
    assert.equal(readout.ok, true);
    assert.equal(row(readout, "presented-noreply").useClass, "no-reply");
    assert.equal(readout.independentDemand, false);
  });

  it("sibling-pending is not customer no-reply", () => {
    const readout = classifyCohort(asObservations(readJson("observations/sibling-pending.json")));
    assert.equal(row(readout, "sibling-d27").useClass, null);
    assert.equal(row(readout, "sibling-d27").siblingStatus, "pending");
    assert.equal(readout.counts.noReply, 0);
  });

  it("missing required inputs is failed-use friction, not a crash", () => {
    const readout = classifyCohort(asObservations(readJson("observations/failed-use-missing-inputs.json")));
    const item = row(readout, "failed-missing-inputs");
    assert.equal(item.useClass, "failed-use");
    assert.equal(item.failureKind, "first-use-friction");
    assert.equal(item.transport, "rejected");
    assert.equal(item.analysis.outcome, "not-run");
  });

  it("SAMPLE reserved as a sale is failed-use, not paid-return", () => {
    const readout = classifyCohort(asObservations(readJson("observations/failed-use-sample-sale.json")));
    const item = row(readout, "failed-sample-sale");
    assert.equal(item.useClass, "failed-use");
    assert.equal(item.fields.sample, true);
    assert.notEqual(item.useClass, "paid-return");
  });

  it("engine crash with no JSON is failed-use transport", () => {
    const readout = classifyCohort(asObservations(readJson("observations/failed-use-engine-crash.json")));
    const item = row(readout, "failed-engine-crash");
    assert.equal(item.useClass, "failed-use");
    assert.equal(item.failureKind, "transport");
    assert.equal(item.transport, "engine-crash");
  });

  it("successful caller job with sold false is useful-use", () => {
    const readout = classifyCohort(asObservations(readJson("observations/useful-use-change.json")));
    const item = row(readout, "useful-change");
    assert.equal(item.useClass, "useful-use");
    assert.equal(item.wrapperOk, true);
    assert.equal(item.fields.sold, false);
    assert.equal(item.analysis.outcome, "actionable");
  });

  it("engine JSON refusal is useful-use, not transport failure", () => {
    const readout = classifyCohort(asObservations(readJson("observations/useful-use-valid-refusal.json")));
    const item = row(readout, "useful-refusal");
    assert.equal(item.useClass, "useful-use");
    assert.equal(item.analysis.outcome, "refused");
    assert.equal(item.transport, "ok");
    assert.equal(item.wrapperOk, false);
  });

  it("D01-shaped informational delivery is useful-use", () => {
    const readout = classifyCohort(asObservations(readJson("observations/useful-use-d01-no-change.json")));
    const item = row(readout, "d01-useful-no-change");
    assert.equal(item.useClass, "useful-use");
    assert.equal(item.analysis.outcome, "informational");
    assert.equal(item.delivery.complete, true);
    assert.equal(item.contract, "samedaydesk.paid-useful-jobs.execution.v1");
  });

  it("reserved-fixture second job is useful-use repeat, not paid-return", () => {
    const readout = classifyCohort(asObservations(readJson("observations/fixture-repeat-not-paid.json")));
    const item = row(readout, "repeat-fixture");
    assert.equal(item.useClass, "useful-use");
    assert.equal(item.repeat, true);
    assert.equal(item.payment.state, "reserved-fixture");
    assert.notEqual(item.useClass, "paid-return");
  });

  it("claiming reserved-fixture as paid-return is refused", () => {
    const base = readJson("observations/fixture-repeat-not-paid.json");
    const readout = classifyCohort([{ ...base, claimPaidReturn: true }]);
    assert.equal(readout.ok, false);
    assert.equal(row(readout, "repeat-fixture").code, "fixture_is_not_paid_return");
    assert.equal(readout.counts.paidReturn, 0);
  });

  it("exact settlement join on a later job is paid-return and does not set independent demand", () => {
    const readout = classifyCohort(asObservations(readJson("observations/paid-return-exact-join.json")));
    assert.equal(readout.ok, true);
    assert.equal(row(readout, "first-useful").useClass, "useful-use");
    assert.equal(row(readout, "second-paid-join").useClass, "paid-return");
    assert.equal(row(readout, "second-paid-join").payment.settlementBuyerClass, "independent");
    assert.equal(readout.independentDemand, false);
  });

  it("presentation followed by a job for the same caller is not no-reply", () => {
    const readout = classifyCohort(asObservations(readJson("cohorts/presented-then-used.json")));
    assert.equal(row(readout, "presented-then-used").useClass, null);
    assert.equal(row(readout, "presented-then-used").reply, "observed");
    assert.equal(row(readout, "useful-change").useClass, "useful-use");
    assert.equal(readout.counts.noReply, 0);
  });

  it("buyerClass independent on a run is refused", () => {
    const readout = classifyCohort(asObservations(readJson("reject/independent-run-label.json")));
    assert.equal(readout.ok, false);
    assert.equal(row(readout, "bad-independent").code, "analytics_count_is_independent_demand");
  });

  it("early-x402-revenue cannot join as this job's paid return", () => {
    const readout = classifyCohort(asObservations(readJson("reject/early-x402-join.json")));
    assert.equal(readout.ok, false);
    assert.equal(row(readout, "early-x402-as-return").code, "settlement_is_not_this_job");
    assert.equal(readout.counts.paidReturn, 0);
  });

  it("8.105 USDC cannot be this job's paid return", () => {
    const readout = classifyCohort(asObservations(readJson("reject/cited-banked.json")));
    assert.equal(readout.ok, false);
    assert.equal(row(readout, "cited-banked").code, "cited_banked_usdc_is_not_paid_return");
  });

  it("sold true without a settlement join is refused", () => {
    const readout = classifyCohort(asObservations(readJson("reject/sold-without-join.json")));
    assert.equal(readout.ok, false);
    assert.equal(row(readout, "sold-without-join").code, "sold_without_settlement_join");
  });
});
