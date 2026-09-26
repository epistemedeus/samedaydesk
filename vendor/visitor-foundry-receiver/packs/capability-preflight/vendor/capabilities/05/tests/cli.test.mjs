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

test("cli plan positive exits 0 and prints ready", () => {
  const r = run(["plan", "fixtures/positive-known-mutation.json"]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.status, "ready");
  assert.equal(out.dryRun, true);
});

test("cli plan negative-forbidden exits 1", () => {
  const r = run(["plan", "fixtures/negative-forbidden.json"]);
  assert.equal(r.status, 1);
  const out = JSON.parse(r.stdout);
  assert.equal(out.status, "rejected");
});

test("cli demo runs", () => {
  const r = run(["demo"]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.demo, true);
  assert.equal(out.results["ambiguous-mutation.json"].mutationPreservation.rolled_back, false);
  assert.equal(out.results["ambiguous-mutation.json"].mutationPreservation.preserveAmbiguity, true);
});
