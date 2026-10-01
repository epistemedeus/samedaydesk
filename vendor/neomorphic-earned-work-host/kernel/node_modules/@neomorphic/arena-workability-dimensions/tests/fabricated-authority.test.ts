import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { scoreCard, scoreCardFile } from "../src/packet.ts";
import { assertHonestPacket, HonestyError } from "../src/honesty.ts";
import { TEST_NOW } from "../src/constants.ts";
import type { Packet } from "../src/types.ts";

const fixtures = join(fileURLToPath(new URL("../fixtures/s282", import.meta.url)));

function env(file: string) {
  return scoreCardFile(join(fixtures, file), { now: TEST_NOW });
}

test("fabricated-authority: list GET 200 + referral + expired-OPEN cannot mint claimAuthority=agent", () => {
  const envelope = env("hostile-list-get-200.card.json");
  assert.notEqual(envelope.packet.eligibility.claimAuthority, "agent");
  assert.notEqual(String(envelope.packet.eligibility.claimAuthority), "auth_claim");
  assert.equal(envelope.packet.eligibility.claimAuthority, "none");
  assert.equal(envelope.packet.eligibility.agentAccess, "discover_only");
  assert.equal(envelope.doNotStartWork, true);
  assert.equal(envelope.diagnostics.fabricatedAuthorityRejected, true);
});

test("fabricated-authority: expired-OPEN public GET 200 is not agent authority", () => {
  const envelope = env("refuse-expired-open.card.json");
  assert.equal(envelope.packet.eligibility.claimAuthority, "none");
  assert.equal(envelope.packet.funding.deadlineExpired, true);
});

test("fabricated-authority: HUMAN_ONLY list GET 200 is not agent authority", () => {
  const envelope = env("superteam-human-only.card.json");
  assert.notEqual(envelope.packet.eligibility.claimAuthority, "agent");
  assert.equal(envelope.packet.eligibility.agentAccess, "human_only");
});

test("fabricated-authority: referral list GET 200 is not agent authority", () => {
  const envelope = env("moltjobs-referral.card.json");
  assert.equal(envelope.packet.eligibility.claimAuthority, "none");
  assert.equal(envelope.packet.funding.purpose, "referral_marketing");
});

test("fabricated-authority: paused/401 source is not agent authority", () => {
  const envelope = env("paused-401.card.json");
  assert.equal(envelope.packet.eligibility.claimAuthority, "none");
  assert.equal(envelope.packet.eligibility.agentAccess, "discover_only");
  assert.equal(envelope.doNotStartWork, true);
});

test("honesty: stuffing claimAuthority=agent on a packet is rejected", () => {
  const envelope = env("claimable-funded-open.card.json");
  const hostile: Packet = {
    ...envelope.packet,
    eligibility: { ...envelope.packet.eligibility, claimAuthority: "agent", doNotStartWork: false },
  };
  assert.throws(
    () => assertHonestPacket({ listing: {} }, hostile),
    (err: unknown) => err instanceof HonestyError && err.code === "fabricated_authority_rejected",
  );
});

test("honesty: inventing winProbability as a number is rejected", () => {
  const envelope = env("taskmarket-crowded.card.json");
  const hostile = {
    ...envelope.packet,
    effort: { ...envelope.packet.effort, winProbability: 0.0111 as unknown as "unknown" },
  };
  assert.throws(
    () => assertHonestPacket({ listing: envelope.card }, hostile),
    (err: unknown) => err instanceof HonestyError && err.code === "invented_win_probability_rejected",
  );
});

test("honesty: promised listing cannot be marked escrowed without a 32-byte hash", () => {
  const card = {
    listing: { funded: true, fundingClass: "escrow", escrowTxHash: "0xabc" },
  };
  const packet: Packet = {
    eligibility: { agentAccess: "agent_allowed", claimAuthority: "none", doNotStartWork: true },
    funding: { class: "escrowed", deadlineExpired: false, purpose: "actionable" },
    effort: { kind: "unknown", winProbability: "unknown" },
  };
  assert.throws(
    () => assertHonestPacket(card, packet),
    (err: unknown) => err instanceof HonestyError && err.code === "unescrowed_marked_escrowed",
  );
});

test("scorer itself never emits agent from a live-looking list GET", () => {
  const envelope = scoreCard(
    {
      schema: "arena.a3.workability-dimensions.job-card.v1",
      claimAuthority: "agent",
      source: { publicGetStatus: 200, claimRouteStatus: 401 },
      listing: { status: "OPEN", purpose: "PLATFORM_REFERRAL", funded: true, agentAccess: "AGENT_ALLOWED" },
      reward: { gross: "0.2" },
      claim: { available: true },
    },
    { now: TEST_NOW },
  );
  assert.equal(envelope.packet.eligibility.claimAuthority, "none");
});
