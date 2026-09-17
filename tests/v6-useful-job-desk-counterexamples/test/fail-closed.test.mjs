import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkDeskProcess, checkDeskReport } from "../lib/check-report.mjs";
import { parseableErrorFields } from "../lib/parse-error.mjs";
import { parseStdout, runCheck } from "./helpers.mjs";

function pinDeltaDir() {
  const outDir = mkdtempSync(join(tmpdir(), "v6-fail-closed-"));
  writeFileSync(join(outDir, "pin-delta.json"), "{}\n");
  writeFileSync(join(outDir, "pin-delta.md"), "md\n");
  return outDir;
}

test("delivered claim with no jobId and no outputs is missing_output_reported_delivered", () => {
  const result = checkDeskReport({
    ok: true,
    status: "delivered",
    delivered: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "missing_output_reported_delivered");
  assert.deepEqual(result.failure.expected, []);
});

test("ok:false plus delivered:true with files present is delivered_claim_on_failure", () => {
  const outDir = pinDeltaDir();
  const result = checkDeskReport({
    ok: false,
    delivered: true,
    status: "delivered",
    jobId: "lockfile-pin-delta",
    outDir,
    error: "nope",
    code: "contradiction",
  });
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(result.code, "delivered_claim_on_failure");
});

test("output names that escape outDir are not present files", () => {
  const parent = mkdtempSync(join(tmpdir(), "v6-escape-"));
  const outDir = join(parent, "out");
  mkdirSync(outDir);
  writeFileSync(join(parent, "secret.txt"), "secret\n");
  const result = checkDeskReport(
    {
      ok: true,
      status: "delivered",
      delivered: true,
      jobId: "not-in-catalog",
      outDir,
      outputs: ["../secret.txt"],
    },
    { outDir },
  );
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(result.code, "missing_output_reported_delivered");
  assert.deepEqual(result.failure.present, []);
  assert.deepEqual(result.failure.missing, ["../secret.txt"]);
});

test("exit 0 with a parseable failure report is delivered_claim_on_failure", () => {
  const outDir = pinDeltaDir();
  const checked = checkDeskProcess(
    {
      status: 0,
      stdout: JSON.stringify({
        ok: false,
        code: "missing-required-inputs",
        error: "need --before",
        jobId: "lockfile-pin-delta",
        outDir,
      }),
      stderr: "",
    },
    { jobId: "lockfile-pin-delta", outDir },
  );
  assert.equal(checked.ok, false, JSON.stringify(checked));
  assert.equal(checked.code, "delivered_claim_on_failure");
  assert.equal(checked.status, 0);
});

test("parseableErrorFields does not invent refused:true", () => {
  const parsed = parseableErrorFields({ ok: false, error: "x", code: "plain-error" });
  assert.equal(parsed.parseable, true);
  assert.equal(parsed.refused, false);
});

test("CLI --report without a value is a parseable usage error", () => {
  const proc = runCheck(["--report"]);
  const { json } = parseStdout(proc);
  assert.equal(proc.status, 2, proc.stderr || proc.stdout);
  assert.equal(json.ok, false);
  assert.equal(json.parseable, true);
  assert.equal(json.code, "usage");
  assert.match(json.error, /--report requires a value/);
});
