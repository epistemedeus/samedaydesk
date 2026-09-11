import assert from "node:assert/strict";
import test from "node:test";
import { loadCase } from "../lib/corpus.mjs";
import { spawnReplay, tmpOut } from "./helpers.mjs";

test("noise remains unchanged when only observation metadata moves", () => {
  const outDir = tmpOut("m09-noise-");
  const result = spawnReplay(["case", "--id", "noise-observation-metadata", "--out-dir", outDir]);
  assert.equal(result.exitCode, 0, result.stderr || result.stdout);
  const report = result.body.report;
  assert.equal(report.verdict, "unchanged");
  assert.equal(report.summary.semantic, 0);
  assert.equal(report.claims.usefulOutputProven, true);
  assert.equal(report.claims.paymentImpliesUsefulOutput, false);
  assert.notEqual(loadCase("noise-observation-metadata").before.jobId, loadCase("noise-observation-metadata").after.jobId);
});

test("unselected openGraph change is noise for title,description,headings", () => {
  const result = spawnReplay(["case", "--id", "noise-unselected-opengraph", "--out-dir", tmpOut("m09-og-")]);
  assert.equal(result.exitCode, 0, result.stderr || result.stdout);
  assert.equal(result.body.report.verdict, "unchanged");
  assert.equal(result.body.report.summary.semantic, 0);
});

test("JSON headings key order is not a content change", () => {
  const result = spawnReplay(["case", "--id", "noise-json-key-order", "--out-dir", tmpOut("m09-keys-")]);
  assert.equal(result.exitCode, 0, result.stderr || result.stdout);
  assert.equal(result.body.report.verdict, "unchanged");
});

test("source-list permutation is reordered, not changed", () => {
  const result = spawnReplay(["case", "--id", "noise-source-reorder", "--out-dir", tmpOut("m09-reorder-")]);
  assert.equal(result.exitCode, 0, result.stderr || result.stdout);
  assert.equal(result.body.report.verdict, "reordered");
  assert.equal(result.body.report.summary.semantic, 0);
});

test("heading member permutation is order, not semantic replacement", () => {
  const result = spawnReplay(["case", "--id", "heading-permutation", "--out-dir", tmpOut("m09-h2-")]);
  assert.equal(result.exitCode, 0, result.stderr || result.stdout);
  assert.equal(result.body.report.verdict, "reordered");
  assert.equal(result.body.report.summary.semantic, 0);
  assert.ok(result.body.report.changes.some((change) => change.class === "order"));
});

test("title text change is not normalized away", () => {
  const result = spawnReplay(["case", "--id", "meaningful-title", "--out-dir", tmpOut("m09-title-")]);
  assert.equal(result.exitCode, 0, result.stderr || result.stdout);
  const report = result.body.report;
  assert.equal(report.verdict, "changed");
  assert.ok(report.summary.semantic >= 1);
  assert.ok(report.changes.some((change) => change.path.includes("/title") && change.class === "semantic"));
  assert.match(String(report.changes.find((change) => change.path.includes("/title")).after), /21-day lead/);
});

test("description price change is changed", () => {
  const result = spawnReplay(["case", "--id", "meaningful-description", "--out-dir", tmpOut("m09-desc-")]);
  assert.equal(result.exitCode, 0, result.stderr || result.stdout);
  assert.equal(result.body.report.verdict, "changed");
  assert.ok(result.body.report.changes.some((change) => change.path.includes("/description")));
});

test("heading text change is changed, not treated as permutation", () => {
  const result = spawnReplay(["case", "--id", "meaningful-heading-text", "--out-dir", tmpOut("m09-htext-")]);
  assert.equal(result.exitCode, 0, result.stderr || result.stdout);
  assert.equal(result.body.report.verdict, "changed");
  assert.ok(result.body.report.changes.some((change) => change.class === "semantic"));
});

test("noise plus title still reports the title change", () => {
  const result = spawnReplay(["case", "--id", "mixed-noise-plus-title", "--out-dir", tmpOut("m09-mixed-")]);
  assert.equal(result.exitCode, 0, result.stderr || result.stdout);
  assert.equal(result.body.report.verdict, "changed");
  assert.ok(result.body.report.changes.some((change) => change.path.includes("/title")));
});

