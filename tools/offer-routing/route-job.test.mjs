import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadMatrix, routeJob, routeJobFromFile, MATRIX_PATH } from "./route-job.mjs";

const here = dirname(fileURLToPath(import.meta.url));

test("matrix schema and hard-rule offers exist", () => {
  const matrix = loadMatrix();
  assert.equal(matrix.schema, "samedaydesk.offer-capability-limits.v1");
  const ids = new Set(matrix.offers.map((o) => o.id));
  for (const id of [
    "sdd.paid_html_extract",
    "sdd.page_change_offline",
    "sdd.result_reuse_offline",
    "neo.agent_task_kit",
    "neo.moltjobs_openai_agents_sample",
  ]) {
    assert.ok(ids.has(id), id);
  }
  const extract = matrix.offers.find((o) => o.id === "sdd.paid_html_extract");
  assert.ok(extract.notFor.includes("complete_issue_discussion"));
  assert.equal(extract.commonMistake, "paid_html_extraction_for_complete_issue_comments");
  const sample = matrix.offers.find((o) => o.id === "neo.moltjobs_openai_agents_sample");
  assert.equal(sample.hosting, "unhosted_sample_local_rehearsal");
  assert.equal(sample.commonMistake, "unhosted_sample_for_live_service");
  assert.equal(MATRIX_PATH.endsWith("capability-limits-matrix.json"), true);
});

test("complete discussion acquisition cannot be substituted by packaging", () => {
  const r = routeJobFromFile(join(here, "fixtures/complete-issue-discussion.job.json"));
  assert.equal(r.ok, false);
  assert.equal(r.selected, null);
  assert.equal(r.paid, false);
  assert.ok(r.warnings.includes("complete_issue_acquisition_unavailable"));
  assert.ok(r.avoidedMistakes.includes("paid_html_extraction_for_complete_issue_comments"));
  assert.ok(r.rejected.some(x => x.offerId === "neo.agent_task_kit"));
});

test("page_change_evidence prefers offline page-change / result-reuse", () => {
  const r = routeJobFromFile(join(here, "fixtures/page-change-evidence.job.json"));
  assert.equal(r.ok, true);
  assert.ok(["sdd.page_change_offline", "sdd.result_reuse_offline"].includes(r.selected.offerId));
  assert.equal(r.paid, false);
  assert.equal(r.offlineUntilHosted, false);
  assert.equal(r.selected.offerId, "sdd.page_change_offline");
});

test("cross_workspace_correction routes to agent-task-kit", () => {
  const r = routeJobFromFile(join(here, "fixtures/cross-workspace-correction.job.json"));
  assert.equal(r.ok, true);
  assert.equal(r.selected.offerId, "neo.agent_task_kit");
  assert.equal(r.paid, false);
});

test("moltjobs rehearsal selects unhosted sample, not live service label", () => {
  const r = routeJobFromFile(join(here, "fixtures/moltjobs-sdk-rehearsal.job.json"));
  assert.equal(r.ok, true);
  assert.equal(r.selected.offerId, "neo.moltjobs_openai_agents_sample");
  assert.equal(r.selected.hosting, "unhosted_sample_local_rehearsal");
  assert.equal(r.paid, false);
  assert.equal(r.offlineUntilHosted, false);
  assert.match(JSON.stringify(r.selected.limits), /Not a live Neomorphic-operated MoltJobs service/);
});

test("bounded_html_observation may select paid extract when payment allowed", () => {
  const r = routeJob({
    type: "bounded_html_observation",
    jobId: "allow-pay",
    constraints: [],
  });
  assert.equal(r.ok, true);
  assert.equal(r.selected.offerId, "sdd.paid_html_extract");
  assert.equal(r.paid, false);
  assert.equal(r.paymentRequired, true);
  assert.equal(r.executionAuthorized, false);
});

test("bounded_html_observation with no_payment does not select paid extract", () => {
  const r = routeJob({
    type: "bounded_html_observation",
    jobId: "no-pay",
    constraints: ["no_payment", "offline_preferred"],
  });
  assert.equal(r.ok, false);
  assert.equal(r.selected, null);
  assert.ok(r.rejected.some((x) => x.offerId === "sdd.paid_html_extract" && x.reason === "constraint_no_payment"));
});

test("README documents matrix path and mistake pair", () => {
  const md = readFileSync(join(here, "README.md"), "utf8");
  assert.match(md, /capability-limits-matrix\.json/);
  assert.match(md, /paid_html_extraction_for_complete_issue_comments|Paid HTML extraction/);
  assert.match(md, /unhosted sample/i);
  assert.match(md, /offline until hosted/i);
  assert.match(md, /route-job\.mjs/);
});

