import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { COMPAT_ORIGINAL_SIX, FOUR_NEW, PINNED_IMPLEMENTATION } from "../lib/contract.mjs";
import { parseStdoutJson } from "../lib/json.mjs";
import { isolateDir, requirePinnedTree, sharedColdKit, wipeSharedKit } from "../lib/kit.mjs";
import { JOBS, outputRoot, outputsPresent, runUsefulJobs } from "../lib/jobs.mjs";

describe("public 1.2.0 CLI isolated success (four new + original-six compat)", { timeout: 60_000 }, () => {
  it("pins the PR74/PR114 archive identity", () => {
    const pinned = requirePinnedTree();
    assert.equal(pinned.digest, PINNED_IMPLEMENTATION.archiveSha256);
    assert.equal(pinned.bytes, PINNED_IMPLEMENTATION.archiveBytes);
  });

  it("runs lockfile, schema, route, page, and vendor-budget into own out-dirs", () => {
    const kit = sharedColdKit();
    const seen = [];
    for (const job of JOBS) {
      const out = isolateDir(`w5-d16-final-iso-${job.id}-`);
      const r = runUsefulJobs(kit, job.argv(kit, out));
      assert.equal(r.status, 0, `${job.id} exit ${r.status} stderr=${r.stderr}`);
      assert.equal(r.wholeJson, true, `${job.id} stdout is not one JSON document`);
      assert.equal(r.json?.ok, true, `${job.id} ${JSON.stringify(r.json).slice(0, 200)}`);
      assert.notEqual(r.json?.purchaseAuthority, true);
      const root = outputRoot(out, r.json);
      const present = outputsPresent(root, job.outputs);
      assert.deepEqual(present, job.outputs, `${job.id} missing outputs in ${root}`);
      seen.push(job.id);
    }
    assert.deepEqual(
      seen,
      [...FOUR_NEW, COMPAT_ORIGINAL_SIX],
    );
  });

  it("lockfileVersion 1 is an explicit unsupported refusal, not a success", () => {
    const kit = sharedColdKit();
    const work = isolateDir("w5-d16-final-v1-");
    writeFileSync(join(work, "b.json"), `${JSON.stringify({ lockfileVersion: 1, packages: {} })}\n`);
    writeFileSync(join(work, "a.json"), `${JSON.stringify({ lockfileVersion: 1, packages: {} })}\n`);
    const out = isolateDir("w5-d16-final-v1-out-");
    const r = runUsefulJobs(kit, [
      "run",
      "lockfile-pin-delta",
      "--before",
      join(work, "b.json"),
      "--after",
      join(work, "a.json"),
      "--out-dir",
      out,
    ]);
    assert.equal(r.status, 2);
    assert.equal(r.json?.ok, false);
    assert.equal(r.json?.refused, true);
    assert.equal(r.json?.code, "unsupported-lockfile-version");
    assert.equal(existsSync(join(out, "pin-delta.json")), false);
  });

  it("page-change --example is a documented refusal, not a lifecycle crash", () => {
    const kit = sharedColdKit();
    const out = isolateDir("w5-d16-final-page-ex-");
    const r = runUsefulJobs(kit, ["run", "page-change-offline-job", "--example", "--out-dir", out]);
    assert.equal(r.status, 2);
    const refuse = parseStdoutJson(r.stderr).json || parseStdoutJson(r.stdout).json;
    assert.equal(refuse?.ok, false);
    assert.equal(refuse?.code, "sample_as_delivered_watch");
    assert.equal(existsSync(join(out, "page-change.json")), false);
  });

  after(() => {
    wipeSharedKit();
  });
});
