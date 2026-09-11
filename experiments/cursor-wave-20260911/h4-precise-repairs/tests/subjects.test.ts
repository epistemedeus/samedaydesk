import assert from "node:assert/strict";
import test from "node:test";

import { listRepairSubjects, requireSubject } from "../src/subjects.ts";
import { designExactRepairProposal } from "../src/proposal.ts";
import { SUBJECT_JOB_IDS } from "../src/constants.ts";

test("repair subjects are the six PR51 useful-jobs catalog ids, not paid wrappers", () => {
  const subjects = listRepairSubjects();
  assert.deepEqual(
    subjects.map((row) => row.id),
    [...SUBJECT_JOB_IDS],
  );
  for (const row of subjects) {
    assert.equal(row.paidWrapper, false);
    assert.equal(row.purchaseAuthority, false);
    assert.equal(row.role, "repair-subject");
    assert.equal(typeof row.title, "string");
    assert.ok(row.title.length > 0);
  }
});

test("G01 exact repair is a proposal, not a live $15 job", () => {
  const proposal = designExactRepairProposal("listing-repair-packet");
  assert.deepEqual(proposal, {
    family: "G",
    id: "G01",
    kind: "proposal",
    liveJob: false,
    liveJobUsd: null,
    fifteenDollarJob: false,
    subjectJobId: "listing-repair-packet",
    saleState: "not_a_sale",
    paidWrapper: false,
    note: "Exact repair proposal design only. Not a hosted paid job at any price.",
  });
  assert.equal(requireSubject("vendor-budget-impact"), "vendor-budget-impact");
  assert.throws(() => requireSubject("paid-wrapper-of-extract"));
});
