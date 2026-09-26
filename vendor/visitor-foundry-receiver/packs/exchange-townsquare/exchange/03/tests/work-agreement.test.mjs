import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  AGREEMENT_STATUS,
  ERROR_CODES,
  SCHEMA,
  acceptRevision,
  attachDeliverable,
  briefRevisionFingerprint,
  createAgreementFromRequirements,
  createWorkAgreement,
  inspectAgainstBrief,
  exchange01,
} from "../src/index.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const f01 = join(root, "../01/fixtures");
const load = (dir, name) => JSON.parse(readFileSync(join(dir, name), "utf8"));

test("positive: bind proposal to brief revision and attach deliverable against bound scope", () => {
  const { brief, agreement } = createAgreementFromRequirements(
    load(f01, "requirements.positive.json"),
    load(root, "fixtures/proposal.json"),
    { clock: () => Date.parse("2026-09-10T14:00:00.000Z") },
  );
  assert.equal(agreement.schema, SCHEMA);
  assert.equal(agreement.status, AGREEMENT_STATUS.BOUND);
  assert.equal(agreement.boundRevision.sha256, briefRevisionFingerprint(brief).sha256);

  const attached = attachDeliverable(agreement, load(f01, "artifact.positive.json"), {
    clock: () => Date.parse("2026-09-10T14:01:00.000Z"),
  });
  assert.equal(attached.status, AGREEMENT_STATUS.DELIVERABLE_ATTACHED);
  assert.equal(attached.deliverable.objectiveComplete, true);
  assert.equal(attached.deliverable.againstRevision, agreement.boundRevision.sha256);
  assert.equal(attached.deliverable.checkSummary.overallAccepted, false);
});

test("scope change visible; silent accept rejected; explicit accept rebinds", () => {
  const { brief, agreement } = createAgreementFromRequirements(
    load(f01, "requirements.positive.json"),
    load(root, "fixtures/proposal.json"),
  );
  const revisedBrief = exchange01.buildAcceptanceBrief(load(root, "fixtures/requirements.revised.json"));
  assert.notEqual(
    briefRevisionFingerprint(brief).sha256,
    briefRevisionFingerprint(revisedBrief).sha256,
  );

  const drifted = inspectAgainstBrief(agreement, revisedBrief);
  assert.equal(drifted.status, AGREEMENT_STATUS.SCOPE_CHANGED);
  assert.equal(drifted.scopeChange.silentAccept, false);
  assert.equal(drifted.scopeChange.scopeDiff.changed, true);
  assert.ok(drifted.scopeChange.scopeDiff.objective.added.includes("changed_must_be_true_when_digest"));
  assert.ok(drifted.scopeChange.scopeDiff.requiredFields.added.includes("revisionNote"));

  assert.throws(
    () => acceptRevision(drifted, revisedBrief, { explicit: false }),
    (err) => err.code === ERROR_CODES.SILENT_ACCEPT_FORBIDDEN,
  );
  assert.throws(
    () => acceptRevision(drifted, revisedBrief, {}),
    (err) => err.code === ERROR_CODES.SILENT_ACCEPT_FORBIDDEN,
  );

  const rebound = acceptRevision(drifted, revisedBrief, { explicit: true });
  assert.equal(rebound.status, AGREEMENT_STATUS.BOUND);
  assert.equal(rebound.boundRevision.sha256, briefRevisionFingerprint(revisedBrief).sha256);
  assert.equal(rebound.scopeChange.explicit, true);
});

test("negative: cannot attach deliverable while scope_changed", () => {
  const { agreement } = createAgreementFromRequirements(
    load(f01, "requirements.positive.json"),
    load(root, "fixtures/proposal.json"),
  );
  const revisedBrief = exchange01.buildAcceptanceBrief(load(root, "fixtures/requirements.revised.json"));
  const drifted = inspectAgainstBrief(agreement, revisedBrief);
  assert.throws(
    () => attachDeliverable(drifted, load(f01, "artifact.positive.json")),
    (err) => err.code === ERROR_CODES.REVISION_MISMATCH,
  );
});

test("partial: identical criteria keep same revision fingerprint across rebuild", () => {
  const req = load(f01, "requirements.positive.json");
  const a = exchange01.buildAcceptanceBrief(req, { clock: () => 1 });
  const b = exchange01.buildAcceptanceBrief(req, { clock: () => 999999 });
  assert.equal(briefRevisionFingerprint(a).sha256, briefRevisionFingerprint(b).sha256);
  const inspected = inspectAgainstBrief(
    createWorkAgreement({ brief: a, proposal: load(root, "fixtures/proposal.json") }),
    b,
  );
  assert.equal(inspected.inspection.matchesBound, true);
  assert.notEqual(inspected.status, AGREEMENT_STATUS.SCOPE_CHANGED);
});

test("F2: deep-clone bound objects; reject cross-task rebind; re-fingerprint", async () => {
  const { createWorkAgreement, acceptRevision, attachDeliverable, ERROR_CODES } = await import("../src/index.mjs");
  const { buildAcceptanceBrief } = await import("../../01/src/index.mjs");
  const requirements = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../01/fixtures/requirements.positive.json"), "utf8"),
  );
  const brief = buildAcceptanceBrief(requirements);
  const proposal = {
    id: "p",
    proposerLabel: "w",
    claimedRequirements: [],
    terms: { priceAmount: 1, currency: "USD" },
  };
  const agreement = createWorkAgreement({ brief, proposal });
  proposal.proposerLabel = "mutated";
  assert.equal(agreement.proposal.proposerLabel, "w");

  const artifact = { a: 1 };
  const withDel = attachDeliverable(agreement, artifact);
  artifact.a = 2;
  assert.equal(withDel.deliverable.artifact.a, 1);

  const other = buildAcceptanceBrief({ ...requirements, taskId: "other-task" });
  assert.throws(
    () => acceptRevision(agreement, other, { explicit: true }),
    (err) => err.code === ERROR_CODES.REVISION_MISMATCH,
  );
});

test("S171 R6: inspectAgainstBrief freezes deliverable snapshot", async () => {
  const { createWorkAgreement, attachDeliverable, inspectAgainstBrief } = await import("../src/index.mjs");
  const { buildAcceptanceBrief } = await import("../../01/src/index.mjs");
  const requirements = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../01/fixtures/requirements.positive.json"), "utf8"),
  );
  const artifact = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../01/fixtures/artifact.positive.json"), "utf8"),
  );
  const brief = buildAcceptanceBrief(requirements);
  const agreement = createWorkAgreement({
    brief,
    proposal: { id: "p", proposerLabel: "w", claimedRequirements: [], terms: {} },
  });
  const withDel = attachDeliverable(agreement, artifact);
  const inspected = inspectAgainstBrief(withDel, brief);
  const prior = withDel.deliverable.artifact.summary;
  inspected.deliverable.artifact.summary = "MUTATED";
  assert.equal(withDel.deliverable.artifact.summary, prior);
  assert.notEqual(withDel.deliverable.artifact, inspected.deliverable.artifact);
});
