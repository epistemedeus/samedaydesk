import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runFollowTheDoc } from "./follow-the-doc.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const runner = join(here, "follow-the-doc.mjs");
const EXPECTED_SHA =
  "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec";
const EXPECTED_BYTES = 5255824;

function spawnAsync(cmd, args, opts = {}) {
  return new Promise((resolveP, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd || repoRoot,
      env: { ...process.env, ...(opts.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => {
      stdout += c.toString("utf8");
    });
    child.stderr.on("data", (c) => {
      stderr += c.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (status) => resolveP({ status: status ?? 1, stdout, stderr }));
  });
}

test("docs tree exists under docs/agent", () => {
  for (const name of [
    "README.md",
    "tutorial.md",
    "how-to.md",
    "reference.md",
    "explanation.md",
    "follow-the-doc.mjs",
    "fixtures/seeded-failures.json",
  ]) {
    assert.equal(existsSync(join(here, name)), true, name);
  }
});

test("committed archive matches the documented pin", () => {
  const archive = join(
    repoRoot,
    "client/public/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz",
  );
  const buf = readFileSync(archive);
  assert.equal(buf.length, EXPECTED_BYTES);
  assert.equal(createHash("sha256").update(buf).digest("hex"), EXPECTED_SHA);
});

test("full cold follow-the-doc run succeeds and rejects seeded failures", async () => {
  const result = await runFollowTheDoc({ seededFailure: "all" });
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.paid, false);
  assert.equal(result.liveMerchantExtract, false);
  assert.equal(result.pins.sha256, EXPECTED_SHA);
  assert.equal(result.pins.bytes, EXPECTED_BYTES);
  assert.equal(result.tutorial.exitCode, 0);
  assert.equal(result.tutorial.kitOk, true);
  assert.equal(result.tutorial.exampleOk, true);
  const byId = Object.fromEntries(result.seededFailures.map((s) => [s.id, s]));
  assert.equal(byId["digest-mismatch"].rejected, true);
  assert.notEqual(byId["digest-mismatch"].exitCode, 0);
  assert.equal(byId["missing-required-inputs"].rejected, true);
  assert.notEqual(byId["missing-required-inputs"].exitCode, 0);
  assert.equal(byId["example-on-page-change"].rejected, true);
  assert.notEqual(byId["example-on-page-change"].exitCode, 0);
});

test("CLI --seeded-failure digest-mismatch is rejected (exit 0 from runner)", async () => {
  const r = await spawnAsync(process.execPath, [
    runner,
    "--seeded-failure",
    "digest-mismatch",
    "--json",
  ]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.seededFailures[0].id, "digest-mismatch");
  assert.equal(body.seededFailures[0].rejected, true);
  assert.equal(body.seededFailures[0].extracted, false);
});

test("CLI default follow-the-doc prints ok true", async () => {
  const r = await spawnAsync(process.execPath, [runner]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.surface, "useful-jobs");
  assert.equal(body.version, "1.4.7");
});
