import assert from "node:assert/strict";
import { chmodSync, copyFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import { FINDING_IDS, PINNED_IMPLEMENTATION } from "../lib/contract.mjs";
import { extractCold, isolateDir } from "../lib/kit.mjs";
import { parseStdoutJson } from "../lib/json.mjs";
import { killIsolate, killPidFile, pidAlive, pgrepNeedle, spawnNodeSync } from "../lib/process.mjs";
import { runUsefulJobs } from "../lib/jobs.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const HANG = join(here, "../fixtures/hang.mjs");
const M01_PROBE = join(here, "../bin/probe-m01-timeout.mjs");

describe("timeout, nested shutdown, cold reinstall", { timeout: 60_000 }, () => {
  it("second cold extract works after the first extract is deleted", () => {
    const firstParent = isolateDir("w5-d16-final-cold1-");
    const kit1 = extractCold(firstParent);
    const outA = isolateDir("w5-d16-final-cold-a-");
    const rA = runUsefulJobs(kit1, [
      "run",
      "lockfile-pin-delta",
      "--before",
      join(kit1, "samples/lockfile/h04-pub-lock-01/before.json"),
      "--after",
      join(kit1, "samples/lockfile/h04-pub-lock-01/after.json"),
      "--out-dir",
      outA,
    ]);
    assert.equal(rA.status, 0);
    assert.equal(rA.json?.ok, true);
    rmSync(firstParent, { recursive: true, force: true });
    assert.equal(existsSync(kit1), false);
    const secondParent = isolateDir("w5-d16-final-cold2-");
    const kit2 = extractCold(secondParent);
    const outB = isolateDir("w5-d16-final-cold-b-");
    const rB = runUsefulJobs(kit2, [
      "run",
      "lockfile-pin-delta",
      "--before",
      join(kit2, "samples/lockfile/h04-pub-lock-01/before.json"),
      "--after",
      join(kit2, "samples/lockfile/h04-pub-lock-01/after.json"),
      "--out-dir",
      outB,
    ]);
    assert.equal(rB.status, 0);
    assert.equal(rB.json?.ok, true);
    assert.equal(existsSync(join(outB, "pin-delta.json")), true);
    rmSync(secondParent, { recursive: true, force: true });
  });

  it("public CLI spawnSync timeout leaves nested engine hang; harness kill leaves none", () => {
    const isolate = isolateDir("w5-d16-final-hang-");
    const kit = extractCold(isolate);
    const bin = join(kit, "engines/lockfile-pin-delta/bin/lockfile-delta.mjs");
    copyFileSync(HANG, bin);
    chmodSync(bin, 0o755);
    const pidFile = join(isolate, "hang.pid");
    const out = isolateDir("w5-d16-final-hang-out-");
    const started = Date.now();
    const r = runUsefulJobs(
      kit,
      [
        "run",
        "lockfile-pin-delta",
        "--before",
        join(kit, "samples/lockfile/h04-pub-lock-01/before.json"),
        "--after",
        join(kit, "samples/lockfile/h04-pub-lock-01/after.json"),
        "--out-dir",
        out,
      ],
      { timeoutMs: 800, env: { ...process.env, D16_FINAL_PIDFILE: pidFile } },
    );
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 5000, `timeout did not bound the wait (${elapsed}ms)`);
    assert.equal(r.error?.code, "ETIMEDOUT");
    const hangPid = existsSync(pidFile) ? Number(readFileSync(pidFile, "utf8").trim()) : null;
    assert.equal(Number.isInteger(hangPid), true, "hang fixture did not write a pid");
    const aliveAfterTimeout = pidAlive(hangPid);
    const leftovers = pgrepNeedle(isolate).map((row) => row.pid);
    assert.equal(aliveAfterTimeout, true, "expected nested engine hang to survive useful-jobs timeout");
    assert.ok(leftovers.length >= 1, "expected at least the hang pid in pgrep");
    killPidFile(pidFile);
    killIsolate(isolate);
    const remaining = pgrepNeedle(isolate);
    assert.deepEqual(remaining, [], `injected children survived tests: ${JSON.stringify(remaining)}`);
    rmSync(isolate, { recursive: true, force: true });
    assert.equal(FINDING_IDS.PUBLIC_CLI_NESTED_ORPHAN, "public-cli-nested-hang-orphan");
    assert.ok(elapsed > 0);
  });

  it("D01 runEngineForD01 kills the hang via spawnSync timeout but reports timedOut false", () => {
    const kit = extractCold(isolateDir("w5-d16-final-m01kit-"));
    const before = join(kit, "samples/lockfile/h04-pub-lock-01/before.json");
    const after = join(kit, "samples/lockfile/h04-pub-lock-01/after.json");
    const r = spawnNodeSync([M01_PROBE, before, after], { timeoutMs: 15_000 });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const body = parseStdoutJson(r.stdout).json;
    assert.ok(body, r.stdout);
    assert.ok(body.elapsedMs < 5000, `adapter hang was not bounded (${body.elapsedMs}ms)`);
    assert.equal(body.status, null);
    assert.equal(body.timedOut, false);
    assert.equal(body.signal, null);
    assert.equal(body.json, null);
    assert.equal(body.transport, "engine-crash");
    assert.equal(body.aliveAfterReturn, false);
    assert.equal(PINNED_IMPLEMENTATION.m01Adapter.endsWith("d01-adapter.mjs"), true);
  });

  after(() => {
    killIsolate("w5-d16-final-");
  });
});
