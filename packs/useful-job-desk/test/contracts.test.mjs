import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PACK_ROOT, parseReceipt, runDesk } from "./helpers.mjs";

const BEFORE = join(PACK_ROOT, "callers/vendor/before.json");
const AFTER = join(PACK_ROOT, "callers/vendor/after.json");

function vendorListing() {
  return readdirSync(join(PACK_ROOT, "callers/vendor")).sort();
}

test("--example with a value is refused, not delivered", () => {
  const r = runDesk([
    "run",
    "--job",
    "vendor-budget-impact",
    "--example",
    AFTER,
    "--before",
    BEFORE,
    "--after",
    AFTER,
  ]);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  const body = parseReceipt(r);
  assert.equal(body.ok, false);
  assert.equal(body.refused, true);
  assert.equal(body.delivered, false);
  assert.equal(body.code, "example-not-caller-file");
  assert.equal(body.purchaseAuthority, false);
});

test("files outside callers/ are not owned caller files", () => {
  const dir = mkdtempSync(join(tmpdir(), "ujd-foreign-"));
  const before = join(dir, "before.json");
  const after = join(dir, "after.json");
  writeFileSync(before, readFileSync(BEFORE));
  writeFileSync(after, readFileSync(AFTER));
  const r = runDesk([
    "run",
    "--job",
    "vendor-budget-impact",
    "--before",
    before,
    "--after",
    after,
    "--out-dir",
    join(dir, "out"),
  ]);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  const body = parseReceipt(r);
  assert.equal(body.delivered, false);
  assert.equal(body.refused, true);
  assert.equal(body.code, "not-owned-caller-file");
});

test("symlink to a file outside callers/ is refused", () => {
  const dir = mkdtempSync(join(tmpdir(), "ujd-link-"));
  const foreign = join(dir, "after.json");
  writeFileSync(foreign, readFileSync(AFTER));
  const link = join(dir, "after-link.json");
  symlinkSync(foreign, link);
  const r = runDesk([
    "run",
    "--job",
    "vendor-budget-impact",
    "--before",
    BEFORE,
    "--after",
    link,
  ]);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  const body = parseReceipt(r);
  assert.equal(body.code, "not-owned-caller-file");
  assert.equal(body.delivered, false);
});

test("out-dir inside callers/ is refused and does not write outputs there", () => {
  const beforeListing = vendorListing();
  const r = runDesk([
    "run",
    "--job",
    "vendor-budget-impact",
    "--before",
    BEFORE,
    "--after",
    AFTER,
    "--out-dir",
    join(PACK_ROOT, "callers/vendor"),
  ]);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  const body = parseReceipt(r);
  assert.equal(body.ok, false);
  assert.equal(body.refused, true);
  assert.equal(body.delivered, false);
  assert.equal(body.code, "out-dir-inside-callers");
  assert.deepEqual(vendorListing(), beforeListing);
  assert.equal(existsSync(join(PACK_ROOT, "callers/vendor/budget-impact.json")), false);
});

test("--label-repeat-demand false does not count as labelled repeat demand", () => {
  const r = runDesk([
    "repeat",
    "--job",
    "vendor-budget-impact",
    "--before",
    BEFORE,
    "--after",
    AFTER,
    "--after-repeat",
    AFTER,
    "--label-repeat-demand",
    "false",
  ]);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  const body = parseReceipt(r);
  assert.equal(body.delivered, false);
  assert.equal(body.code, "unchanged-input-repeat");
  assert.equal(body.repeat.labelledRepeatDemand, false);
  assert.equal(body.repeatDemand, false);
});
