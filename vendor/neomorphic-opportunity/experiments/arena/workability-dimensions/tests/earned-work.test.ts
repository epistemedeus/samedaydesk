import assert from "node:assert/strict";
import test from "node:test";
import { cardFromEarnedWorkTask } from "../src/earned-work.ts";
import { scoreCard } from "../src/packet.ts";
import { workGateFromDimensions } from "../src/mixed-score.ts";

test("F01 reserved local budget is unfunded IOU; GET 200 is not claimAuthority=agent", () => {
  const card = cardFromEarnedWorkTask({
    id: "tsk_test",
    title: "walletless",
    provenance: "fixture",
    lifecycle: "open",
    fundingState: "reserved",
    payoutState: "none",
    termsVersion: "sha256:c82f232dd9d63261b91d32234abf3e0f655d99182cde7c66b7de5c8c787ea31f",
    constraints: { slotLimit: 1 },
    reservation: null,
  });
  assert.equal(card.walletlessIou, true);
  assert.equal(card.listing?.escrowTxHash, null);
  assert.equal(card.source?.publicGetStatus, 200);

  const env = scoreCard(card);
  assert.equal(env.packet.funding.class, "unfunded");
  assert.notEqual(env.packet.funding.class, "escrowed");
  assert.notEqual(env.packet.eligibility.claimAuthority, "agent");
  assert.equal(env.packet.eligibility.claimAuthority, "auth_required");
  assert.equal(env.packet.effort.winProbability, "unknown");
  assert.equal(env.packet.mixedScore?.displayOnly, true);
  assert.equal(env.doNotStartWork, true);
  assert.equal(workGateFromDimensions(env.packet).startWork, false);
});
