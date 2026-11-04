// Independent cases for the received EMBED pin. This file does not edit that pin.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const pin = process.env.AGL_EMBED_ROOT;
if (!pin) throw new Error("AGL_EMBED_ROOT is required");

const { lookupCapabilityOwner, maintainedCapabilityFromDocument } = await import(
  pathToFileURL(join(pin, "server/lib/observatory/maintained-capability.js")).href
);
const discovery = JSON.parse(readFileSync(
  join(pin, "client/public/discovery/useful-jobs.json"),
  "utf8",
));

const EXACT = "feed-agenda";
const STILL_OWNED = "route-table-diff";

function withoutJob(doc, jobId) {
  const next = structuredClone(doc);
  next.jobs = next.jobs.filter((id) => id !== jobId);
  next.releaseScope.newlyReviewedJobIds = next.releaseScope.newlyReviewedJobIds.filter((id) => id !== jobId);
  next.releaseScope.inheritedJobIds = next.releaseScope.inheritedJobIds.filter((id) => id !== jobId);
  return next;
}

test("an exact id hit on feed-agenda names the inherited owner and the call argv", () => {
  const owned = lookupCapabilityOwner({
    jobId: EXACT,
    skill: EXACT,
    need: EXACT,
  });
  assert.equal(owned.outcome, "owned");
  assert.equal(owned.reason, null);
  assert.equal(owned.jobId, EXACT);
  assert.equal(owned.review, "inherited");
  assert.equal(owned.version, "1.4.7");
  assert.equal(owned.version, discovery.releaseScope.approvedVersion);
  assert.deepEqual(owned.owner, {
    package: "useful-jobs",
    repo: "epistemedeus/samedaydesk",
  });
  assert.deepEqual(owned.callRecipe.argv, ["node", "bin/useful-jobs.mjs", "run", EXACT]);
  assert.equal(owned.callRecipe.cwdFromAcquireStdout, true);
  assert.equal(owned.purchaseAuthority, false);
  assert.equal(owned.hostedAcquisition, false);
  assert.equal(owned.execution, "offline_caller_supplied_artifacts");
  assert.throws(() => { owned.callRecipe.argv.push("extra"); });
});

test("a lower version and a trailing-space version are version mismatches", () => {
  const lower = structuredClone(discovery);
  lower.version = "1.4.6";
  const lowered = lookupCapabilityOwner(EXACT, lower);
  assert.equal(lowered.outcome, "no-fit");
  assert.equal(lowered.reason, "version_not_approved");
  assert.equal(lowered.owner, null);
  assert.equal(lowered.version, null);
  assert.equal(lowered.callRecipe, null);
  assert.equal(JSON.stringify(lowered).includes("1.4.6"), false);
  assert.throws(() => maintainedCapabilityFromDocument(lower), /useful_jobs_discovery_invalid/);

  const spaced = structuredClone(discovery);
  spaced.version = "1.4.7 ";
  const spacedResult = lookupCapabilityOwner({ jobId: EXACT }, spaced);
  assert.equal(spacedResult.outcome, "no-fit");
  assert.equal(spacedResult.reason, "version_not_approved");
  assert.equal(JSON.stringify(spacedResult).includes("1.4.7 "), false);

  const live = lookupCapabilityOwner(EXACT);
  assert.equal(live.outcome, "owned");
  assert.equal(live.version, "1.4.7");
});

test("removing feed-agenda drops that id and leaves route-table-diff owned", () => {
  const removed = withoutJob(discovery, EXACT);
  const missing = lookupCapabilityOwner(EXACT, removed);
  const kept = lookupCapabilityOwner(STILL_OWNED, removed);
  assert.equal(missing.outcome, "no-fit");
  assert.equal(missing.reason, "unknown_need");
  assert.equal(missing.jobId, null);
  assert.equal(missing.callRecipe, null);
  assert.equal(kept.outcome, "owned");
  assert.equal(kept.jobId, STILL_OWNED);
  assert.equal(kept.review, "newly_reviewed");
  assert.deepEqual(kept.callRecipe.argv, ["node", "bin/useful-jobs.mjs", "run", STILL_OWNED]);
  assert.equal(JSON.stringify(kept).includes(EXACT), false);
  assert.equal(maintainedCapabilityFromDocument(removed).jobIds.includes(EXACT), false);
  assert.equal(lookupCapabilityOwner(EXACT).outcome, "owned");
});

test("malformed discovery is no-fit, including a one-sided removal and a duplicate id", () => {
  const oneSided = structuredClone(discovery);
  oneSided.jobs = discovery.jobs.filter((id) => id !== EXACT);
  const duplicate = structuredClone(discovery);
  duplicate.jobs = [...discovery.jobs, EXACT];
  const noScope = structuredClone(discovery);
  noScope.releaseScope = null;
  const cases = [null, 4, [], {}, "feed-agenda", oneSided, duplicate, noScope];
  for (const doc of cases) {
    const result = lookupCapabilityOwner(EXACT, doc);
    assert.equal(result.outcome, "no-fit", JSON.stringify(doc)?.slice(0, 80));
    assert.equal(result.reason, "malformed_discovery");
    assert.equal(result.owner, null);
    assert.equal(result.callRecipe, null);
    assert.throws(() => maintainedCapabilityFromDocument(doc), /useful_jobs_discovery_invalid/);
  }
  assert.equal(lookupCapabilityOwner(EXACT).outcome, "owned");
});

test("near-miss strings are not exact id hits", () => {
  for (const need of ["feed-agend", "feed-agenda ", " feed-agenda", "FEED-AGENDA", "route-table"]) {
    const result = lookupCapabilityOwner(need);
    assert.equal(result.outcome, "no-fit", JSON.stringify(need));
    assert.equal(result.reason, "unknown_need");
    assert.equal(result.jobId, null);
    assert.equal(result.callRecipe, null);
  }
});
