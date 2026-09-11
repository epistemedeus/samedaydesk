import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ingestAdapter, TEST_NOW, FIX } from "./helpers.mjs";
import {
  attachExperience,
  separateSelfReportedFromVerified,
  normalizeExperience,
} from "../src/experience.mjs";
import { compactEvents, LIFECYCLE_EVENTS } from "../src/events.mjs";
import { toInteropV0 } from "../src/interop.mjs";
import { FUNDING, SCHEMA_INTEROP, DATA_LABELS } from "../src/constants.mjs";
import { atomicDecimalString } from "../src/money.mjs";

const FUNDING_ENUM = Object.values(FUNDING);
const SIX_TYPES = ["discovery", "claim", "submit", "accept", "pay", "repeat"];

function labelledLog(taskId) {
  return [
    {
      type: "claim",
      taskId,
      at: TEST_NOW,
      dataLabel: "synthetic-edge",
      payload: { reservationId: null, note: "labelled synthetic; not a real claim" },
    },
    {
      type: "submit",
      taskId,
      at: TEST_NOW,
      dataLabel: "synthetic-edge",
      payload: { artifactRef: "fixture://artifact" },
    },
    {
      type: "accept",
      taskId,
      at: TEST_NOW,
      dataLabel: "synthetic-edge",
      payload: { verdict: "needs_review" },
    },
    {
      type: "pay",
      taskId,
      at: TEST_NOW,
      dataLabel: "synthetic-edge",
      payload: { payout: "unknown" },
    },
    {
      type: "repeat",
      taskId,
      at: TEST_NOW,
      dataLabel: "synthetic-edge",
      payload: {},
    },
  ];
}

test("self-reported experience is not verifiedCompletion and not verifiedPayout", () => {
  const raw = {
    selfReported: { present: true, summary: "I completed similar work last month." },
    verifiedCompletion: { present: false, evidence: null },
    verifiedPayout: { present: false, evidence: null },
  };
  const exp = normalizeExperience(raw);
  assert.equal(exp.selfReported.present, true);
  assert.equal(exp.selfReported.summary, "I completed similar work last month.");
  assert.equal(exp.verifiedCompletion.present, false);
  assert.equal(exp.verifiedCompletion.evidence, null);
  assert.equal(exp.verifiedPayout.present, false);
  assert.equal(exp.verifiedPayout.evidence, null);

  const sep = separateSelfReportedFromVerified(raw);
  assert.equal(sep.selfReportedOnly, true);
  assert.equal(sep.verifiedCompletion, false);
  assert.equal(sep.verifiedPayout, false);
  assert.equal(sep.mixed, false);
  assert.match(sep.note, /not verified completion/i);
  assert.match(sep.note, /not verified payout/i);

  const claimedWithoutEvidence = normalizeExperience({
    selfReported: { present: true, summary: "I did it" },
    verifiedCompletion: { present: true, evidence: null },
    verifiedPayout: { present: true },
  });
  assert.equal(claimedWithoutEvidence.selfReported.present, true);
  assert.equal(claimedWithoutEvidence.verifiedCompletion.present, false);
  assert.equal(claimedWithoutEvidence.verifiedPayout.present, false);

  const sepBare = separateSelfReportedFromVerified({
    selfReported: { present: true, summary: "I did it" },
  });
  assert.equal(sepBare.selfReportedOnly, true);
  assert.equal(sepBare.verifiedCompletion, false);
  assert.equal(sepBare.verifiedPayout, false);
});

test("contributor effort hours ignored unless declared:true", () => {
  const undeclared = normalizeExperience({
    contributorEffort: { declared: false, hours: "8" },
  });
  assert.equal(undeclared.contributorEffort.declared, false);
  assert.equal(undeclared.contributorEffort.unknown, true);
  assert.equal(undeclared.contributorEffort.hours, null);

  const omitted = normalizeExperience({
    contributorEffort: { hours: "4.5" },
  });
  assert.equal(omitted.contributorEffort.declared, false);
  assert.equal(omitted.contributorEffort.unknown, true);
  assert.equal(omitted.contributorEffort.hours, null);

  const declared = normalizeExperience({
    contributorEffort: { declared: true, hours: "2.5" },
  });
  assert.equal(declared.contributorEffort.declared, true);
  assert.equal(declared.contributorEffort.unknown, false);
  assert.equal(declared.contributorEffort.hours, "2.5");
  assert.equal(typeof declared.contributorEffort.hours, "string");
});