test("long title excerpt truncation does not erase the semantic verdict", () => {
  const result = spawnReplay(["case", "--id", "excerpt-long-title", "--out-dir", tmpOut("m09-excerpt-")]);
  assert.equal(result.exitCode, 0, result.stderr || result.stdout);
  const report = result.body.report;
  assert.equal(report.verdict, "changed");
  const titleChange = report.changes.find((change) => change.path.includes("/title"));
  assert.ok(titleChange);
  assert.match(String(titleChange.afterEvidence ?? titleChange.after), /END-NEW|A{10}/);
});

test("absent description is coverage unknown, not a deletion change", () => {
  const result = spawnReplay(["case", "--id", "coverage-unknown-absent-description", "--out-dir", tmpOut("m09-cov-")]);
  assert.equal(result.exitCode, 0, result.stderr || result.stdout);
  const report = result.body.report;
  assert.equal(report.verdict, "incomplete");
  assert.equal(report.summary.semantic, 0);
  assert.ok(report.coverageUnknown.some((item) =>
    item.field === "description"
    && item.reason === "absent_field_is_coverage_unknown_not_deletion"));
});

test("in-bounds three-source title change stays changed", () => {
  const result = spawnReplay(["case", "--id", "truncation-max-sources-in-bounds", "--out-dir", tmpOut("m09-src-ok-")]);
  assert.equal(result.exitCode, 0, result.stderr || result.stdout);
  assert.equal(result.body.report.verdict, "changed");
});

test("max-sources 1 drops the changed row: incomplete, not unchanged (Co13 pin)", () => {
  const result = spawnReplay(["case", "--id", "truncation-max-sources-hides-row", "--out-dir", tmpOut("m09-src-trunc-")]);
  assert.equal(result.exitCode, 0, result.stderr || result.stdout);
  const evaluation = result.body.evaluation;
  assert.equal(evaluation.ok, true);
  assert.equal(evaluation.analysisOutcome, "incomplete");
  assert.equal(evaluation.summary.semantic, 0);
  assert.match(evaluation.remainingBinding, /W5-M05/);
  assert.equal(result.body.report.claims.usefulOutputProven, false);
});

test("max-changes 1 keeps a changed verdict but silently omits the sibling title path", () => {
  const bounded = spawnReplay(["case", "--id", "truncation-max-changes-in-bounds", "--out-dir", tmpOut("m09-ch-ok-")]);
  assert.equal(bounded.exitCode, 0, bounded.stderr || bounded.stdout);
  assert.equal(bounded.body.report.verdict, "changed");
  assert.ok(bounded.body.report.summary.semantic >= 2);
  assert.ok(bounded.body.report.changes.some((change) => change.path.includes("/title")));
  assert.ok(bounded.body.report.changes.some((change) => change.path.includes("/description")));

  const truncated = spawnReplay(["case", "--id", "truncation-max-changes-hides-verdict", "--out-dir", tmpOut("m09-ch-trunc-")]);
  assert.equal(truncated.exitCode, 0, truncated.stderr || truncated.stdout);
  assert.equal(truncated.body.report.verdict, "changed");
  assert.ok(truncated.body.report.summary.semantic >= 1);
  assert.ok(truncated.body.report.changes.some((change) => change.path.includes("/description")));
  assert.equal(truncated.body.report.changes.some((change) => change.path.includes("/title")), false);
  assert.equal(truncated.body.report.snapshot.after.truncated, false);
  assert.match(truncated.body.evaluation.remainingBinding, /max-changes/);
});

test("max-stale-ms does not bind freshness on the current Co13 pin", () => {
  const result = spawnReplay(["case", "--id", "stale-option-noop", "--out-dir", tmpOut("m09-stale-")]);
  assert.equal(result.exitCode, 0, result.stderr || result.stdout);
  assert.equal(result.body.report.verdict, "unchanged");
  assert.equal(result.body.report.freshness, "unknown");
  assert.equal(result.body.report.claims.current, false);
  assert.equal(result.body.report.claims.fresh, false);
  assert.match(result.body.evaluation.remainingBinding, /maxStaleMs/);
});
