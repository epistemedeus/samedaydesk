import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { classifyTransport } from "../../../../server/paid-useful-jobs/lib/contract.mjs";
import { runEngineForD01 } from "../lib/d01-adapter.mjs";
import { pinFixture } from "./helpers.mjs";

test("runEngineForD01 surfaces spawnSync timeout as timedOut, not a silent crash", () => {
  const isolate = mkdtempSync(join(tmpdir(), "m01-timeout-class-"));
  const engineRoot = join(isolate, "lockfile-pin-delta");
  mkdirSync(join(engineRoot, "bin"), { recursive: true });
  writeFileSync(
    join(engineRoot, "bin/lockfile-delta.mjs"),
    "#!/usr/bin/env node\nsetInterval(() => {}, 1 << 30);\n",
  );
  chmodSync(join(engineRoot, "bin/lockfile-delta.mjs"), 0o755);
  process.env.W5_M01_ENGINE_ROOTS = JSON.stringify({ "lockfile-pin-delta": engineRoot });
  const started = Date.now();
  const engine = runEngineForD01("lockfile-pin-delta", {
    files: {
      before: pinFixture("lockfile-pin-delta", "journey/before.json"),
      after: pinFixture("lockfile-pin-delta", "journey/after.json"),
    },
    outDir: join(isolate, "out"),
    timeoutMs: 600,
  });
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 5000, `timeout was not bounded (${elapsed}ms)`);
  assert.equal(engine.timedOut, true);
  assert.equal(engine.status, null);
  const transport = classifyTransport({ engine, timeout: Boolean(engine.timedOut) });
  assert.equal(transport, "timeout");
  delete process.env.W5_M01_ENGINE_ROOTS;
});
