import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PAGE_CHANGE_OFFLINE_CONTRACT, PACKAGE_ROOT } from "../lib/index.mjs";

const bin = join(PACKAGE_ROOT, "bin/page-change.mjs");
const bounded = join(PACKAGE_ROOT, "fixtures/bounded");
const unchanged = join(PACKAGE_ROOT, "fixtures/unchanged");
const customer = join(PACKAGE_ROOT, "fixtures/customer-job");
const CLOCK = "2026-09-08T12:00:00.000Z";

function spawnCompare(args) {
  const outDir = mkdtempSync(join(tmpdir(), "pc-bounded-"));
  const result = spawnSync(process.execPath, [bin, "compare", ...args, "--clock", CLOCK, "--out-dir", outDir], {
    encoding: "utf8",
    cwd: PACKAGE_ROOT,
  });
  let stdout = null;
  try {
    stdout = JSON.parse(result.stdout);
  } catch {
    stdout = null;
  }
  let stderr = null;
  try {
    stderr = JSON.parse(result.stderr);
  } catch {
    stderr = { raw: result.stderr };
  }
  return { status: result.status, stdout, stderr, outDir };
}

test("contract export matches the spawned CLI report schema", () => {
  const result = spawnCompare([
    "--before", join(unchanged, "before.json"),
    "--after", join(unchanged, "after.json"),
    "--fields", "title,description",
  ]);
  assert.equal(result.status, 0, result.stderr?.raw ?? result.stderr?.message);
  assert.equal(result.stdout.ok, true);
  assert.equal(result.stdout.report.schema, PAGE_CHANGE_OFFLINE_CONTRACT.reportSchema);
  assert.equal(result.stdout.report.provenance.engine, PAGE_CHANGE_OFFLINE_CONTRACT.engine);
  assert.equal(PAGE_CHANGE_OFFLINE_CONTRACT.transport.successExit, 0);
  assert.equal(PAGE_CHANGE_OFFLINE_CONTRACT.transport.refusalExit, 2);
});

test("CLI: max-changes walk is truncated analysis, not a complete digest", () => {
  const result = spawnCompare([
    "--before", join(bounded, "many-headings-before.json"),
    "--after", join(bounded, "many-headings-after.json"),
    "--fields", "title,headings",
    "--max-changes", "2",
  ]);
  assert.equal(result.status, 0, result.stderr?.raw ?? result.stderr?.message);
  const report = result.stdout.report;
  assert.equal(result.stdout.ok, true);
  assert.equal(report.verdict, "changed");
  assert.equal(report.claims.complete, false);
  assert.equal(report.claims.noChangeProven, false);
  assert.equal(report.snapshot.before.truncated, false);
  assert.equal(report.snapshot.after.truncated, false);
  assert.ok(report.snapshot.limitsHit.includes("maxChanges"));
  assert.equal(report.changes.length, 2);
  assert.equal(report.summary.semantic, 2);
  const written = JSON.parse(readFileSync(join(result.outDir, "page-change.json"), "utf8"));
  assert.equal(written.report.claims.complete, false);
});

test("CLI: excerpt truncation is display-only and does not flip verdict to incomplete", () => {
  const result = spawnCompare([
    "--before", join(bounded, "title-change-before.json"),
    "--after", join(bounded, "title-change-after.json"),
    "--fields", "title,description,headings",
    "--max-excerpt-bytes", "8",
  ]);
  assert.equal(result.status, 0, result.stderr?.raw ?? result.stderr?.message);
  const report = result.stdout.report;
  assert.equal(report.verdict, "changed");
  assert.equal(report.claims.complete, true);
  assert.equal(report.snapshot.limitsHit.includes("maxChanges"), false);
  const title = report.changes.find((change) => change.path === "/title");
  assert.ok(title);
  assert.equal(title.evidenceTruncated, true);
  assert.ok(title.beforeEvidence.length <= 8);
});

test("CLI: max-json-depth reports incomplete completeness while title change survives", () => {
  const result = spawnCompare([
    "--before", join(bounded, "deep-before.json"),
    "--after", join(bounded, "deep-after.json"),
    "--fields", "title,headings",
    "--max-json-depth", "2",
  ]);
  assert.equal(result.status, 0, result.stderr?.raw ?? result.stderr?.message);
  assert.notEqual(result.stderr?.code, "usage");
  const report = result.stdout.report;
  assert.equal(report.verdict, "changed");
  assert.ok(report.changes.some((change) => change.path === "/title" && change.class === "semantic"));
  assert.equal(report.claims.complete, false);
  assert.ok(report.snapshot.limitsHit.includes("maxJsonDepth"));
  assert.equal(report.claims.usefulOutputProven, true);
});

