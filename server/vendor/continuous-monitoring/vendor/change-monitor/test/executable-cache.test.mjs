import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { packageRoot } from "./support.mjs";

const archive = path.resolve(packageRoot, "../../public/downloads/release-gate/0.1.4/release-gate-0.1.4.tgz");

function runProbe(script, cwd) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, archive], {
      cwd,
      env: { ...process.env, NODE_PATH: "" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("two processes execute the pinned archive, including a tampered cache", { timeout: 60000 }, async () => {
  const caller = await mkdtemp(path.join(tmpdir(), "cm-cache-caller-"));
  const result = await runProbe(path.join(packageRoot, "test/cache-probe.mjs"), caller);
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.seededFailure.rejected, true);
  assert.equal(body.cases.cold.extraction, "published");
  assert.equal(body.cases.warm.extraction, "reused");
  assert.equal(body.cases.warm.acquiredFrom, "verified-cache");
  assert.equal(body.cases.tampered.behavior, "domain-error");
  assert.equal(body.cases.tampered.executedFlag, null);
  assert.equal(body.cases.tampered.extraction, "private");
  assert.equal(body.cases.symlink.extraction, "private");
  assert.equal(body.cases.partial.extraction, "private");
  assert.equal(body.cases.legacy.extraction, "reused");
  assert.equal(body.cases.concurrentA.moduleSha256, body.indexSha256);
  assert.equal(body.cases.concurrentB.moduleSha256, body.indexSha256);
});