test("paid review amount ignored unless declared:true", () => {
  const undeclared = normalizeExperience({
    paidReview: { declared: false, amount: "99" },
  });
  assert.equal(undeclared.paidReview.declared, false);
  assert.equal(undeclared.paidReview.unknown, true);
  assert.equal(undeclared.paidReview.amount, null);

  const omitted = normalizeExperience({
    paidReview: { amount: "15" },
  });
  assert.equal(omitted.paidReview.declared, false);
  assert.equal(omitted.paidReview.unknown, true);
  assert.equal(omitted.paidReview.amount, null);

  const declared = normalizeExperience({
    paidReview: { declared: true, amount: "15" },
  });
  assert.equal(declared.paidReview.declared, true);
  assert.equal(declared.paidReview.unknown, false);
  assert.equal(declared.paidReview.amount, "15");
  assert.equal(typeof declared.paidReview.amount, "string");
  assert.equal(atomicDecimalString(declared.paidReview.amount), declared.paidReview.amount);
});

test("compactEvents emits exactly discovery,claim,submit,accept,pay,repeat; discovery from records alone", async () => {
  assert.deepEqual(LIFECYCLE_EVENTS, SIX_TYPES);

  const r = await ingestAdapter("frantic", "frantic-board.open.fixture.json");
  const rec = r.records.find((x) => x.source.nativeId === "130");
  assert.ok(rec);

  const fromRecordsAlone = compactEvents({ records: [rec], now: TEST_NOW, experienceLog: [] });
  assert.deepEqual(
    fromRecordsAlone.map((e) => e.type),
    ["discovery"],
  );
  assert.equal(fromRecordsAlone.length, 1);
  assert.equal(fromRecordsAlone[0].taskId, rec.taskId);
  assert.equal(fromRecordsAlone[0].dataLabel, rec.dataLabel);

  const junk = [
    { type: "discovery", taskId: rec.taskId, at: TEST_NOW, dataLabel: "synthetic-edge", payload: {} },
    { type: "analytics", taskId: rec.taskId, at: TEST_NOW, dataLabel: "synthetic-edge", payload: {} },
  ];
  const events = compactEvents({
    records: [rec],
    now: TEST_NOW,
    experienceLog: [...labelledLog(rec.taskId), ...junk],
  });
  assert.deepEqual(
    events.map((e) => e.type),
    SIX_TYPES,
  );
  assert.equal(events.length, 6);
  assert.deepEqual([...new Set(events.map((e) => e.type))], SIX_TYPES);
  for (const e of events) {
    assert.equal(e.schema, "s277.bounty-intelligence.event.v1");
    assert.ok(e.eventId.startsWith("evt_"));
    assert.equal(e.taskId, rec.taskId);
    assert.ok(DATA_LABELS.includes(e.dataLabel));
  }
  for (const stage of events.slice(1)) {
    assert.equal(stage.dataLabel, "synthetic-edge");
  }
});

