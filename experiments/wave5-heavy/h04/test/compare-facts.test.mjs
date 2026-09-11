import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { compareRun } from "../src/compare.mjs";
import { EXAMPLES_DIR } from "../src/paths.mjs";

/**
 * Current compareRun maps informational and unchanged through normalizeStatus
 * to "no-change", so statusLike comparison returns match.
 * FAILURE-TAXONOMY: W4 webhook/lockfile no-change success status is informational,
 * not a synonym of unchanged. Tests record that current behavior; they do not
 * rewrite expected "unchanged" to "informational" to force a catalog pass.
 */

test("compareRun records informational vs unchanged honestly (current: synonym match)", () => {
  const compared = compareRun({
    expected: { status: "unchanged" },
    stdout: JSON.stringify({ status: "informational", ok: true }),
    exitCode: 0,
  });
  const status = compared.facts.find((f) => f.key === "status");
  assert.ok(status, "status fact recorded");
  assert.equal(status.expected, "unchanged");
  assert.equal(status.actual, "informational");
  assert.notEqual(status.expected, status.actual);
  // Current src/compare.mjs: both normalize to "no-change" → match.
  assert.equal(status.result, "match");
  assert.equal(compared.result, "match");
  assert.equal(compared.expectedPresent, true);
});

test("finding: engine informational is not the same string as expected unchanged", () => {
  assert.notEqual("informational", "unchanged");
  const compared = compareRun({
    expected: { status: "unchanged" },
    stdout: JSON.stringify({ status: "informational" }),
    exitCode: 0,
  });
  const status = compared.facts.find((f) => f.key === "status");
  assert.equal(status.expected, "unchanged");
  assert.equal(status.actual, "informational");
  // Finding: strings differ; current compareRun still reports match via synonym collapse.
  assert.equal(status.result, "match");
});

test("compareRun mismatches actionable vs unchanged (no silent force-match)", () => {
  const compared = compareRun({
    expected: { status: "unchanged" },
    stdout: JSON.stringify({ status: "actionable", ok: true }),
    exitCode: 0,
  });
  const status = compared.facts.find((f) => f.key === "status");
  assert.equal(status.result, "mismatch");
  assert.equal(compared.result, "mismatch");
});

test("compareRun matches identical informational and identical unchanged", () => {
  const info = compareRun({
    expected: { status: "informational" },
    stdout: JSON.stringify({ status: "informational" }),
    exitCode: 0,
  });
  assert.equal(info.result, "match");
  const unchanged = compareRun({
    expected: { status: "unchanged" },
    stdout: JSON.stringify({ status: "unchanged" }),
    exitCode: 0,
  });
  assert.equal(unchanged.result, "match");
});

test("compareRun stays unknown when expected is missing", () => {
  const compared = compareRun({
    expected: null,
    stdout: JSON.stringify({ status: "informational", ok: true }),
    exitCode: 0,
  });
  assert.equal(compared.result, "unknown");
  assert.equal(compared.expectedPresent, false);
  assert.equal(compared.reason, "expected-report-missing");
});

test("compareRun does not invent a pass when engine output is missing", () => {
  const compared = compareRun({
    expected: { status: "unchanged" },
    stdout: "",
    exitCode: 2,
  });
  const status = compared.facts.find((f) => f.key === "status");
  assert.equal(status.actual, null);
  assert.equal(status.result, "unknown");
  assert.equal(compared.result, "unknown");
});

const schema03Expected = join(
  EXAMPLES_DIR,
  "schema-webhook",
  "h04-schema-03",
  "expected-report.json",
);

test("h04-schema-03 expected unchanged vs engine informational is recorded, not rewritten", {
  skip: existsSync(schema03Expected) ? false : "h04-schema-03 expected-report.json missing",
}, () => {
  const compared = compareRun({
    expectedPath: schema03Expected,
    stdout: JSON.stringify({
      status: "informational",
      ok: true,
      impact: { breaking: [], added: [], deleted: [], unknown: [] },
    }),
    exitCode: 0,
  });
  const status = compared.facts.find((f) => f.key === "status");
  assert.equal(status.expected, "unchanged");
  assert.equal(status.actual, "informational");
  assert.notEqual(status.expected, status.actual);
  assert.equal(status.result, "match");
});
