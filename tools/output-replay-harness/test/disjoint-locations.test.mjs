import assert from "node:assert/strict";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { ensureUsefulJobsKit } from "../lib/kit.mjs";
import { ReplayRefuse } from "../lib/args.mjs";
import { parseJsonStdout, replayBin, spawnNode, stageOpenApiCaller, tmpDir } from "./helpers.mjs";

const kit = ensureUsefulJobsKit();

test("public CLI: identical --out-a/--out-b with changed after refuses overlapping dirs", async () => {
  const work = tmpDir("orh-overlap-cli-");
  const files = stageOpenApiCaller(kit, work);
  const shared = join(work, "shared");
  const r = await spawnNode([
    replayBin,
    "--job",
    "api-upgrade-brief",
    "--before",
    files.before,
    "--after",
    files.after,
    "--used",
    files.used,
    "--after-b",
    files.afterB,
    "--out-a",
    shared,
    "--out-b",
    shared,
  ]);
  assert.notEqual(r.status, 0, r.stdout);
  const body = parseJsonStdout(r);
  assert.equal(body.ok, false);
  assert.equal(body.refused, true);
  assert.equal(body.code, "overlapping-output-dirs");
  assert.equal(body.identityVerified, false);
  assert.notEqual(body.classification, "identical");
});

test("public CLI: symlink alias of out-b onto out-a refuses overlapping dirs", async () => {
  const work = tmpDir("orh-symlink-cli-");
  const files = stageOpenApiCaller(kit, work);
  const outA = join(work, "out-a");
  const outB = join(work, "out-b");
  mkdirSync(outA, { recursive: true });
  symlinkSync(outA, outB);
  const r = await spawnNode([
    replayBin,
    "--job",
    "api-upgrade-brief",
    "--before",
    files.before,
    "--after",
    files.after,
    "--used",
    files.used,
    "--after-b",
    files.afterB,
    "--out-a",
    outA,
    "--out-b",
    outB,
  ]);
  assert.notEqual(r.status, 0, r.stdout);
  const body = parseJsonStdout(r);
  assert.equal(body.ok, false);
  assert.equal(body.code, "overlapping-output-dirs");
  assert.equal(body.identityVerified, false);
});

test("replay: mutating out-a after run A cannot erase same-input comparison evidence", async () => {
  const { replay } = await import("../lib/replay.mjs");
  const work = tmpDir("orh-mutate-");
  const files = stageOpenApiCaller(kit, work);
  const outA = join(work, "out-a");
  const outB = join(work, "out-b");
  const report = replay({
    job: "api-upgrade-brief",
    inputs: {
      before: files.before,
      after: files.after,
      used: files.used,
    },
    outA,
    outB,
    betweenRuns({ outA: dirA }) {
      writeFileSync(join(dirA, "upgrade-brief.json"), '{"mutated":true}\n');
      writeFileSync(join(dirA, "upgrade-brief.md"), "# mutated markdown body\n");
    },
  });
  assert.equal(report.ok, true);
  assert.equal(report.sample, false);
  assert.notEqual(report.classification, "identity-break");
  assert.equal(report.jsonIdentical, true);
  assert.equal(report.identityVerified, true);
  assert.ok(["identical", "labelled-drift"].includes(report.classification));
  assert.equal(JSON.parse(readFileSync(join(outA, "upgrade-brief.json"), "utf8")).mutated, true);
  assert.notEqual(report.files.find((f) => f.name === "upgrade-brief.json").sha256a, null);
});

test("assertDisjointOutputDirs is a tested public export", async () => {
  const { assertDisjointOutputDirs } = await import("../index.mjs");
  const work = tmpDir("orh-export-");
  const a = join(work, "a");
  const b = join(work, "b");
  const resolved = assertDisjointOutputDirs(a, b);
  assert.notEqual(resolved.outA.real, resolved.outB.real);
  assert.throws(
    () => assertDisjointOutputDirs(join(work, "same"), join(work, "same")),
    (err) => err instanceof ReplayRefuse && err.code === "overlapping-output-dirs",
  );
  assert.throws(
    () => assertDisjointOutputDirs(join(work, "rel"), join(work, "rel", ".", ".")),
    (err) => err instanceof ReplayRefuse && err.code === "overlapping-output-dirs",
  );
});
