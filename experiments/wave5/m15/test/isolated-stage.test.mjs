import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "./helpers.mjs";
import { loadPins } from "../lib/pins.mjs";
import { IncompleteEngine, engineBin, stageEngine } from "../lib/stage-engine.mjs";
import { spawnEngine } from "../lib/run-trial.mjs";

test("git-archive stage is isolated from the SDS monorepo tree and invokes the real CLI", () => {
  const pins = loadPins();
  const dest = join(tempDir("m15-stage-"), "dest");
  const engine = stageEngine({ dest });
  assert.equal(engine.method, "git-archive");
  assert.equal(engine.sha, pins.m02.sha);
  assert.equal(existsSync(engine.bin), true);
  assert.equal(engine.bin.includes("experiments/wave5/m15"), false);
  const help = spawnEngine(engine.bin, ["--help"], { cwd: engine.root });
  assert.equal(help.exitCode, 0);
  assert.match(help.stdout, /--before/);
  assert.match(help.stdout, /Not OpenAPI/);
});

test("M15_ENGINE_ROOT with no bin is incomplete, not skipped", () => {
  const dest = tempDir("m15-empty-engine-");
  assert.throws(
    () => stageEngine({ dest, env: { M15_ENGINE_ROOT: dest } }),
    (err) => {
      assert.equal(err instanceof IncompleteEngine, true);
      assert.equal(err.code, "missing-engine");
      return true;
    },
  );
});

test("engineBin joins the public CLI relative path", () => {
  assert.equal(engineBin("/tmp/engine-root").endsWith("bin/webhook-drift.mjs"), true);
});
