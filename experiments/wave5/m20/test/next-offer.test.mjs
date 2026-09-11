import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyCohort } from "../lib/cohort.mjs";
import { asObservations, readJson } from "./helpers.mjs";

describe("one next-offer adjustment", () => {
  it("absent field receipts keep the current PR52 offer", () => {
    const readout = classifyCohort(asObservations(readJson("cohorts/await-field.json")));
    assert.equal(readout.nextAdjustment.one, true);
    assert.equal(readout.nextAdjustment.id, "keep-offer-await-field-receipts");
    assert.equal(readout.nextAdjustment.change, "keep-current-pr52-nonsettling-offer");
    assert.equal(readout.nextAdjustment.targetOffer, "vendor-budget-impact");
    assert.ok(Array.isArray(readout.nextAdjustment.remainingLiveSteps));
    assert.equal(readout.nextAdjustment.remainingLiveSteps.length > 0, true);
  });

  it("a paid return keeps the offer narrow", () => {
    const readout = classifyCohort(asObservations(readJson("observations/paid-return-exact-join.json")));
    assert.equal(readout.nextAdjustment.id, "keep-narrow-after-paid-return");
    assert.equal(readout.nextAdjustment.change, "keep-narrow-offer-measure-volume");
  });

  it("first-use friction without useful use tightens the quickstart", () => {
    const readout = classifyCohort(asObservations(readJson("observations/failed-use-missing-inputs.json")));
    assert.equal(readout.nextAdjustment.id, "tighten-quickstart-inputs");
  });

  it("transport failure without useful use holds the offer", () => {
    const readout = classifyCohort(asObservations(readJson("observations/failed-use-engine-crash.json")));
    assert.equal(readout.nextAdjustment.id, "hold-for-engine-transport");
  });

  it("useful use with no later job publishes the binder next step", () => {
    const readout = classifyCohort(asObservations(readJson("observations/useful-use-change.json")));
    assert.equal(readout.nextAdjustment.id, "publish-repeat-next-step");
  });

  it("no-reply without useful use narrows discovery copy", () => {
    const readout = classifyCohort(asObservations(readJson("observations/no-reply.json")));
    assert.equal(readout.nextAdjustment.id, "narrow-discovery-for-no-reply");
  });
});
