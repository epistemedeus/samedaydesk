import assert from "node:assert/strict";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";
import { PINS } from "../lib/pins.mjs";
import { prefixLayout } from "../lib/install.mjs";
import { runPythonCli } from "../lib/invoke.mjs";
import { archivePath, sharedPrefix, stageCaller, writeStubNode } from "./helpers.mjs";

test("same-size archive with a flipped byte refuses wrong-digest and does not extract", () => {
  const prefix = sharedPrefix();
  const layout = prefixLayout(prefix);
  const bad = join(layout.work, "bad-archive.tar.gz");
  copyFileSync(archivePath(prefix), bad);
  const buf = Buffer.from(readFileSync(bad));
  buf[0] = buf[0] ^ 0xff;
  writeFileSync(bad, buf);
  assert.equal(buf.length, PINS.archive.bytes);
  const result = runPythonCli(prefix, ["acquire", "--archive", bad]);
  assert.notEqual(result.status, 0);
  assert.equal(result.json?.code, "wrong-digest");
  assert.equal(result.json?.extracted, false);
  assert.equal(result.json?.executed, false);
  assert.equal(result.json?.ok, false);
});

test("SAMPLE --example --sold is sample-as-sale, not a paid delivery", () => {
  const prefix = sharedPrefix();
  const result = runPythonCli(prefix, [
    "run",
    "vendor-budget-impact",
    "--archive",
    archivePath(prefix),
    "--example",
    "--sold",
  ]);
  assert.notEqual(result.status, 0);
  assert.equal(result.json?.ok, false);
  assert.equal(result.json?.code, "sample-as-sale");
  assert.equal(result.json?.sold, false);
});

test("missing Node binary is missing-node, not a payment error", () => {
  const prefix = sharedPrefix();
  const caller = stageCaller(prefix);
  const result = runPythonCli(
    prefix,
    [
      "run",
      "vendor-budget-impact",
      "--archive",
      archivePath(prefix),
      "--before",
      caller.before,
      "--after",
      caller.after,
    ],
    { env: { USEFUL_JOBS_NODE: "/no-such-w5-d24-node" } },
  );
  assert.notEqual(result.status, 0);
  assert.equal(result.json?.code, "missing-node");
  assert.equal(result.json?.payment, false);
  assert.equal(result.json?.sold, false);
});

test("empty engine list still returns packaged job ids (current Co14; remaining D08 bind)", () => {
  const prefix = sharedPrefix();
  const layout = prefixLayout(prefix);
  const stub = join(layout.work, "empty-list-node");
  writeStubNode(stub, { ok: true, jobs: [] });
  const result = runPythonCli(prefix, ["list", "--archive", archivePath(prefix)], {
    env: { USEFUL_JOBS_NODE: stub },
  });
  assert.equal(result.json?.ok, true);
  assert.deepEqual(result.json?.engine, { ok: true, jobs: [] });
  assert.deepEqual(result.json?.jobs, [
    "api-upgrade-brief",
    "vendor-budget-impact",
    "feed-agenda",
    "evidence-ci-annotation",
    "listing-repair-packet",
    "repeat-job-record",
  ]);
});

test("successful Co14 run leaves no useful-jobs.mjs process for that kit root", () => {
  const prefix = sharedPrefix();
  const layout = prefixLayout(prefix);
  const caller = stageCaller(prefix);
  const outDir = join(layout.work, "cleanup-budget");
  const result = runPythonCli(prefix, [
    "run",
    "vendor-budget-impact",
    "--archive",
    archivePath(prefix),
    "--before",
    caller.before,
    "--after",
    caller.after,
    "--out-dir",
    outDir,
  ]);
  assert.equal(result.json?.ok, true);
  const kitRoot = result.json?.kitRoot;
  assert.ok(kitRoot);
  const ps = spawnSync("ps", ["-eo", "args="], { encoding: "utf8" });
  const leftover = String(ps.stdout || "")
    .split("\n")
    .filter((line) => line.includes("useful-jobs.mjs") && line.includes(kitRoot));
  assert.deepEqual(leftover, []);
  assert.equal(existsSync(join(outDir, "budget-impact.json")), true);
});
