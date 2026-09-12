import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { comparePageChange } from "../lib/compare.mjs";
import { PACKAGE_ROOT, PUBLISHED_CUSTOMER_JOB, runCli } from "../lib/cli.mjs";

const publishedDir = join(PACKAGE_ROOT, "../../tools/recurring-job-recipes/fixtures/merchant/page-change/customer-job");
const unchangedDir = join(PACKAGE_ROOT, "fixtures/unchanged");

function capture() {
  const stdout = [];
  const stderr = [];
  return {
    stdout: { write(chunk) { stdout.push(chunk); } },
    stderr: { write(chunk) { stderr.push(chunk); } },
    text() { return stdout.join(""); },
    err() { return stderr.join(""); },
  };
}

test("published customer-job fixtures exist at pinned SDS path", () => {
  const before = JSON.parse(readFileSync(join(publishedDir, "before.json"), "utf8"));
  const after = JSON.parse(readFileSync(join(publishedDir, "after.json"), "utf8"));
  assert.equal(before.schemaVersion, "samedaydesk.extract-batch.v0");
  assert.equal(after.schemaVersion, "samedaydesk.extract-batch.v0");
  assert.equal(PUBLISHED_CUSTOMER_JOB, join(publishedDir, "job.json"));
});

test("journey: customer-job before/after title,description,headings is changed", async () => {
  const fetches = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    fetches.push(args);
    throw new Error("network must not be used");
  };
  try {
    const outDir = mkdtempSync(join(tmpdir(), "page-change-journey-"));
    const io = capture();
    const result = await runCli(["journey", "--fixture", PUBLISHED_CUSTOMER_JOB, "--out-dir", outDir], io);
    assert.equal(result.exitCode, 0, io.err());
    const report = result.body.report;
    assert.equal(report.schema, "pilot/page-change-brief/v1");
    assert.equal(report.verdict, "changed");
    assert.deepEqual(report.fields, ["title", "description", "headings"]);
    assert.equal(report.provenance.comparedWithClock, "2026-09-08T12:00:00.000Z");
    assert.equal(report.provenance.networkUsed, false);
    assert.equal(report.provenance.merchantCompareImported, false);
    assert.equal(report.provenance.paymentAttempted, false);
    assert.equal(report.claims.paymentImpliesUsefulOutput, false);
    assert.equal(report.claims.usefulOutputProven, true);
    assert.equal(report.claims.complete, false);
    assert.ok(report.summary.semantic >= 1);
    assert.ok(report.coverageUnknown.some((item) =>
      item.sourceKey === "https://research.example/vendor-alpha"
      && item.field === "description"
      && item.reason === "absent_field_is_coverage_unknown_not_deletion"));
    assert.ok(report.rows.failed.some((item) => item.sourceKey === "https://rfq.example/fasteners"));
    assert.ok(report.rows.missing.some((item) => item.sourceKey === "https://research.example/vendor-beta"));
    assert.match(report.provenance.termsVersion, /^sha256:[a-f0-9]{64}$/);
    const json = JSON.parse(readFileSync(join(outDir, "page-change.json"), "utf8"));
    const md = readFileSync(join(outDir, "page-change.md"), "utf8");
    assert.equal(json.report.verdict, "changed");
    assert.match(md, /verdict: \*\*changed\*\*/);
    assert.equal(fetches.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("journey: unchanged fixtures stay unchanged for title,description", async () => {
  const report = await comparePageChange({
    beforePath: join(unchangedDir, "before.json"),
    afterPath: join(unchangedDir, "after.json"),
    fields: ["title", "description"],
    clock: "2026-09-08T12:00:00.000Z",
    evidenceClass: "fixture",
  });
  assert.equal(report.verdict, "unchanged");
  assert.equal(report.summary.semantic, 0);
  assert.equal(report.coverageUnknown.length, 0);
  assert.equal(report.claims.paymentImpliesUsefulOutput, false);
  assert.equal(report.observations.after.charged, true);
  assert.equal(report.claims.usefulOutputProven, true);
});

test("clock is required", async () => {
  await assert.rejects(
    () => comparePageChange({
      beforePath: join(publishedDir, "before.json"),
      afterPath: join(publishedDir, "after.json"),
      fields: ["title"],
    }),
    (error) => error.code === "clock_required",
  );
  const io = capture();
  const result = await runCli([
    "compare",
    "--before", join(publishedDir, "before.json"),
    "--after", join(publishedDir, "after.json"),
    "--fields", "title",
    "--out-dir", mkdtempSync(join(tmpdir(), "page-change-noclock-")),
  ], io);
  assert.equal(result.exitCode, 2);
  assert.match(io.err(), /clock_required/);
});

test("CLI job command writes page-change.json and md", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "page-change-job-"));
  const io = capture();
  const result = await runCli(["job", "--job", join(unchangedDir, "job.json"), "--out-dir", outDir], io);
  assert.equal(result.exitCode, 0, io.err());
  assert.equal(result.body.report.verdict, "unchanged");
  assert.equal(readFileSync(join(outDir, "page-change.md"), "utf8").includes("unchanged"), true);
});

test("source-list reorder without field deltas is reordered", async () => {
  const merchant = join(PACKAGE_ROOT, "../../tools/recurring-job-recipes/fixtures/merchant/page-change/merchant");
  const report = await comparePageChange({
    beforePath: join(merchant, "unchanged-before.json"),
    afterPath: join(merchant, "reordered-after.json"),
    fields: ["title", "description"],
    clock: "2026-09-08T12:00:00.000Z",
  });
  assert.equal(report.verdict, "reordered");
  assert.equal(report.summary.semantic, 0);
  assert.ok(report.changes.some((change) => change.path === "/sources" && change.class === "order"));
});
