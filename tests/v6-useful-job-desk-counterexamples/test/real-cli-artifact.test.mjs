import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkDeskProcess, checkDeskReport } from "../lib/check-report.mjs";
import { extractJsonObjects, parseableErrorFromProcess } from "../lib/parse-error.mjs";
import { extractCommittedKit, runUsefulJobs } from "../lib/kit.mjs";

test("committed archive extracts the public useful-jobs CLI", () => {
  const { kit, cli, meta } = extractCommittedKit();
  assert.equal(meta.name, "useful-jobs-1.4.7");
  assert.equal(meta.bytes, 5255824);
  assert.equal(meta.sha256, "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec");
  assert.equal(existsSync(cli), true);
  assert.match(kit, /useful-jobs-1\.4\.7$/);
});

test("real CLI missing inputs: nonzero exit and parseable error, not delivered", () => {
  const outDir = mkdtempSync(join(tmpdir(), "v6-uj-missing-"));
  const proc = runUsefulJobs(["run", "lockfile-pin-delta", "--out-dir", outDir]);
  assert.notEqual(proc.status, 0);
  assert.equal(proc.status, 2, proc.stderr || proc.stdout);
  const parsed = parseableErrorFromProcess(proc);
  assert.ok(parsed, `expected parseable error; stdout=${proc.stdout} stderr=${proc.stderr}`);
  assert.equal(parsed.parsed.parseable, true);
  assert.equal(parsed.parsed.ok, false);
  assert.equal(parsed.source.ok, false);
  assert.equal(parsed.source.refused, true);
  assert.equal(parsed.source.code, "missing-required-inputs");
  assert.match(parsed.parsed.error, /--before/);
  assert.equal(existsSync(join(outDir, "pin-delta.json")), false);
  assert.equal(existsSync(join(outDir, "pin-delta.md")), false);
  const checked = checkDeskProcess(proc, { jobId: "lockfile-pin-delta", outDir });
  assert.equal(checked.ok, true, JSON.stringify(checked));
  assert.equal(checked.delivered, false);
  assert.equal(checked.parseableError, true);
  assert.equal(checked.status, 2);
});

test("real CLI unknown job: nonzero exit and parseable error", () => {
  const proc = runUsefulJobs(["run", "not-a-real-job"]);
  assert.equal(proc.status, 2);
  const objects = extractJsonObjects(proc.stderr);
  assert.equal(objects[0].ok, false);
  assert.match(objects[0].error, /unknown job/);
  const parsed = parseableErrorFromProcess(proc);
  assert.equal(parsed.parsed.parseable, true);
});

test("real CLI --example writes both promised files; delivered claim is honest", () => {
  const outDir = mkdtempSync(join(tmpdir(), "v6-uj-example-"));
  const proc = runUsefulJobs(["run", "lockfile-pin-delta", "--example", "--out-dir", outDir]);
  assert.equal(proc.status, 0, proc.stderr || proc.stdout);
  assert.equal(existsSync(join(outDir, "pin-delta.json")), true);
  assert.equal(existsSync(join(outDir, "pin-delta.md")), true);
  const report = {
    ...extractJsonObjects(proc.stdout)[0],
    jobId: "lockfile-pin-delta",
    outDir,
    delivered: true,
    status: "delivered",
  };
  const checked = checkDeskReport(report, { outDir, jobId: "lockfile-pin-delta" });
  assert.equal(checked.ok, true, JSON.stringify(checked));
  assert.equal(checked.delivered, true);
  assert.deepEqual(checked.present.sort(), ["pin-delta.json", "pin-delta.md"]);
});

test("after a real run, deleting an output makes a delivered report fail", () => {
  const outDir = mkdtempSync(join(tmpdir(), "v6-uj-delete-"));
  const proc = runUsefulJobs(["run", "lockfile-pin-delta", "--example", "--out-dir", outDir]);
  assert.equal(proc.status, 0, proc.stderr || proc.stdout);
  unlinkSync(join(outDir, "pin-delta.md"));
  const report = {
    ok: true,
    status: "delivered",
    delivered: true,
    jobId: "lockfile-pin-delta",
    outDir,
  };
  const checked = checkDeskReport(report, { outDir, jobId: "lockfile-pin-delta" });
  assert.equal(checked.ok, false);
  assert.equal(checked.parseable, true);
  assert.equal(checked.code, "missing_output_reported_delivered");
  assert.deepEqual(checked.failure.missing, ["pin-delta.md"]);
  assert.deepEqual(checked.failure.present, ["pin-delta.json"]);
});

test("exit 0 with ok:true and empty out dir is missing_output_reported_delivered", () => {
  const outDir = mkdtempSync(join(tmpdir(), "v6-uj-empty-ok-"));
  const fake = {
    status: 0,
    stdout: JSON.stringify({
      ok: true,
      status: "delivered",
      delivered: true,
      jobId: "lockfile-pin-delta",
      outDir,
    }),
    stderr: "",
  };
  const checked = checkDeskProcess(fake, { jobId: "lockfile-pin-delta", outDir });
  assert.equal(checked.ok, false);
  assert.equal(checked.code, "missing_output_reported_delivered");
  assert.notEqual(checked.status, undefined);
});

test("nonzero exit with no JSON is unparseable_error", () => {
  const checked = checkDeskProcess(
    { status: 1, stdout: "boom", stderr: "engine crashed" },
    { jobId: "lockfile-pin-delta" },
  );
  assert.equal(checked.ok, false);
  assert.equal(checked.parseable, true);
  assert.equal(checked.code, "unparseable_error");
});

test("directory named like an output is not a delivered file", () => {
  const outDir = mkdtempSync(join(tmpdir(), "v6-uj-dir-"));
  mkdirSync(join(outDir, "pin-delta.json"));
  writeFileSync(join(outDir, "pin-delta.md"), "md\n");
  const report = {
    ok: true,
    status: "delivered",
    delivered: true,
    jobId: "lockfile-pin-delta",
    outDir,
  };
  const checked = checkDeskReport(report, { outDir });
  assert.equal(checked.ok, false);
  assert.equal(checked.code, "missing_output_reported_delivered");
  assert.deepEqual(checked.failure.missing, ["pin-delta.json"]);
});
