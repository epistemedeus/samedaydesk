import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { scoreCardFile } from "../src/packet.ts";
import { mixedScoreOnlyGate, workGateFromDimensions } from "../src/mixed-score.ts";
import { TEST_NOW } from "../src/constants.ts";

const fixtures = join(fileURLToPath(new URL("../fixtures/s282", import.meta.url)));

test("mixed scalar is not the gate when dimensions contradict it (HUMAN_ONLY)", () => {
  const env = scoreCardFile(join(fixtures, "superteam-human-only.card.json"), { now: TEST_NOW });
  assert.equal(env.packet.mixedScore?.displayOnly, true);
  assert.ok(
    typeof env.packet.mixedScore?.value === "number",
    "display sugar exists so a mixed-score-only gate could be tempted",
  );
  assert.ok(
    mixedScoreOnlyGate(env.packet),
    "naive mixed score looks 'high' on GET 200 + OPEN + funded + reward",
  );
  const gate = workGateFromDimensions(env.packet);
  assert.equal(gate.startWork, false);
  assert.equal(gate.ignoredMixedScore, true);
  assert.ok(gate.reasons.includes("agentAccess=human_only"));
  assert.deepEqual(env.packet.eligibility, {
    agentAccess: "human_only",
    claimAuthority: "human_only",
    doNotStartWork: true,
  });
});

test("mixed scalar is not the gate for referral escrow (dimensions contradict a high look)", () => {
  const env = scoreCardFile(join(fixtures, "moltjobs-referral.card.json"), { now: TEST_NOW });
  assert.equal(env.packet.mixedScore?.displayOnly, true);
  const gate = workGateFromDimensions(env.packet);
  assert.equal(gate.startWork, false);
  assert.equal(env.packet.funding.purpose, "referral_marketing");
  assert.equal(env.packet.eligibility.claimAuthority, "none");
});

test("claimable fixture mixedScore is displayOnly and does not override doNotStartWork", () => {
  const env = scoreCardFile(join(fixtures, "claimable-funded-open.card.json"), { now: TEST_NOW });
  assert.equal(env.packet.mixedScore?.displayOnly, true);
  assert.equal(workGateFromDimensions(env.packet).startWork, false);
  assert.equal(env.doNotStartWork, true);
  assert.equal(env.packet.funding.class, "promised");
});
