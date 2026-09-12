import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { listConsumerIds, loadConsumerRecord } from "../lib/catalog.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

function runConsumerTests(id) {
  const dir = join(root, "consumers", id);
  const testDir = join(dir, "test");
  if (!existsSync(testDir)) return { skipped: true, status: null };
  return spawnSync(
    process.execPath,
    ["--test", "test/consumer.test.mjs"],
    {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=768" },
      timeout: 120_000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
}

test("each consumer stays inside its exclusive subpath declaration", () => {
  for (const id of listConsumerIds()) {
    const rec = loadConsumerRecord(id);
    const expected = `experiments/wave6/h6d-real-consumers/consumers/${id}/`;
    if (rec.owned?.ownedPath) {
      assert.equal(rec.owned.ownedPath.replace(/\\/g, "/"), expected, id);
    }
    assert.match(rec.dir.replace(/\\/g, "/"), new RegExp(`${id}$`));
  }
});

test("ready consumers have independent witness not importing kit engines", () => {
  const engineImport = /useful-jobs-1\.4\.0\/engines\/|engines\/lockfile-pin-delta\/lib\/compare|engines\/json-schema-webhook-drift\/lib\/compare/;
  for (const id of listConsumerIds()) {
    const rec = loadConsumerRecord(id);
    const witness = join(rec.dir, "witness.mjs");
    if (!existsSync(witness)) continue;
    const src = readFileSync(witness, "utf8");
    assert.equal(engineImport.test(src), false, `${id} witness imports engine oracle`);
  }
});

test("ready consumers re-run their node:test suite", { timeout: 240_000 }, () => {
  const ids = listConsumerIds().filter((id) => loadConsumerRecord(id).ready);
  if (ids.length === 0) {
    assert.ok(true, "no ready consumers yet; parent catalog still valid");
    return;
  }
  const failures = [];
  for (const id of ids) {
    const r = runConsumerTests(id);
    if (r.skipped) continue;
    if (r.status !== 0) {
      failures.push({ id, status: r.status, stderr: (r.stderr || "").slice(0, 500) });
    }
  }
  assert.deepEqual(failures, []);
});
