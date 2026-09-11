import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { FIXTURES } from "../lib/roots.mjs";
import { runCli } from "./helpers.mjs";

const CALLER_ARGS = [
  "vendor-budget-impact",
  "--before",
  "caller/vendor-budget-impact/before.json",
  "--after",
  "caller/vendor-budget-impact/after.json",
  "--input-root",
  "tools/job-input-preflight/fixtures",
];

const INLINE_BEFORE = JSON.stringify({
  label: "caller",
  rows: [{ field: "wave5-d02-inline-input", value: 3, unit: "USD/1M-tokens" }],
});
const INLINE_AFTER = JSON.stringify({
  label: "caller",
  rows: [{ field: "wave5-d02-inline-input", value: 4, unit: "USD/1M-tokens" }],
});
const INLINE_SAMPLE = JSON.stringify({
  label: "SAMPLE",
  rows: [{ field: "wave5-d02-inline-input", value: 3, unit: "USD/1M-tokens" }],
});

test("proof: valid custom caller files succeed at the CLI", () => {
  const r = runCli(CALLER_ARGS);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.refused, false);
  assert.equal(r.json.engineInvoked, false);
  assert.equal(r.json.sample, false);
  assert.equal(r.json.job, "vendor-budget-impact");
  assert.equal(r.json.inputs.before.json, true);
  assert.match(r.json.inputs.before.digest, /^sha256:[0-9a-f]{64}$/);
});

test("proof: invalid pricing-row schema is rejected at the CLI (syntax-valid JSON is not enough)", () => {
  const r = runCli([
    "vendor-budget-impact",
    "--before",
    "invalid-schema/not-rows.json",
    "--after",
    "caller/vendor-budget-impact/after.json",
    "--input-root",
    "tools/job-input-preflight/fixtures",
  ]);
  assert.equal(r.status, 2, r.stdout);
  assert.equal(r.json.ok, false);
  assert.equal(r.json.refused, true);
  assert.equal(r.json.code, "input-schema-mismatch");
  assert.equal(r.json.engineInvoked, false);
});

test("proof: disguised SAMPLE sibling is rejected at the CLI", () => {
  const r = runCli([
    "vendor-budget-impact",
    "--before",
    "vendor-budget-impact/before.json",
    "--after",
    "vendor-budget-impact/after.json",
    "--input-root",
    "tools/job-input-preflight/fixtures",
  ]);
  assert.equal(r.status, 2, r.stdout);
  assert.equal(r.json.ok, false);
  assert.equal(r.json.code, "disguised-sample");
  assert.equal(r.json.sample, true);
  assert.ok(r.json.sampleReasons.some((s) => String(s).includes("sibling-marker")));
  assert.equal(r.json.engineInvoked, false);
});

test("proof: valid inline JSON custom input succeeds at the CLI", () => {
  const r = runCli(["vendor-budget-impact", "--before", INLINE_BEFORE, "--after", INLINE_AFTER]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.inputs.before.inline, true);
  assert.equal(r.json.inputs.after.inline, true);
  assert.equal(r.json.sample, false);
  assert.equal(r.json.engineInvoked, false);
});

test("proof: inline JSON with SAMPLE label is rejected at the CLI", () => {
  const r = runCli(["vendor-budget-impact", "--before", INLINE_SAMPLE, "--after", INLINE_AFTER]);
  assert.equal(r.status, 2, r.stdout);
  assert.equal(r.json.ok, false);
  assert.equal(r.json.code, "disguised-sample");
  assert.equal(r.json.sample, true);
  assert.ok(r.json.sampleReasons.some((s) => String(s).includes("json-sample-label")));
});

test("JSONL pricing input is not treated as a JSON document", () => {
  const work = mkdtempSync(path.join(tmpdir(), "jip-jsonl-"));
  const line = JSON.stringify({ rows: [{ field: "a", value: 1, unit: "u" }] });
  writeFileSync(path.join(work, "before.jsonl"), `${line}\n${line}\n`);
  writeFileSync(path.join(work, "after.jsonl"), `${line}\n`);
  writeFileSync(
    path.join(work, "after.json"),
    `${JSON.stringify({ label: "caller", rows: [{ field: "a", value: 2, unit: "u" }] })}\n`,
  );
  const r = runCli([
    "vendor-budget-impact",
    "--before",
    "before.jsonl",
    "--after",
    "after.json",
    "--input-root",
    work,
  ]);
  assert.equal(r.status, 2, r.stdout);
  assert.equal(r.json.ok, false);
  assert.equal(r.json.code, "input-jsonl-not-document");
});

test("custom catalog JSON Schema draft is not a useful-jobs catalog", () => {
  const r = runCli([
    ...CALLER_ARGS,
    "--catalog",
    path.join(FIXTURES, "bad-catalogs/json-schema-draft.json"),
  ]);
  assert.equal(r.status, 2, r.stdout);
  assert.equal(r.json.code, "catalog-schema-mismatch");
});

test("custom catalog schema:false is rejected", () => {
  const r = runCli([
    ...CALLER_ARGS,
    "--catalog",
    path.join(FIXTURES, "bad-catalogs/schema-false.json"),
  ]);
  assert.equal(r.status, 2, r.stdout);
  assert.equal(r.json.code, "catalog-schema-mismatch");
});

test("JSONL catalog is rejected as catalog JSONL, not silently parsed", () => {
  const r = runCli([
    ...CALLER_ARGS,
    "--catalog",
    path.join(FIXTURES, "bad-catalogs/catalog.jsonl"),
  ]);
  assert.equal(r.status, 2, r.stdout);
  assert.equal(r.json.code, "catalog-jsonl-not-document");
});

test("valid custom catalog plus custom caller files succeed", () => {
  const r = runCli([
    ...CALLER_ARGS,
    "--catalog",
    path.join(FIXTURES, "custom-catalog.json"),
  ]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.catalogVersion, "1.0.0-custom-pin");
  assert.equal(r.json.sample, false);
});

test("extension-disguised SAMPLE JSON (.txt) is still rejected", () => {
  const work = mkdtempSync(path.join(tmpdir(), "jip-ext-"));
  writeFileSync(
    path.join(work, "before.txt"),
    `${JSON.stringify({ label: "SAMPLE", rows: [{ field: "a", value: 1, unit: "u" }] })}\n`,
  );
  writeFileSync(
    path.join(work, "after.json"),
    `${JSON.stringify({ label: "caller", rows: [{ field: "a", value: 2, unit: "u" }] })}\n`,
  );
  const r = runCli([
    "vendor-budget-impact",
    "--before",
    "before.txt",
    "--after",
    "after.json",
    "--input-root",
    work,
  ]);
  assert.equal(r.status, 2, r.stdout);
  assert.equal(r.json.code, "disguised-sample");
});
