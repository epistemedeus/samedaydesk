import assert from "node:assert/strict";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import { callerBudget, extractCold, isolateDir, sharedColdKit, wipeSharedKit } from "../lib/kit.mjs";
import { outputRoot, outputsPresent, runUsefulJobs } from "../lib/jobs.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const PARTIAL = join(here, "../fixtures/partial-crash.mjs");

describe("stale out-dir and partial writes on shipped CLI", { timeout: 60_000 }, () => {
  it("complete lockfile run overwrites caller --out-dir; generatedAt is this run", () => {
    const kit = sharedColdKit();
    const out = isolateDir("w5-d16-final-lf-stale-");
    writeFileSync(join(out, "pin-delta.json"), '{"stale":true}\n');
    writeFileSync(join(out, "pin-delta.md"), "STALE-LOCK-MD\n");
    const before = new Date().toISOString();
    const r = runUsefulJobs(kit, [
      "run",
      "lockfile-pin-delta",
      "--before",
      join(kit, "samples/lockfile/h04-pub-lock-01/before.json"),
      "--after",
      join(kit, "samples/lockfile/h04-pub-lock-01/after.json"),
      "--out-dir",
      out,
    ]);
    assert.equal(r.status, 0);
    assert.equal(r.json?.ok, true);
    assert.equal(r.json?.outDir, out);
    const report = JSON.parse(readFileSync(join(out, "pin-delta.json"), "utf8"));
    const md = readFileSync(join(out, "pin-delta.md"), "utf8");
    assert.notEqual(report.stale, true);
    assert.equal(md.includes("STALE-LOCK-MD"), false);
    assert.ok(report.generatedAt >= before, `generatedAt ${report.generatedAt} before ${before}`);
  });

  it("vendor-budget with existing outputs writes a sibling; requested dir stays old", () => {
    const kit = sharedColdKit();
    const files = callerBudget();
    const out = isolateDir("w5-d16-final-vb-stale-");
    writeFileSync(join(out, "budget-impact.json"), '{"stale":true}\n');
    writeFileSync(join(out, "budget-impact.md"), "STALE-VENDOR-MD\n");
    const r = runUsefulJobs(kit, [
      "run",
      "vendor-budget-impact",
      "--before",
      files.before,
      "--after",
      files.after,
      "--out-dir",
      out,
    ]);
    assert.equal(r.status, 0);
    assert.equal(r.json?.ok, true);
    assert.notEqual(r.json?.outDir, out);
    assert.equal(JSON.parse(readFileSync(join(out, "budget-impact.json"), "utf8")).stale, true);
    const fresh = outputRoot(out, r.json);
    assert.deepEqual(outputsPresent(fresh, ["budget-impact.json", "budget-impact.md"]), [
      "budget-impact.json",
      "budget-impact.md",
    ]);
    assert.notEqual(JSON.parse(readFileSync(join(fresh, "budget-impact.json"), "utf8")).stale, true);
  });

  it("injected crash after json write leaves previous md in lockfile --out-dir", () => {
    const parent = isolateDir("w5-d16-final-partial-");
    const kit = extractCold(parent);
    const bin = join(kit, "engines/lockfile-pin-delta/bin/lockfile-delta.mjs");
    mkdirSync(dirname(bin), { recursive: true });
    copyFileSync(PARTIAL, bin);
    chmodSync(bin, 0o755);
    const out = isolateDir("w5-d16-final-partial-out-");
    writeFileSync(join(out, "pin-delta.json"), '{"stale":true}\n');
    writeFileSync(join(out, "pin-delta.md"), "ORPHAN-MD-PREVIOUS-RUN\n");
    const r = runUsefulJobs(kit, [
      "run",
      "lockfile-pin-delta",
      "--before",
      join(kit, "samples/lockfile/h04-pub-lock-01/before.json"),
      "--after",
      join(kit, "samples/lockfile/h04-pub-lock-01/after.json"),
      "--out-dir",
      out,
    ]);
    assert.equal(r.status, 1);
    assert.notEqual(r.json?.ok, true);
    const json = JSON.parse(readFileSync(join(out, "pin-delta.json"), "utf8"));
    const md = readFileSync(join(out, "pin-delta.md"), "utf8");
    assert.equal(json.thisRun, true);
    assert.equal(md.includes("ORPHAN-MD-PREVIOUS-RUN"), true);
    rmSync(parent, { recursive: true, force: true });
  });

  after(() => {
    wipeSharedKit();
  });
});
