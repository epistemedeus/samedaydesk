import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "src", "cli.mjs");

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    cwd: root,
  });
}

test("cli demo walks fixtures without paid calls", () => {
  const r = run(["demo"]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.demo, true);
  assert.equal(out.results["positive.json"].status, "ready");
  assert.equal(out.results["partial-missing-price.json"].status, "partial_input");
  assert.equal(out.results["negative-forbidden.json"].status, "rejected");
  assert.equal(out.results["free-unavailable.json"].paidCalls, false);
  assert.equal(out.results["positive.json"].hasInvestmentRecommendation, false);
});

test("cli compare positive exits 0", () => {
  const r = run(["compare", join(root, "fixtures", "positive.json")]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.dryRun, true);
  assert.equal(out.paidCalls, false);
  assert.equal(out.status, "ready");
});

test("cli compare negative exits 1", () => {
  const r = run(["compare", join(root, "fixtures", "negative-forbidden.json")]);
  assert.equal(r.status, 1);
  const out = JSON.parse(r.stdout);
  assert.equal(out.status, "rejected");
});
