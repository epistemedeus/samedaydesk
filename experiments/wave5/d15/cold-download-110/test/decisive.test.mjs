import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { classifyCold } from "../lib/classify.mjs";
import { COLD_INPUTS, COLD_RUNS, ensureCold110 } from "../lib/cold-root.mjs";
import { ensureIndependentInputs } from "../lib/inputs.mjs";
import { invokeUsefulJobs, runJob, runJobAsync } from "../lib/invoke.mjs";
import { expectProcessOk, expectRefusal, outDir } from "./helpers.mjs";

describe("decisive cold-customer cases", () => {
  it("runs the ordinary command from a cwd whose path contains spaces", () => {
    const kit = ensureCold110();
    const fx = ensureIndependentInputs();
    const cwd = join(COLD_RUNS, "cwd with spaces", "useful-jobs-1.1.0");
    mkdirSync(cwd, { recursive: true });
    copyFileSync(fx.lock.before, join(cwd, "before.json"));
    copyFileSync(fx.lock.afterChange, join(cwd, "after.json"));
    const out = join(cwd, "out lock");
    const run = invokeUsefulJobs({
      argv: [
        "run",
        "lockfile-pin-delta",
        "--before",
        "./before.json",
        "--after",
        "./after.json",
        "--out-dir",
        "./out lock",
      ],
      cwd,
    });
    expectProcessOk(run, { jobId: "lockfile-pin-delta", out, analysis: /actionable/i });
    assert.ok(cwd.includes(" "), cwd);
    assert.equal(run.cwd, cwd);
    assert.ok(existsSync(join(out, "pin-delta.json")));
    const cliIsRelative = run.command[1] === "bin/useful-jobs.mjs";
    assert.equal(cliIsRelative, true);
  });

  it("resolves page before/after via relative .., absolute, and symlink sentinels only", () => {
    const fx = ensureIndependentInputs();
    const rel = expectProcessOk(
      runJob("page-change-offline-job", ["--job", fx.page.jobDotDot, "--out-dir", outDir("page-dotdot")]),
      { jobId: "page-change-offline-job", out: outDir("page-dotdot"), analysis: /changed/i },
    );
    const abs = expectProcessOk(
      runJob("page-change-offline-job", ["--job", fx.page.jobAbs, "--out-dir", outDir("page-abs")]),
      { jobId: "page-change-offline-job", out: outDir("page-abs"), analysis: /changed/i },
    );
    const sym = expectProcessOk(
      runJob("page-change-offline-job", ["--job", fx.page.jobSym, "--out-dir", outDir("page-sym")]),
      { jobId: "page-change-offline-job", out: outDir("page-sym"), analysis: /changed/i },
    );
    assert.equal(rel.purchaseAuthority, false);
    assert.equal(abs.purchaseAuthority, false);
    assert.equal(sym.purchaseAuthority, false);
  });

  it("refuses truncated after JSON as unrecognized rather than writing a full brief", () => {
    const fx = ensureIndependentInputs();
    const run = runJob("page-change-offline-job", [
      "--job",
      fx.page.jobPartial,
      "--out-dir",
      outDir("page-truncated"),
    ]);
    expectRefusal(run, /unrecognized_batch|not JSON|unrecognized/i);
  });

  it("binds artifact paths and receipts across parallel distinct orders", async () => {
    const fx = ensureIndependentInputs();
    const outA = outDir("parallel-a");
    const outB = outDir("parallel-b");
    const [a, b] = await Promise.all([
      runJobAsync("lockfile-pin-delta", [
        "--before",
        fx.lock.before,
        "--after",
        fx.lock.afterChange,
        "--out-dir",
        outA,
      ]),
      runJobAsync("lockfile-pin-delta", [
        "--before",
        fx.lock.orderBBefore,
        "--after",
        fx.lock.orderBAfter,
        "--out-dir",
        outB,
      ]),
    ]);
    const classA = expectProcessOk(a, { jobId: "lockfile-pin-delta", out: outA });
    const classB = expectProcessOk(b, { jobId: "lockfile-pin-delta", out: outB });
    assert.notEqual(outA, outB);
    assert.ok(String(a.json?.outDir || outA).includes("parallel-a"));
    assert.ok(String(b.json?.outDir || outB).includes("parallel-b"));
    const textA = readFileSync(join(outA, "pin-delta.json"), "utf8");
    const textB = readFileSync(join(outB, "pin-delta.json"), "utf8");
    assert.match(textA, /left-pad/);
    assert.match(textB, /once/);
    assert.doesNotMatch(textA, /"once"/);
    assert.doesNotMatch(textB, /left-pad/);
    assert.notEqual(classA.digest, classB.digest);
  });

  it("does not advertise a caller --timeout switch", () => {
    const help = invokeUsefulJobs({ argv: ["help", "lockfile-pin-delta"] });
    assert.equal(help.status, 0);
    assert.doesNotMatch(help.stdout, /--timeout/);
    const classified = classifyCold(help);
    assert.notEqual(classified.kind, "timeout");
  });

  it("uses nonzero exit 2 for missing required inputs", () => {
    expectRefusal(runJob("lockfile-pin-delta", ["--out-dir", outDir("lock-missing")]), /missing-required-inputs/i);
  });

  it("unknown listing provider does not keep incomplete capture as partial", () => {
    const fx = ensureIndependentInputs();
    const input = JSON.parse(readFileSync(fx.listing.partial, "utf8"));
    input.identity.provider = "d15cold";
    const path = join(COLD_INPUTS, "listing/unknown-provider-partial.json");
    mkdirSync(join(COLD_INPUTS, "listing"), { recursive: true });
    writeFileSync(path, `${JSON.stringify(input, null, 2)}\n`);
    const out = outDir("listing-unknown-provider");
    const classified = expectProcessOk(
      runJob("listing-repair-packet", ["--input", path, "--out-dir", out]),
      { jobId: "listing-repair-packet", out },
    );
    assert.equal(
      classified.analysisStatus,
      "actionable",
      "observed: unknown provider + captureIncomplete is actionable; advertised incomplete capture is partial",
    );
  });

  it("reuses H04 lock-02, lock-03, and page-02 only as extra coverage", () => {
    const fx = ensureIndependentInputs();
    const lock02 = expectProcessOk(
      runJob("lockfile-pin-delta", [
        "--before",
        fx.h04["h04-pub-lock-02"].before,
        "--after",
        fx.h04["h04-pub-lock-02"].after,
        "--out-dir",
        outDir("h04-lock-02"),
      ]),
      { jobId: "lockfile-pin-delta", out: outDir("h04-lock-02") },
    );
    const lock03 = expectProcessOk(
      runJob("lockfile-pin-delta", [
        "--before",
        fx.h04["h04-pub-lock-03"].before,
        "--after",
        fx.h04["h04-pub-lock-03"].after,
        "--out-dir",
        outDir("h04-lock-03"),
      ]),
      { jobId: "lockfile-pin-delta", out: outDir("h04-lock-03") },
    );
    const page02 = expectProcessOk(
      runJob("page-change-offline-job", ["--job", fx.h04["h04-page-02"].job, "--out-dir", outDir("h04-page-02")]),
      { jobId: "page-change-offline-job", out: outDir("h04-page-02"), analysis: /unchanged/i },
    );
    assert.equal(lock02.purchaseAuthority, false);
    assert.equal(lock03.purchaseAuthority, false);
    assert.equal(page02.purchaseAuthority, false);
  });
});
