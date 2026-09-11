import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ingestAdapter, TEST_NOW, FIX } from "./helpers.mjs";
import { attachExperience, separateSelfReportedFromVerified, normalizeExperience } from "../src/experience.mjs";
import { compactEvents, LIFECYCLE_EVENTS } from "../src/events.mjs";
import { toInteropV0 } from "../src/interop.mjs";
import { atomicDecimalString } from "../src/money.mjs";

test("self-reported is not verified completion or payout", () => {
  const sep = separateSelfReportedFromVerified({
    selfReported: { present: true, summary: "I did it" },
    verifiedCompletion: { present: false },
    verifiedPayout: { present: false },
  });
  assert.equal(sep.selfReportedOnly, true);
  assert.equal(sep.verifiedCompletion, false);
  assert.equal(sep.verifiedPayout, false);
});

test("verified completion requires evidence; effort must be declared", () => {
  const fake = normalizeExperience({
    verifiedCompletion: { present: true, evidence: null },
    contributorEffort: { declared: false, hours: "3" },
    paidReview: { declared: false, amount: "10" },
  });
  assert.equal(fake.verifiedCompletion.present, false);
  assert.equal(fake.contributorEffort.declared, false);
  assert.equal(fake.contributorEffort.unknown, true);
  assert.equal(fake.contributorEffort.hours, null);
  assert.equal(fake.paidReview.unknown, true);
  const real = normalizeExperience({
    verifiedCompletion: { present: true, evidence: "receipt:abc" },
    contributorEffort: { declared: true, hours: "2.5" },
    paidReview: { declared: true, amount: "15" },
  });
  assert.equal(real.verifiedCompletion.present, true);
  assert.equal(real.contributorEffort.hours, "2.5");
  assert.equal(real.paidReview.amount, "15");
});

test("experience overlay attaches by adapter+nativeId without mixing verified", async () => {
  const r = await ingestAdapter("frantic", "frantic-board.open.fixture.json");
  const overlay = JSON.parse(readFileSync(join(FIX, "experience-overlay.json"), "utf8"));
  const rec = r.records.find((x) => x.source.nativeId === "130");
  const attached = attachExperience(rec, overlay.overlays[0]);
  assert.equal(attached.experience.selfReported.present, true);
  assert.equal(attached.experience.verifiedCompletion.present, false);
  assert.equal(attached.experience.contributorEffort.declared, true);
  assert.equal(attached.experience.contributorEffort.hours, "2");
});

test("compact events cover discovery→claim→submit→accept→pay→repeat", async () => {
  assert.deepEqual(LIFECYCLE_EVENTS, ["discovery", "claim", "submit", "accept", "pay", "repeat"]);
  const r = await ingestAdapter("frantic", "frantic-board.open.fixture.json");
  const rec = r.records.find((x) => x.source.nativeId === "130");
  const events = compactEvents({
    records: [rec],
    now: TEST_NOW,
    experienceLog: [
      { type: "claim", taskId: rec.taskId, at: TEST_NOW, dataLabel: "synthetic-edge", payload: { note: "labelled synthetic" } },
      { type: "submit", taskId: rec.taskId, at: TEST_NOW, dataLabel: "synthetic-edge", payload: { artifactRef: "fixture://artifact" } },
      { type: "accept", taskId: rec.taskId, at: TEST_NOW, dataLabel: "synthetic-edge", payload: { verdict: "needs_review" } },
      { type: "pay", taskId: rec.taskId, at: TEST_NOW, dataLabel: "synthetic-edge", payload: { payout: "unknown" } },
      { type: "repeat", taskId: rec.taskId, at: TEST_NOW, dataLabel: "synthetic-edge", payload: {} },
    ],
  });
  const types = events.map((e) => e.type);
  for (const t of LIFECYCLE_EVENTS) assert.ok(types.includes(t), t);
  for (const e of events) {
    assert.equal(e.schema, "s277.bounty-intelligence.event.v1");
    assert.ok(e.eventId.startsWith("evt_"));
  }
});

test("interop v0: opaque taskId, atomic decimal, contributor ≠ payout dest, labelled", async () => {
  const r = await ingestAdapter("frantic", "frantic-board.open.fixture.json");
  const rec = r.records.find((x) => x.source.nativeId === "130");
  const v0 = toInteropV0(rec, {
    contributorPublicId: "agent:public-1",
    payoutDestination: "0xnot-the-public-id",
  });
  assert.equal(v0.schema, "s277.bounty-intelligence.interop.v0");
  assert.equal(v0.taskId, rec.taskId);
  assert.equal(v0.termsVersion, rec.termsVersion);
  assert.equal(typeof v0.reward.amount, "string");
  assert.equal(atomicDecimalString(v0.reward.amount), v0.reward.amount);
  assert.notEqual(typeof v0.reward.amount, "number");
  assert.ok(["unfunded", "reserved", "released", "unknown"].includes(v0.funding));
  assert.equal(v0.contributorPublicId, "agent:public-1");
  assert.notEqual(v0.contributorPublicId, v0.payoutDestination);
  assert.equal(v0.reservation.unknown, true);
  assert.equal(v0.reservation.active, false);
  assert.ok(v0.idempotencyKey);
  assert.equal(v0.dataLabel, rec.dataLabel);
});

test("money helper refuses floats and bools", () => {
  assert.equal(atomicDecimalString(1.5), null);
  assert.equal(atomicDecimalString(true), null);
  assert.equal(atomicDecimalString("1.50"), "1.5");
  assert.equal(atomicDecimalString(3), "3");
});
