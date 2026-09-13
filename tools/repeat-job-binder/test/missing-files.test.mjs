import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { extractKit, readJson, runBind, runNode } from "./helpers.mjs";

test("missing after file stays informational, not a verified second use", () => {
  const kit = extractKit();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "w4-rjb-missing-"));
  const firstOut = path.join(work, "first");
  fs.mkdirSync(firstOut, { recursive: true });
  const nextRun = path.join(kit.usefulJobsRoot, "samples/repeat/a/next-run.json");
  const recorded = runNode(
    kit.usefulJobsCli,
    ["run", "repeat-job-record", "--next-run", nextRun, "--out-dir", firstOut],
    { cwd: kit.usefulJobsRoot },
  );
  assert.equal(recorded.json.ok, true);

  const before = path.join(kit.usefulJobsRoot, "samples/pricing/a/before.json");
  const missingAfter = path.join(work, "does-not-exist.json");
  const out = path.join(work, "second");
  const r = runBind([
    "--ticket",
    path.join(firstOut, "repeat-job.json"),
    "--before",
    before,
    "--after",
    missingAfter,
    "--out-dir",
    out,
  ]);
  assert.equal(r.json.ok, true, r.stdout);
  assert.equal(r.json.status, "informational");
  assert.equal(r.json.identityVerified, false);
  const second = readJson(path.join(out, "second-run.json"));
  assert.equal(second.secondRun.engine, null);
  assert.ok(second.missing.some((m) => m.slot === "after"));
});
