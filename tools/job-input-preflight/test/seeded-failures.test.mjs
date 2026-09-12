import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { MAX_LOCAL_INPUT_BYTES } from "../lib/constants.mjs";
import { JOURNEY_ARGS, runCli } from "./helpers.mjs";

const beforeRel = "vendor-budget-impact/before.json";

test("seeded failure: missing --after", () => {
  const r = runCli([
    "vendor-budget-impact",
    "--before",
    beforeRel,
    "--input-root",
    "tools/job-input-preflight/fixtures",
  ]);
  assert.equal(r.status, 2);
  assert.equal(r.json.ok, false);
  assert.equal(r.json.code, "missing-required-inputs");
  assert.deepEqual(r.json.detail.missing, ["after"]);
  assert.equal(r.json.engineInvoked, false);
});

test("seeded failure: path that escapes --input-root", () => {
  const work = mkdtempSync(path.join(tmpdir(), "jip-escape-"));
  const root = path.join(work, "root");
  const outside = path.join(work, "outside.json");
  mkdirSync(root);
  writeFileSync(outside, `${JSON.stringify({ label: "caller", rows: [] })}\n`);
  writeFileSync(path.join(root, "before.json"), readBefore());
  const r = runCli([
    "vendor-budget-impact",
    "--before",
    "before.json",
    "--after",
    "../outside.json",
    "--input-root",
    root,
  ]);
  assert.equal(r.status, 2, r.stdout);
  assert.equal(r.json.ok, false);
  assert.equal(r.json.code, "input-path-escapes-root");
  assert.equal(r.json.engineInvoked, false);
});

test("seeded failure: symlink that escapes --input-root", () => {
  const work = mkdtempSync(path.join(tmpdir(), "jip-symlink-"));
  const root = path.join(work, "root");
  const outside = path.join(work, "outside.json");
  mkdirSync(root);
  writeFileSync(outside, `${JSON.stringify({ rows: [{ field: "x", value: 1, unit: "u" }] })}\n`);
  writeFileSync(path.join(root, "before.json"), readBefore());
  symlinkSync(outside, path.join(root, "after.json"));
  const r = runCli([
    "vendor-budget-impact",
    "--before",
    "before.json",
    "--after",
    "after.json",
    "--input-root",
    root,
  ]);
  assert.equal(r.status, 2, r.stdout);
  assert.equal(r.json.code, "input-path-escapes-root");
});

test("seeded failure: file > 8MiB", () => {
  const work = mkdtempSync(path.join(tmpdir(), "jip-large-"));
  const before = path.join(work, "before.json");
  const after = path.join(work, "after.json");
  writeFileSync(before, readBefore());
  writeFileSync(after, Buffer.alloc(MAX_LOCAL_INPUT_BYTES + 1, 0x61));
  const r = runCli([
    "vendor-budget-impact",
    "--before",
    before,
    "--after",
    after,
    "--input-root",
    work,
  ]);
  assert.equal(r.status, 2, r.stdout);
  assert.equal(r.json.code, "input-too-large");
  assert.equal(r.json.detail.limit, MAX_LOCAL_INPUT_BYTES);
  assert.equal(r.json.detail.size, MAX_LOCAL_INPUT_BYTES + 1);
});

test("seeded failure: digest field that does not match bytes", () => {
  const r = runCli([
    ...JOURNEY_ARGS,
    "--declared-inputs",
    "tools/job-input-preflight/fixtures/declared-mismatch.json",
  ]);
  assert.equal(r.status, 2, r.stdout);
  assert.equal(r.json.ok, false);
  assert.equal(r.json.code, "input-digest-mismatch");
  assert.equal(r.json.engineInvoked, false);
  assert.match(r.json.detail.declaredDigest, /^sha256:0{64}$/);
});

test("seeded failure: integer digest is rejected (I01, not original F01 integer termsVersion)", () => {
  const r = runCli([...JOURNEY_ARGS, "--before-digest", "7"]);
  assert.equal(r.status, 2, r.stdout);
  assert.equal(r.json.code, "invalid-digest");
});

function readBefore() {
  return `${JSON.stringify({ label: "caller", rows: [{ field: "x", value: 1, unit: "u" }] })}\n`;
}
