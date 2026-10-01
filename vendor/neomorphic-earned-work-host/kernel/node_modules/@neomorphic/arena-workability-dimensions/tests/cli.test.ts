import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const pack = join(fileURLToPath(new URL("..", import.meta.url)));
const example = join(pack, "examples/score-s282-fixtures.ts");
const bin = join(pack, "bin/workability-dimensions.mjs");
const TEST_NOW = "2026-09-11T15:00:00.000Z";

function nodeTs(script: string, args: string[] = []) {
  return spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", script, ...args],
    { encoding: "utf8" },
  );
}

test("caller-first example prints three dimensions for claimable and refuse", () => {
  const result = nodeTs(example);
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.claimable.doNotStartWork, true);
  assert.deepEqual(body.claimable.eligibility, {
    agentAccess: "auth_claim",
    claimAuthority: "auth_required",
    doNotStartWork: true,
  });
  assert.deepEqual(body.claimable.funding, {
    class: "promised",
    deadlineExpired: false,
    purpose: "actionable",
  });
  assert.deepEqual(body.claimable.effort, {
    kind: "unknown",
    winProbability: "unknown",
  });
  assert.equal(body.claimable.mixedScore.displayOnly, true);
  assert.deepEqual(body.refuse.eligibility, {
    agentAccess: "agent_allowed",
    claimAuthority: "none",
    doNotStartWork: true,
  });
  assert.equal(body.refuse.funding.deadlineExpired, true);
  assert.equal(body.refuse.funding.class, "escrowed");
});

test("CLI packet --card prints Packet + doNotStartWork", () => {
  const result = spawnSync(
    process.execPath,
    [bin, "packet", "--card", join(pack, "fixtures/s282/refuse-expired-open.card.json"), "--now", TEST_NOW],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.doNotStartWork, true);
  assert.equal(body.packet.eligibility.claimAuthority, "none");
  assert.equal(body.packet.funding.deadlineExpired, true);
});
