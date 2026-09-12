/**
 * Optional D01/PR52 wrapper CLI proof. Not part of `npm test` because that
 * sibling tree is not in this branch. Run with SDS_D01_WRAPPER_BIN set.
 *
 *   SDS_D01_WRAPPER_BIN=/path/to/server/paid-useful-jobs/bin/cli.mjs \
 *     node --test --test-concurrency=1 test/d01-wrapper.integration.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { D01_PIN_SHA } from "../lib/pins.mjs";
import { extractKit, readJson, runBind, runNode, sha256File, writeJson } from "./helpers.mjs";

const wrapper = process.env.SDS_D01_WRAPPER_BIN;

if (!wrapper || !fs.existsSync(wrapper)) {
  throw new Error(
    `incomplete D01 wrapper proof: set SDS_D01_WRAPPER_BIN to ${D01_PIN_SHA} server/paid-useful-jobs/bin/cli.mjs`,
  );
}

function mutateAfter(src, dest) {
  const doc = JSON.parse(fs.readFileSync(src, "utf8"));
  doc.rows = doc.rows.map((row) =>
    row.field === "gpt-4.1-input" ? { ...row, value: 4 } : row,
  );
  writeJson(dest, doc);
}

test(`D01 wrapper pin ${D01_PIN_SHA} analyzes frozen changed after`, () => {
  const kit = extractKit();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "w5-d09-d01-"));
  const firstOut = path.join(work, "first");
  fs.mkdirSync(firstOut, { recursive: true });
  const recorded = runNode(
    kit.usefulJobsCli,
    [
      "run",
      "repeat-job-record",
      "--next-run",
      path.join(kit.usefulJobsRoot, "samples/repeat/a/next-run.json"),
      "--out-dir",
      firstOut,
    ],
    { cwd: kit.usefulJobsRoot },
  );
  assert.equal(recorded.json.ok, true, recorded.stdout);
  const before = path.join(work, "before.json");
  const after = path.join(work, "after.json");
  fs.copyFileSync(path.join(kit.usefulJobsRoot, "samples/pricing/a/before.json"), before);
  mutateAfter(path.join(kit.usefulJobsRoot, "samples/pricing/a/after.json"), after);
  const newSha = sha256File(after);
  const out = path.join(work, "second");
  const bound = runBind([
    "--ticket",
    path.join(firstOut, "repeat-job.json"),
    "--before",
    before,
    "--after",
    after,
    "--declare-after-sha256",
    newSha,
    "--engine",
    "d01-wrapper",
    "--paid-wrapper-bin",
    wrapper,
    "--out-dir",
    out,
  ]);
  assert.equal(bound.json.ok, true, bound.stdout);
  assert.equal(bound.json.engineKind, "d01-wrapper");
  // Same samples/pricing/a unit-spelling conflict as the catalog CLI control.
  assert.equal(bound.json.status, "analysis-partial");
  assert.equal(bound.json.analysisOutcome, "partial");
  assert.equal(bound.json.transport.ok, true);
  const second = readJson(path.join(out, "second-run.json"));
  assert.equal(second.frozen.current.after.sha256, newSha);
  assert.ok(second.secondRun.engine.argv.includes(second.frozen.current.after.frozenPath));
  assert.equal(fs.existsSync(path.join(out, "engine/budget-impact.json")), true);
});
