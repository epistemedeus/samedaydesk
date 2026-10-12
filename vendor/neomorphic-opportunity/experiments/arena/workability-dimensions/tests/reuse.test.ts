import assert from "node:assert/strict";
import test from "node:test";
import { loadIntakeSample } from "../src/intake.ts";
import { scoreCard } from "../src/packet.ts";
import { TEST_NOW } from "../src/constants.ts";
import { HONESTY_NOTES, REUSE_PINS } from "../src/reuse.ts";

test("reuse: capability-preflight honesty notes import at pin 45391e02", () => {
  assert.equal(REUSE_PINS.capabilityPreflight, "45391e02");
  assert.equal(REUSE_PINS.capabilityPreflightPresent, true);
  assert.ok(Array.isArray(HONESTY_NOTES) && HONESTY_NOTES.length > 0);
  assert.ok(REUSE_PINS.externalJobIntakePresent);
  assert.ok(REUSE_PINS.outsideOperatorFirstJobPresent);
});

test("reuse: intake escrow sample is expired-OPEN at TEST_NOW; claimAuthority none", () => {
  const card = loadIntakeSample("escrow-job");
  assert.ok(card);
  const env = scoreCard(card, { now: TEST_NOW });
  assert.deepEqual(env.packet.eligibility, {
    agentAccess: "agent_allowed",
    claimAuthority: "none",
    doNotStartWork: true,
  });
  assert.deepEqual(env.packet.funding, {
    class: "escrowed",
    deadlineExpired: true,
    purpose: "actionable",
  });
  assert.equal(env.packet.effort.winProbability, "unknown");
});
