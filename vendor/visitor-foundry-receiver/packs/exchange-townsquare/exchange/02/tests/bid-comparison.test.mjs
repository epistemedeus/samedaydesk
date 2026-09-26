import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  ERROR_CODES,
  MATCH_STATUS,
  SCHEMA,
  compareProposalsToRequirements,
  validateProposal,
} from "../src/index.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtures01 = join(root, "../01/fixtures");
const load = (dir, name) => JSON.parse(readFileSync(join(dir, name), "utf8"));

test("positive/negative/partial/conflict statuses without ranking", () => {
  const requirements = load(fixtures01, "requirements.positive.json");
  const proposals = load(root, "fixtures/proposals.bundle.json");
  const out = compareProposalsToRequirements(requirements, proposals, {
    clock: () => Date.parse("2026-09-10T13:00:00.000Z"),
  });

  assert.equal(out.schema, SCHEMA);
  assert.equal(out.ranking, null);
  assert.equal(out.order, "input_order");
  assert.equal(out.proposalCount, 4);
  assert.equal(out.comparedAt, "2026-09-10T13:00:00.000Z");

  const byId = Object.fromEntries(out.comparisons.map((c) => [c.proposalId, c]));
  assert.equal(byId["prop-complete-artifact"].status, MATCH_STATUS.MEETS);
  assert.equal(byId["prop-complete-artifact"].artifactObjectiveComplete, true);
  assert.equal(byId["prop-missing-evidence"].status, MATCH_STATUS.MISSING_EVIDENCE);
  assert.equal(byId["prop-partial-bad-artifact"].status, MATCH_STATUS.CONFLICTS);
  assert.equal(byId["prop-subjective-overclaim"].status, MATCH_STATUS.CONFLICTS);
  assert.ok(
    byId["prop-subjective-overclaim"].conflicts.some(
      (c) => c.reason === "subjective_cannot_be_cleared_by_proposal",
    ),
  );

  // Input order preserved — not sorted by "quality"
  assert.deepEqual(
    out.comparisons.map((c) => c.proposalId),
    proposals.map((p) => p.id),
  );
  assert.ok(!("winner" in out));
  assert.ok(!("rank" in out));
});

test("rejects reputation / forbidden commercial fields", () => {
  assert.throws(
    () => validateProposal(load(root, "fixtures/proposal.forbidden.json")),
    (err) => err.code === ERROR_CODES.FORBIDDEN_CLAIM,
  );
});

test("partial: some claims with evidence, others missing", () => {
  const requirements = {
    taskId: "partial-task",
    title: "Partial",
    summary: "Two objective criteria",
    demo: true,
    objectiveCriteria: [
      {
        id: "a",
        description: "field a exists",
        check: { kind: "json_path_exists", path: "a" },
      },
      {
        id: "b",
        description: "field b exists",
        check: { kind: "json_path_exists", path: "b" },
      },
    ],
    subjectiveCriteria: [],
  };
  const out = compareProposalsToRequirements(requirements, [
    {
      id: "only-a",
      proposerLabel: "p",
      claimedRequirements: [{ criterionId: "a", claim: "have a", evidenceRef: "note" }],
    },
  ]);
  assert.equal(out.comparisons[0].status, MATCH_STATUS.PARTIAL);
  assert.equal(out.comparisons[0].missingEvidence[0].criterionId, "b");
});

test("reuses 01 brief builder — subjective remain unresolved on meeting proposal", () => {
  const requirements = load(fixtures01, "requirements.positive.json");
  const proposals = [load(root, "fixtures/proposals.bundle.json")[0]];
  const out = compareProposalsToRequirements(requirements, proposals);
  assert.deepEqual(out.unresolvedSubjectiveIds, ["useful_to_operator"]);
  assert.equal(out.comparisons[0].artifactCheckSummary.overallAccepted, false);
  assert.equal(out.comparisons[0].artifactCheckSummary.subjectiveUnresolved, 1);
});

test("F6: reference-only claims are unverified_evidence, not meets", () => {
  const requirements = {
    taskId: "ref-only",
    title: "t",
    summary: "s",
    demo: true,
    objectiveCriteria: [
      { id: "a", description: "a", check: { kind: "json_path_exists", path: "a" } },
    ],
    subjectiveCriteria: [],
  };
  const out = compareProposalsToRequirements(requirements, [
    {
      id: "ref",
      proposerLabel: "p",
      claimedRequirements: [{ criterionId: "a", claim: "have a", evidenceRef: "https://example.com/note" }],
    },
  ]);
  assert.equal(out.comparisons[0].status, MATCH_STATUS.UNVERIFIED_EVIDENCE);
});
