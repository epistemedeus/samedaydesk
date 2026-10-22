import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { bindEngine } from "../lib/bind.mjs";
import { runPublishedJob } from "../lib/engine.mjs";
import { PACK_ROOT, parseReceipt, runDesk } from "./helpers.mjs";

test("changed-input repeat delivers a different engine digest", () => {
  const r = runDesk([
    "repeat",
    "--job",
    "vendor-budget-impact",
    "--before",
    join(PACK_ROOT, "callers/vendor/before.json"),
    "--after",
    join(PACK_ROOT, "callers/vendor/after.json"),
    "--after-repeat",
    join(PACK_ROOT, "callers/vendor/after-repeat.json"),
    "--out-dir",
    join(PACK_ROOT, "out", "test-repeat-vendor"),
  ]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const body = parseReceipt(r);
  assert.equal(body.ok, true);
  assert.equal(body.delivered, true);
  assert.equal(body.code, "changed-input-repeat");
  assert.equal(body.repeat.changedInput, true);
  assert.equal(body.repeat.sameFixture, false);
  assert.equal(body.repeat.repeatDemand, false);
  assert.equal(body.repeatDemand, false);
  assert.notEqual(body.first.outputFingerprint, body.second.outputFingerprint);
  assert.equal(body.callerFilesUnchanged, true);
  assert.equal(body.engine.cliInvoked, true);
});

test("lockfile changed-input repeat is distinct after stripping volatile fields", () => {
  const r = runDesk([
    "repeat",
    "--job",
    "lockfile-pin-delta",
    "--before",
    join(PACK_ROOT, "callers/lockfile/before.json"),
    "--after",
    join(PACK_ROOT, "callers/lockfile/after.json"),
    "--after-repeat",
    join(PACK_ROOT, "callers/lockfile/after-repeat.json"),
    "--out-dir",
    join(PACK_ROOT, "out", "test-repeat-lockfile"),
  ]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const body = parseReceipt(r);
  assert.equal(body.ok, true);
  assert.equal(body.delivered, true);
  assert.equal(body.repeat.changedInput, true);
  assert.notEqual(body.first.outputFingerprint, body.second.outputFingerprint);
});

test("same lockfile callers to two out-dirs share fingerprint when digest differs", () => {
  const bound = bindEngine();
  const before = join(PACK_ROOT, "callers/lockfile/before.json");
  const after = join(PACK_ROOT, "callers/lockfile/after.json");
  const dirA = join(PACK_ROOT, "out", "test-same-a");
  const dirB = join(PACK_ROOT, "out", "test-same-b");
  mkdirSync(dirA, { recursive: true });
  mkdirSync(dirB, { recursive: true });
  const first = runPublishedJob(bound, {
    job: "lockfile-pin-delta",
    args: ["--before", before, "--after", after],
    outDir: dirA,
  });
  const second = runPublishedJob(bound, {
    job: "lockfile-pin-delta",
    args: ["--before", before, "--after", after],
    outDir: dirB,
  });
  assert.equal(first.delivered, true, first.stderr || first.stdout);
  assert.equal(second.delivered, true, second.stderr || second.stdout);
  assert.notEqual(first.digest, second.digest);
  assert.equal(first.outputFingerprint, second.outputFingerprint);
});

test("unchanged after file is not a repeat", () => {
  const r = runDesk([
    "repeat",
    "--job",
    "vendor-budget-impact",
    "--before",
    join(PACK_ROOT, "callers/vendor/before.json"),
    "--after",
    join(PACK_ROOT, "callers/vendor/after.json"),
    "--after-repeat",
    join(PACK_ROOT, "callers/vendor/after.json"),
  ]);
  assert.equal(r.status, 2);
  const body = parseReceipt(r);
  assert.equal(body.ok, false);
  assert.equal(body.delivered, false);
  assert.equal(body.refused, true);
  assert.equal(body.code, "unchanged-input-repeat");
  assert.equal(body.repeat.sameFixture, true);
  assert.equal(body.repeatDemand, false);
});
