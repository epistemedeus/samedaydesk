import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import test from "node:test";
import { resolveEngine, spawnCompare } from "../lib/engine.mjs";
import { loadCase } from "../lib/corpus.mjs";
import { PACKAGE_ROOT, SNAPSHOTS_ROOT } from "../lib/paths.mjs";
import { spawnReplay, tmpOut } from "./helpers.mjs";

test("seeded: missing clock is clock_required, not a compare success", () => {
  const engine = resolveEngine();
  const held = loadCase("meaningful-title");
  const spawn = spawnCompare({
    engine,
    before: held.beforePath,
    after: held.afterPath,
    fields: held.fields,
    clock: undefined,
    outDir: tmpOut("m09-noclock-"),
  });
  assert.equal(spawn.exitCode, 2);
  assert.equal(spawn.refusal?.code, "clock_required");
});

test("seeded: SAMPLE job is not a delivered watch", () => {
  const engine = resolveEngine();
  const job = join(SNAPSHOTS_ROOT, "reject/sample.job.json");
  const result = spawnSync(process.execPath, [
    engine.bin,
    "job",
    "--job",
    job,
    "--out-dir",
    tmpOut("m09-sample-"),
  ], { encoding: "utf8", timeout: 15_000 });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /sample_as_delivered_watch/);
});

test("seeded: payment retry flag is refused by the engine CLI", () => {
  const engine = resolveEngine();
  const held = loadCase("meaningful-title");
  const result = spawnSync(process.execPath, [
    engine.bin,
    "compare",
    "--before",
    held.beforePath,
    "--after",
    held.afterPath,
    "--fields",
    "title",
    "--clock",
    held.clock,
    "--retry-payment",
    "true",
    "--out-dir",
    tmpOut("m09-pay-"),
  ], { encoding: "utf8", timeout: 15_000 });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /payment_retry/);
});

test("seeded: missing engine root is engine_missing, not a skipped pass", () => {
  const empty = mkdtempSync(join(tmpdir(), "m09-empty-engine-"));
  mkdirSync(empty, { recursive: true });
  const result = spawnSync(process.execPath, [join(PACKAGE_ROOT, "bin/replay.mjs"), "case", "--id", "meaningful-title"], {
    encoding: "utf8",
    timeout: 15_000,
    env: { ...process.env, PAGE_CHANGE_ENGINE_ROOT: empty },
    cwd: PACKAGE_ROOT,
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /engine_missing/);
});

test("seeded: unknown replay command is usage, not ok", () => {
  const result = spawnReplay(["not-a-command"]);
  assert.equal(result.exitCode, 2);
  assert.equal(result.errBody?.code, "usage");
});