test("toInteropV0: amount string|null never number; funding enum; contributor ≠ payout dest; one idempotencyKey; reservation unknown unless overlay; dataLabel present", async () => {
  const frantic = await ingestAdapter("frantic", "frantic-board.open.fixture.json");
  const rec = frantic.records.find((x) => x.source.nativeId === "130");
  assert.ok(rec);

  const overlay = {
    contributorPublicId: "agent:public-1",
    payoutDestination: "0xnot-the-public-id",
    idempotencyKey: "task:130:once",
  };
  const v0 = toInteropV0(rec, overlay);
  assert.equal(v0.schema, SCHEMA_INTEROP);
  assert.ok(v0.dataLabel);
  assert.equal(typeof v0.dataLabel, "string");
  assert.ok(DATA_LABELS.includes(v0.dataLabel));
  assert.equal(v0.dataLabel, rec.dataLabel);

  assert.ok(v0.reward.amount === null || typeof v0.reward.amount === "string");
  assert.notEqual(typeof v0.reward.amount, "number");
  assert.equal(typeof v0.reward.amount, "string");
  assert.equal(atomicDecimalString(v0.reward.amount), v0.reward.amount);
  const roundTrip = JSON.parse(JSON.stringify(v0));
  assert.notEqual(typeof roundTrip.reward.amount, "number");

  assert.ok(FUNDING_ENUM.includes(v0.funding));
  assert.equal(v0.contributorPublicId, "agent:public-1");
  assert.equal(v0.payoutDestination, "0xnot-the-public-id");
  assert.notEqual(v0.contributorPublicId, v0.payoutDestination);

  const idempotencyKeys = Object.keys(v0).filter((k) => /idempotency/i.test(k));
  assert.deepEqual(idempotencyKeys, ["idempotencyKey"]);
  assert.equal(typeof v0.idempotencyKey, "string");
  assert.equal(v0.idempotencyKey, "task:130:once");
  assert.equal(Array.isArray(v0.idempotencyKey), false);

  assert.equal(v0.reservation.unknown, true);
  assert.equal(v0.reservation.active, false);

  const withReservation = toInteropV0(rec, {
    ...overlay,
    reservation: { id: "resv_labelled", expiry: TEST_NOW, active: true, unknown: false },
  });
  assert.equal(withReservation.reservation.unknown, false);
  assert.equal(withReservation.reservation.active, true);
  assert.equal(withReservation.reservation.id, "resv_labelled");

  const defaultKey = toInteropV0(rec);
  assert.equal(defaultKey.idempotencyKey, `${rec.taskId}:${rec.termsVersion}`);
  assert.equal(defaultKey.reservation.unknown, true);

  const github = await ingestAdapter("github-issues", "github-issues.open.fixture.json");
  assert.ok(github.records.length >= 1);
  const gh = toInteropV0(github.records[0], {
    contributorPublicId: "github:example",
    payoutDestination: "wallet:not-github",
  });
  assert.equal(gh.reward.amount, null);
  assert.notEqual(typeof gh.reward.amount, "number");
  assert.ok(FUNDING_ENUM.includes(gh.funding));
  assert.ok(gh.dataLabel);
  assert.notEqual(gh.contributorPublicId, gh.payoutDestination);
  assert.equal(gh.reservation.unknown, true);
  assert.equal(typeof gh.idempotencyKey, "string");
});

test("firstDollar and walletlessEligibility stay unknown on frantic/moltjobs/github/neomorphic fixtures", async () => {
  const sources = [
    ["frantic", "frantic-board.open.fixture.json"],
    ["moltjobs", "moltjobs-list.open.fixture.json"],
    ["github-issues", "github-issues.open.fixture.json"],
    ["neomorphic-schedule", "neomorphic-schedule.fixture.json"],
  ];
  for (const [adapter, file] of sources) {
    const r = await ingestAdapter(adapter, file);
    assert.ok(r.records.length >= 1, adapter);
    for (const rec of r.records) {
      assert.equal(rec.claimability.firstDollar, "unknown", `${adapter} firstDollar`);
      assert.equal(rec.claimability.walletlessEligibility, "unknown", `${adapter} walletlessEligibility`);
      assert.ok(rec.unknowns.includes("claimability.firstDollar"), `${adapter} unknowns firstDollar`);
      assert.ok(
        rec.unknowns.includes("claimability.walletlessEligibility"),
        `${adapter} unknowns walletlessEligibility`,
      );
    }
  }
});

test("experience overlay attaches self-report without promoting verified fields", async () => {
  const r = await ingestAdapter("frantic", "frantic-board.open.fixture.json");
  const overlayDoc = JSON.parse(readFileSync(join(FIX, "experience-overlay.json"), "utf8"));
  const rec = r.records.find((x) => x.source.nativeId === "130");
  const attached = attachExperience(rec, overlayDoc.overlays[0]);
  assert.equal(attached.experience.selfReported.present, true);
  assert.equal(attached.experience.verifiedCompletion.present, false);
  assert.equal(attached.experience.verifiedPayout.present, false);
  const sep = separateSelfReportedFromVerified(attached.experience);
  assert.equal(sep.selfReportedOnly, true);
  assert.equal(sep.verifiedCompletion, false);
  assert.equal(sep.verifiedPayout, false);
});
