import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CLOCK, env, fittingPost, tempJourney } from "./helpers.mjs";
import { claimWork, postWork, recoverWork } from "../src/commands.mjs";
import { LOCK_SCHEMA } from "../src/constants.mjs";
import { lockPathFor } from "../src/lock.mjs";
import { readJourney } from "../src/store.mjs";

const cli = fileURLToPath(new URL("../cli.mjs", import.meta.url));

test("a dead pid does not authorize automatic unlock", () => {
  const journeyPath = tempJourney();
  assert.equal(postWork(fittingPost(), env(journeyPath)).ok, true);
  assert.equal(claimWork({ taskId: "heading-extract", holderId: "agent-a" }, env(journeyPath)).ok, true);
  const lockPath = lockPathFor(journeyPath);
  writeFileSync(lockPath, JSON.stringify({
    schema: LOCK_SCHEMA,
    holderId: "agent-a",
    fencing: "dead-pid-fencing-token",
    purpose: "claim",
    acquiredAt: CLOCK,
    pid: 999999,
    automaticUnlock: false,
  }));
  const automatic = recoverWork({ automatic: true, fencing: "dead-pid-fencing-token", holderId: "agent-a" }, env(journeyPath));
  assert.equal(automatic.ok, false);
  assert.equal(automatic.reason, "automatic_unlock_refused");
  assert.equal(automatic.unlocked, false);
  const kept = recoverWork({}, env(journeyPath));
  assert.equal(kept.ok, true);
  assert.equal(kept.recovery, "retained_lock_kept");
  assert.equal(kept.unlocked, false);
  assert.equal(kept.retainedLock.pid, 999999);
  const wrong = recoverWork({
    explicitRelease: true,
    holderId: "agent-a",
    fencing: "other-fencing-token",
  }, env(journeyPath));
  assert.equal(wrong.reason, "fencing_mismatch");
  const claimWhileHeld = claimWork({ taskId: "heading-extract", holderId: "agent-b" }, env(journeyPath));
  assert.equal(claimWhileHeld.reason, "retained_lock_refused");
  assert.equal(claimWhileHeld.automaticUnlock, false);
  const released = recoverWork({
    explicitRelease: true,
    holderId: "agent-a",
    fencing: "dead-pid-fencing-token",
  }, env(journeyPath));
  assert.equal(released.ok, true, JSON.stringify(released));
  assert.equal(released.recovery, "explicit_release");
  assert.equal(released.occupancyChanged, false);
  const journey = readJourney(journeyPath);
  assert.equal(journey.journey.occupancy.holderId, "agent-a");
  const stillTaken = claimWork({ taskId: "heading-extract", holderId: "agent-b" }, env(journeyPath));
  assert.equal(stillTaken.reason, "double_claim");
});

test("concurrent claims do not both occupy and do not steal the retained lock", async () => {
  const journeyPath = tempJourney();
  assert.equal(postWork(fittingPost(), env(journeyPath)).ok, true);
  const run = (holderId) => new Promise((resolve) => {
    const child = spawn(process.execPath, [
      cli,
      "claim",
      "--journey",
      journeyPath,
      "--clock",
      CLOCK,
      "--input",
      writeClaim(holderId),
    ], {
      env: { ...process.env, TWO_SIDED_WORK_LOCK_HOLD_MS: "400" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => resolve({ status, stdout, stderr, holderId }));
  });
  const [first, second] = await Promise.all([run("agent-a"), run("agent-b")]);
  const results = [first, second];
  const winners = results.filter((result) => result.status === 0);
  const losers = results.filter((result) => result.status !== 0);
  assert.equal(winners.length, 1, JSON.stringify(results));
  assert.equal(losers.length, 1);
  const loserBody = JSON.parse(losers[0].stderr);
  assert.equal(loserBody.reason, "retained_lock_refused");
  assert.equal(loserBody.automaticUnlock, false);
  const journey = readJourney(journeyPath);
  assert.equal(journey.journey.occupancy.holderId, winners[0].holderId);
  assert.notEqual(journey.journey.occupancy.holderId, losers[0].holderId);
});

function writeClaim(holderId) {
  const path = tempJourney().replace(/journey\.json$/, `claim-${holderId}.json`);
  writeFileSync(path, JSON.stringify({ taskId: "heading-extract", holderId }));
  return path;
}
