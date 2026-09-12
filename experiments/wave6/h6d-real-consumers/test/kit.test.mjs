import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { extractKit, runUsefulJob, USEFUL_JOBS } from "../lib/kit.mjs";

test("extractKit unpacks useful-jobs CLI", () => {
  const dest = mkdtempSync(join(tmpdir(), "h6d-kit-"));
  try {
    const kit = extractKit({ destDir: dest });
    assert.equal(kit.bytes, USEFUL_JOBS.bytes);
    assert.match(kit.cli, /useful-jobs\.mjs$/);
    const listed = runUsefulJob({ cli: kit.cli, jobId: "lockfile-pin-delta", args: [] });
    assert.equal(listed.status, 2);
    assert.ok(listed.stdoutJson || /missing-required-inputs/.test(listed.stderr + listed.stdout));
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
});
