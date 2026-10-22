import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { extractKit, runBind, runNode, sha256File, writeJson } from "./helpers.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const OWNED = path.resolve(here, "..");

test("schedulerDaemon true in a forged manifest refuses", () => {
  const r = runBind(["--ticket", path.join(OWNED, "fixtures/scheduler-daemon.json")], { expectStatus: 2 });
  assert.equal(r.json.ok, false);
  assert.equal(r.json.refused, true);
  assert.equal(r.json.code, "scheduler-daemon-refused");
  assert.equal(r.json.schedulerDaemon, false);
});

test("SAMPLE labelled as live recurrence refuses (forged ticket)", () => {
  const r = runBind(["--ticket", path.join(OWNED, "fixtures/sample-as-live.json")], { expectStatus: 2 });
  assert.equal(r.json.ok, false);
  assert.equal(r.json.refused, true);
  assert.equal(r.json.code, "sample-labelled-as-live-recurrence");
});

test("published SAMPLE caller-alpha with --live-recurrence refuses", () => {
  const kit = extractKit();
  const ticket = path.join(kit.usefulJobsRoot, "samples/repeat/caller-alpha/next-run.json");
  const r = runBind(["--ticket", ticket, "--live-recurrence"], { expectStatus: 2 });
  assert.equal(r.json.code, "sample-labelled-as-live-recurrence");
});

test("stale digest vs new bytes refuses", () => {
  const kit = extractKit();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "w4-rjb-stale-"));
  const firstOut = path.join(work, "first");
  fs.mkdirSync(firstOut, { recursive: true });
  const nextRun = path.join(kit.usefulJobsRoot, "samples/repeat/a/next-run.json");
  const recorded = runNode(kit.usefulJobsCli, ["run", "repeat-job-record", "--next-run", nextRun, "--out-dir", firstOut], {
    cwd: kit.usefulJobsRoot,
  });
  assert.equal(recorded.json.ok, true);
  assert.equal(recorded.json.identityVerified, true);

  const afterSrc = path.join(kit.usefulJobsRoot, "samples/pricing/a/after.json");
  const beforeSrc = path.join(kit.usefulJobsRoot, "samples/pricing/a/before.json");
  const before = path.join(work, "before.json");
  const after = path.join(work, "after.json");
  fs.copyFileSync(beforeSrc, before);
  fs.copyFileSync(afterSrc, after);
  const mutated = JSON.parse(fs.readFileSync(after, "utf8"));
  mutated.rows[0].value = 99;
  writeJson(after, mutated);

  const ticket = path.join(firstOut, "repeat-job.json");
  const r = runBind(
    ["--ticket", ticket, "--before", before, "--after", after, "--out-dir", path.join(work, "second")],
    { expectStatus: 2 },
  );
  assert.equal(r.json.code, "input-digest-mismatch");
  assert.ok(r.json.detail?.mismatches?.some((m) => m.slot === "after"));
});

test("cron install flags refuse", () => {
  const r = runBind(
    ["--ticket", path.join(OWNED, "fixtures/scheduler-daemon.json"), "--install-cron"],
    { expectStatus: 2 },
  );
  assert.equal(r.json.code, "cron-install-refused");
});
