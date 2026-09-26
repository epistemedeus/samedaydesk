import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "src/cli.mjs");

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    cwd: root,
  });
}

test("cli pack positive exits 0 and emits ready", () => {
  const r = run(["pack", "fixtures/positive.json"]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.status, "ready");
  assert.equal(out.dryRun, true);
  assert.equal(out.paidCalls, false);
});

test("cli pack negative exits 1", () => {
  const r = run(["pack", "fixtures/negative-forbidden.json"]);
  assert.equal(r.status, 1);
  const out = JSON.parse(r.stdout);
  assert.equal(out.status, "rejected");
});

test("cli demo summarizes fixtures", () => {
  const r = run(["demo"]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.demo, true);
  assert.equal(out.results["positive.json"].status, "ready");
  assert.equal(out.results["partial-missing-secret.json"].status, "partial_input");
  assert.equal(out.results["negative-forbidden.json"].status, "rejected");
  assert.equal(out.results["positive.json"].hasBuyerCount, false);
});

test("cli validate positive", () => {
  const r = run(["validate", "fixtures/positive.json"]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.ok, true);
  assert.equal(out.descriptorCount, 4);
});
