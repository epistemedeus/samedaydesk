import assert from "node:assert/strict";
import test from "node:test";
import { firstIndex, reverseCopy, selectById } from "../src/identity.mjs";

test("catalog array index is not service identity", () => {
  const jobs = [{ id: "api-upgrade-brief" }, { id: "vendor-budget-impact" }];
  assert.equal(selectById(jobs, "vendor-budget-impact").id, "vendor-budget-impact");
  assert.equal(selectById(jobs, "missing"), null);
  assert.throws(() => selectById(jobs, 0), /array index is not service identity/);
  assert.equal(firstIndex(jobs).id, "api-upgrade-brief");
  assert.notEqual(firstIndex(jobs).id, "vendor-budget-impact");
});

test("reversed catalog still selects vendor-budget-impact by id, not jobs[0]", () => {
  const jobs = [
    { id: "api-upgrade-brief" },
    { id: "vendor-budget-impact" },
    { id: "feed-agenda" },
    { id: "evidence-ci-annotation" },
    { id: "listing-repair-packet" },
    { id: "repeat-job-record" },
  ];
  const reversed = reverseCopy(jobs);
  assert.equal(reversed[0].id, "repeat-job-record");
  assert.equal(selectById(reversed, "vendor-budget-impact").id, "vendor-budget-impact");
  assert.notEqual(reversed[0].id, "vendor-budget-impact");
});
