import assert from "node:assert/strict";
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { ensureUsefulJobsKit } from "../lib/kit.mjs";
import { parseJsonStdout, replayBin, spawnNode, tmpDir } from "./helpers.mjs";

test("journey: replay api-upgrade-brief on archive samples/openapi/a twice via public CLI", async () => {
  const kit = ensureUsefulJobsKit();
  const caller = join(kit, "samples/openapi/a");
  const work = tmpDir("orh-journey-");
  const r = await spawnNode([
    replayBin,
    "--job",
    "api-upgrade-brief",
    "--before",
    join(caller, "before.yaml"),
    "--after",
    join(caller, "after.yaml"),
    "--used",
    join(caller, "used.json"),
    "--out-a",
    join(work, "out-a"),
    "--out-b",
    join(work, "out-b"),
  ]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const body = parseJsonStdout(r);
  assert.equal(body.ok, true);
  assert.equal(body.job, "api-upgrade-brief");
  assert.equal(body.jsonIdentical, true);
  assert.equal(body.identityVerified, true);
  assert.equal(body.sample, false);
  assert.equal(body.example, false);
  assert.equal(body.purchaseAuthority, false);
  assert.equal(body.acceptanceClass, "local-runtime");
  assert.ok(["identical", "labelled-drift"].includes(body.classification));
  assert.deepEqual(body.catalogOutputs, ["upgrade-brief.json", "upgrade-brief.md"]);
  assert.match(body.termsVersion, /^sha256:[0-9a-f]{64}$/);
  assert.notEqual(typeof body.termsVersion, "number");
  assert.equal(body.engine.digestA, body.engine.digestB);
});

test("seeded failure: swapping after.yaml between runs is identity-break", async () => {
  const kit = ensureUsefulJobsKit();
  const work = tmpDir("orh-swap-");
  const caller = join(work, "caller");
  mkdirSync(caller, { recursive: true });
  copyFileSync(join(kit, "samples/openapi/a/before.yaml"), join(caller, "before.yaml"));
  copyFileSync(join(kit, "samples/openapi/a/after.yaml"), join(caller, "after.yaml"));
  copyFileSync(join(kit, "samples/openapi/a/used.json"), join(caller, "used.json"));

  const { replay } = await import("../lib/replay.mjs");
  const report = replay({
    job: "api-upgrade-brief",
    inputs: {
      before: join(caller, "before.yaml"),
      after: join(caller, "after.yaml"),
      used: join(caller, "used.json"),
    },
    outA: join(work, "out-a"),
    outB: join(work, "out-b"),
    betweenRuns() {
      copyFileSync(join(kit, "samples/openapi/caller-alpha/after.yaml"), join(caller, "after.yaml"));
    },
  });
  assert.equal(report.ok, true);
  assert.equal(report.classification, "identity-break");
  assert.equal(report.jsonIdentical, false);
  assert.equal(report.identityVerified, false);
  assert.notEqual(report.engine.digestA, report.engine.digestB);
});

test("seeded failure: --example cannot report identityVerified as a customer replay", async () => {
  const work = tmpDir("orh-ex-");
  const r = await spawnNode([
    replayBin,
    "--job",
    "api-upgrade-brief",
    "--example",
    "--out-a",
    join(work, "out-a"),
    "--out-b",
    join(work, "out-b"),
  ]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const body = parseJsonStdout(r);
  assert.equal(body.ok, true);
  assert.equal(body.example, true);
  assert.equal(body.sample, true);
  assert.equal(body.identityVerified, false);
  assert.equal(body.acceptanceClass, "fixture");
  assert.ok(body.sampleReasons.includes("example-flag"));
});

test("SAMPLE caller-alpha sibling marker stays sample even if JSON identity holds", async () => {
  const kit = ensureUsefulJobsKit();
  const work = tmpDir("orh-sample-");
  const r = await spawnNode([
    replayBin,
    "--job",
    "api-upgrade-brief",
    "--before",
    join(kit, "samples/openapi/caller-alpha/before.yaml"),
    "--after",
    join(kit, "samples/openapi/caller-alpha/after.yaml"),
    "--used",
    join(kit, "samples/openapi/caller-alpha/used.json"),
    "--out-a",
    join(work, "out-a"),
    "--out-b",
    join(work, "out-b"),
  ]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const body = parseJsonStdout(r);
  assert.equal(body.sample, true);
  assert.equal(body.identityVerified, false);
  assert.ok(body.sampleReasons.some((x) => x.startsWith("sibling-marker")));
});

test("missing required caller inputs refuse closed", async () => {
  const work = tmpDir("orh-miss-");
  const r = await spawnNode([
    replayBin,
    "--job",
    "api-upgrade-brief",
    "--out-a",
    join(work, "out-a"),
    "--out-b",
    join(work, "out-b"),
  ]);
  assert.notEqual(r.status, 0);
  const body = parseJsonStdout(r);
  assert.equal(body.ok, false);
  assert.equal(body.code, "missing-required-inputs");
  assert.equal(body.identityVerified, false);
});

test("CLI --after-b is identity-break on the public interface", async () => {
  const kit = ensureUsefulJobsKit();
  const work = tmpDir("orh-afterb-");
  const r = await spawnNode([
    replayBin,
    "--job",
    "api-upgrade-brief",
    "--before",
    join(kit, "samples/openapi/a/before.yaml"),
    "--after",
    join(kit, "samples/openapi/a/after.yaml"),
    "--used",
    join(kit, "samples/openapi/a/used.json"),
    "--after-b",
    join(kit, "samples/openapi/caller-alpha/after.yaml"),
    "--out-a",
    join(work, "out-a"),
    "--out-b",
    join(work, "out-b"),
  ]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const body = parseJsonStdout(r);
  assert.equal(body.classification, "identity-break");
  assert.equal(body.identityVerified, false);
});
