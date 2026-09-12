import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  ARCHIVE_100,
  ARCHIVE_110,
  SIX_JOBS_100,
  TEN_JOBS,
} from "../lib/pins.mjs";
import {
  COLD_SRC,
  SDS_REPO,
  coldEnv,
  ensureCold100,
  ensureCold110,
  sha256File,
} from "../lib/cold-root.mjs";
import { invokeUsefulJobs, invokeUsefulJobs100 } from "../lib/invoke.mjs";
import { ensureIndependentInputs } from "../lib/inputs.mjs";
import { expectProcessOk, outDir } from "./helpers.mjs";

describe("useful-jobs 1.1.0 archive kit", () => {
  it("matches D01 public bytes and extracts outside the git checkout", () => {
    const kit = ensureCold110();
    const tar = join(COLD_SRC, "useful-jobs-1.1.0.tar.gz");
    assert.equal(sha256File(tar), ARCHIVE_110.sha256);
    assert.equal(readFileSync(tar).length, ARCHIVE_110.bytes);
    assert.ok(!kit.startsWith(SDS_REPO), `extract must be outside repo: ${kit}`);
    assert.ok(kit.includes("/tmp/"), kit);
    assert.ok(existsSync(join(kit, "bin/useful-jobs.mjs")));
  });

  it("keeps useful-jobs 1.0.0 byte-unchanged", () => {
    const kit = ensureCold100();
    const tar = join(COLD_SRC, "useful-jobs-1.0.0.tar.gz");
    assert.equal(sha256File(tar), ARCHIVE_100.sha256);
    assert.equal(readFileSync(tar).length, ARCHIVE_100.bytes);
    const pkg = JSON.parse(readFileSync(join(kit, "package.json"), "utf8"));
    assert.equal(pkg.version, "1.0.0");
    const catalog = JSON.parse(readFileSync(join(kit, "catalog.json"), "utf8"));
    assert.equal(catalog.version, "1.0.0");
    assert.deepEqual(
      catalog.jobs.map((j) => j.id),
      SIX_JOBS_100,
    );
  });

  it("ships legal attribution, catalog, engines, and per-job entrypoints", () => {
    const kit = ensureCold110();
    for (const name of ["LICENSE", "NOTICE", "catalog.json", "jobs-outcomes.json", "package.json", "README.md"]) {
      assert.ok(existsSync(join(kit, name)), name);
    }
    const license = readFileSync(join(kit, "LICENSE"), "utf8");
    assert.match(license, /MIT License/);
    const notice = readFileSync(join(kit, "NOTICE"), "utf8");
    assert.match(notice, /1\.1\.0/);
    const pkg = JSON.parse(readFileSync(join(kit, "package.json"), "utf8"));
    assert.equal(pkg.version, "1.1.0");
    assert.equal(pkg.engines.node, ">=22");
    const catalog = JSON.parse(readFileSync(join(kit, "catalog.json"), "utf8"));
    assert.equal(catalog.version, "1.1.0");
    assert.equal(catalog.runtime.purchaseAuthority, false);
    assert.deepEqual(
      catalog.jobs.map((j) => j.id),
      TEN_JOBS,
    );
    for (const id of TEN_JOBS) {
      assert.ok(existsSync(join(kit, "apps", id, "cli.mjs")), `apps/${id}/cli.mjs`);
      assert.ok(existsSync(join(kit, "apps", id, "CALLER.md")), `apps/${id}/CALLER.md`);
    }
    for (const engine of [
      "lockfile-pin-delta",
      "json-schema-webhook-drift",
      "route-table-diff",
      "page-change-offline-job",
    ]) {
      assert.ok(existsSync(join(kit, "engines", engine)), engine);
    }
    const vendor = readdirSync(join(kit, "licenses/vendor"));
    assert.ok(vendor.length > 0, "licenses/vendor should not be empty");
    assert.ok(existsSync(join(kit, "vendor-pins/PIN.json")));
  });

  it("prints version-consistent ordinary commands and does not advertise timeout", () => {
    const version = invokeUsefulJobs({ argv: ["version"] });
    assert.equal(version.status, 0);
    assert.match(version.stdout, /useful-jobs 1\.1\.0/);
    const list = invokeUsefulJobs({ argv: ["list"] });
    assert.equal(list.status, 0);
    for (const id of TEN_JOBS) assert.match(list.stdout, new RegExp(id));
    const help = invokeUsefulJobs({ argv: ["help"] });
    assert.equal(help.status, 0);
    assert.doesNotMatch(help.stdout, /--timeout/);
    const readme = readFileSync(join(ensureCold110(), "README.md"), "utf8");
    assert.match(readme, /node bin\/useful-jobs\.mjs list/);
    assert.match(readme, /useful-jobs 1\.1\.0/);
    assert.match(readme, /No purchase/);
  });

  it("sanitizes the child environment of private Pilot paths and injected catalog keys", () => {
    const env = coldEnv();
    const keys = Object.keys(env);
    for (const key of keys) {
      assert.doesNotMatch(key, /PILOT|CURSOR|OPENAI|ANTHROPIC|STRIPE|ANTHROPIC|API_KEY|CATALOG/i);
    }
    assert.equal(env.HOME.startsWith("/tmp/"), true);
    assert.ok(!String(env.PATH || "").includes("/agent/repos/pilot"));
  });

  it("still runs a 1.0.0 original job with independent caller files", () => {
    const fx = ensureIndependentInputs();
    const out = outDir("legacy-100-budget");
    const run = invokeUsefulJobs100({
      argv: [
        "run",
        "vendor-budget-impact",
        "--before",
        fx.pricing.before,
        "--after",
        fx.pricing.afterChange,
        "--out-dir",
        out,
      ],
    });
    const classified = expectProcessOk(run, { jobId: "vendor-budget-impact", out });
    assert.match(String(classified.analysisStatus || ""), /actionable|informational|partial/);
    const version = invokeUsefulJobs100({ argv: ["version"] });
    assert.match(version.stdout, /useful-jobs 1\.0\.0/);
  });
});
