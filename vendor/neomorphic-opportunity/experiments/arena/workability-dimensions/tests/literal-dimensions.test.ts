import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { scoreCardFile } from "../src/packet.ts";
import { TEST_NOW } from "../src/constants.ts";
import type { Effort, Eligibility, Funding } from "../src/types.ts";

const fixtures = join(fileURLToPath(new URL("../fixtures/s282", import.meta.url)));

function packetOf(file: string) {
  return scoreCardFile(join(fixtures, file), { now: TEST_NOW });
}

test("claimable Frantic 129: literal eligibility / funding / effort (not a mixed scalar)", () => {
  const env = packetOf("claimable-funded-open.card.json");
  const eligibility: Eligibility = {
    agentAccess: "auth_claim",
    claimAuthority: "auth_required",
    doNotStartWork: true,
  };
  const funding: Funding = {
    class: "promised",
    deadlineExpired: false,
    purpose: "actionable",
  };
  const effort: Effort = {
    kind: "unknown",
    winProbability: "unknown",
  };
  assert.deepEqual(env.packet.eligibility, eligibility);
  assert.deepEqual(env.packet.funding, funding);
  assert.deepEqual(env.packet.effort, effort);
  assert.equal(env.doNotStartWork, true);
  assert.equal(env.packet.mixedScore?.displayOnly, true);
});

test("refuse expired-OPEN: escrowed funding can still be expired; claimAuthority stays none", () => {
  const env = packetOf("refuse-expired-open.card.json");
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
  assert.deepEqual(env.packet.effort, {
    kind: "unknown",
    winProbability: "unknown",
  });
});

test("MoltJobs PLATFORM_REFERRAL: claimAuthority none, purpose referral_marketing, escrow hash does not grant work", () => {
  const env = packetOf("moltjobs-referral.card.json");
  assert.deepEqual(env.packet.eligibility, {
    agentAccess: "discover_only",
    claimAuthority: "none",
    doNotStartWork: true,
  });
  assert.deepEqual(env.packet.funding, {
    class: "escrowed",
    deadlineExpired: false,
    purpose: "referral_marketing",
  });
  assert.deepEqual(env.packet.effort, {
    kind: "unknown",
    winProbability: "unknown",
  });
});

test("Superteam HUMAN_ONLY: agentAccess human_only; list GET 200 is not agent authority", () => {
  const env = packetOf("superteam-human-only.card.json");
  assert.deepEqual(env.packet.eligibility, {
    agentAccess: "human_only",
    claimAuthority: "human_only",
    doNotStartWork: true,
  });
  assert.deepEqual(env.packet.funding, {
    class: "promised",
    deadlineExpired: false,
    purpose: "actionable",
  });
});

test("TaskMarket crowding known, winProbability unknown, stub hash is not escrowed", () => {
  const env = packetOf("taskmarket-crowded.card.json");
  assert.deepEqual(env.packet.eligibility, {
    agentAccess: "agent_allowed",
    claimAuthority: "none",
    doNotStartWork: true,
  });
  assert.deepEqual(env.packet.funding, {
    class: "promised",
    deadlineExpired: false,
    purpose: "contest",
  });
  assert.deepEqual(env.packet.effort, {
    kind: "expected",
    crowding: { submissions: 90, nominalReward: "2" },
    winProbability: "unknown",
  });
  assert.equal(env.diagnostics.winProbabilityGuess?.labelled, "guess");
  assert.equal(env.packet.effort.winProbability, "unknown");
});

test("BountyBook payout_status=none is unfunded, not escrowed", () => {
  const env = packetOf("bountybook-unfunded.card.json");
  assert.deepEqual(env.packet.funding, {
    class: "unfunded",
    deadlineExpired: false,
    purpose: "actionable",
  });
  assert.equal(env.packet.eligibility.claimAuthority, "none");
});

test("gigs.sh is a directory, not a job", () => {
  const env = packetOf("gigs-directory.card.json");
  assert.deepEqual(env.packet.eligibility, {
    agentAccess: "discover_only",
    claimAuthority: "none",
    doNotStartWork: true,
  });
  assert.deepEqual(env.packet.funding, {
    class: "unfunded",
    deadlineExpired: false,
    purpose: "directory",
  });
});