test("CLI: max-json-nodes is an analysis bound, not an engine crash", () => {
  const result = spawnCompare([
    "--before", join(bounded, "many-headings-before.json"),
    "--after", join(bounded, "many-headings-after.json"),
    "--fields", "title,headings",
    "--max-json-nodes", "3",
  ]);
  assert.equal(result.status, 0, result.stderr?.raw ?? result.stderr?.message);
  const report = result.stdout.report;
  assert.equal(result.stdout.ok, true);
  assert.equal(report.claims.complete, false);
  assert.ok(report.snapshot.limitsHit.includes("maxJsonNodes"));
  assert.equal(report.claims.noChangeProven, false);
});

test("CLI: fixture maxStaleMs default is unknown until a horizon is applied; 1ms is stale not a refusal", () => {
  const noHorizon = spawnCompare([
    "--before", join(unchanged, "before.json"),
    "--after", join(unchanged, "after.json"),
    "--fields", "title,description",
  ]);
  assert.equal(noHorizon.status, 0);
  assert.equal(noHorizon.stdout.report.verdict, "unchanged");
  assert.equal(noHorizon.stdout.report.freshness, "unknown");
  assert.equal(noHorizon.stdout.report.claims.current, false);
  assert.equal(noHorizon.stdout.report.claims.fresh, false);

  const stale = spawnCompare([
    "--before", join(unchanged, "before.json"),
    "--after", join(unchanged, "after.json"),
    "--fields", "title,description",
    "--max-stale-ms", "1",
  ]);
  assert.equal(stale.status, 0, stale.stderr?.raw ?? stale.stderr?.message);
  assert.equal(stale.stdout.ok, true);
  assert.equal(stale.stdout.report.verdict, "unchanged");
  assert.equal(stale.stdout.report.freshness, "stale");
  assert.equal(stale.stdout.report.claims.current, false);
  assert.equal(stale.stdout.report.claims.fresh, false);
  assert.equal(stale.stdout.report.snapshot.after.observedAt, "2026-09-08T10:00:02.000Z");

  const observed = spawnCompare([
    "--before", join(unchanged, "before.json"),
    "--after", join(unchanged, "after.json"),
    "--fields", "title,description",
    "--max-stale-ms", "86400000",
  ]);
  assert.equal(observed.status, 0);
  assert.equal(observed.stdout.report.verdict, "unchanged");
  assert.equal(observed.stdout.report.freshness, "observed");
  assert.equal(observed.stdout.report.claims.current, true);
  assert.equal(observed.stdout.report.claims.fresh, false);
});

test("CLI: source-list truncation sets snapshot.truncated and does not crash", () => {
  const result = spawnCompare([
    "--before", join(customer, "before.json"),
    "--after", join(customer, "after.json"),
    "--fields", "title,description,headings",
    "--max-sources", "1",
  ]);
  assert.equal(result.status, 0, result.stderr?.raw ?? result.stderr?.message);
  const report = result.stdout.report;
  assert.equal(report.snapshot.before.truncated, true);
  assert.equal(report.snapshot.after.truncated, true);
  assert.ok(report.snapshot.limitsHit.includes("maxSources"));
  assert.equal(report.claims.complete, false);
  assert.notEqual(report.verdict, "unchanged");
});

test("CLI: title text change survives sibling key-order normalization", () => {
  const result = spawnCompare([
    "--before", join(bounded, "title-change-before.json"),
    "--after", join(bounded, "title-change-after.json"),
    "--fields", "title,description,headings",
  ]);
  assert.equal(result.status, 0, result.stderr?.raw ?? result.stderr?.message);
  const report = result.stdout.report;
  assert.equal(report.verdict, "changed");
  assert.deepEqual(report.changes.map((change) => change.path), ["/title"]);
  assert.equal(report.changes[0].before, "Keep the RFQ name");
  assert.equal(report.changes[0].after, "Deadline moved on the RFQ");
  assert.equal(report.claims.complete, true);
});

test("CLI: oversized held file is input refusal exit 2, not an incomplete analysis", () => {
  const result = spawnCompare([
    "--before", join(customer, "before.json"),
    "--after", join(customer, "after.json"),
    "--fields", "title",
    "--max-bytes", "32",
  ]);
  assert.equal(result.status, PAGE_CHANGE_OFFLINE_CONTRACT.transport.refusalExit);
  assert.equal(result.stderr.code, "input_bounds");
  assert.equal(result.stdout, null);
});

test("journey fixture maxStaleMs is applied: observed, current stays false because coverage is incomplete", () => {
  const outDir = mkdtempSync(join(tmpdir(), "pc-journey-stale-"));
  const result = spawnSync(process.execPath, [
    bin, "journey",
    "--fixture", join(PACKAGE_ROOT, "fixtures/customer-job/job.json"),
    "--out-dir", outDir,
  ], { encoding: "utf8", cwd: PACKAGE_ROOT });
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.report.verdict, "changed");
  assert.equal(body.report.freshness, "observed");
  assert.equal(body.report.claims.complete, false);
  assert.equal(body.report.claims.current, false);
  assert.equal(body.report.claims.fresh, false);
});
