import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const prepare = join(packRoot, "scripts/prepare-e01-worktree.sh");
const pin = JSON.parse(readFileSync(join(packRoot, "pins/e01.json"), "utf8"));

function runPrepare(env) {
  return spawnSync("bash", [prepare], {
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

test("e01 pin is PR109 c4048401 tree 1a5dad77; I01 pins are rejected", () => {
  assert.equal(pin.sha, "c4048401fa42e1272e61edf983afbf39a3e04555");
  assert.equal(pin.tree, "1a5dad7755fb81c75564dbc9d3667ab16db9bbcd");
  assert.equal(pin.pr, 109);
  assert.ok(pin.rejectedI01.includes("819fa637ecf5e5177c84efc16fcaa18d57017631"));
  assert.ok(pin.rejectedI01.includes("346bbd3cbe6943a83b2077c455174d74b7a493ad"));
});

test("prepare script that checks out 819fa637 exits non-zero with pin_mismatch", () => {
  const stale = pin.rejectedI01[0];
  const result = runPrepare({ I01_SHA: stale, E01_SHA: stale, KERNEL_SHA: stale });
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(`${result.stdout}\n${result.stderr}`, /pin_mismatch/);
});

test("prepare script that checks out 346bbd3c exits non-zero with pin_mismatch", () => {
  const stale = pin.rejectedI01[1];
  const result = runPrepare({ I01_SHA: stale, E01_SHA: stale, KERNEL_SHA: stale });
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(`${result.stdout}\n${result.stderr}`, /pin_mismatch/);
});

test("prepare script that is asked for integer termsVersion exits non-zero with pin_mismatch", () => {
  const result = runPrepare({ TERMS_VERSION: "1" });
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(`${result.stdout}\n${result.stderr}`, /pin_mismatch/);
});

test("README does not instruct a rejected I01 checkout as the live kernel", () => {
  const readme = readFileSync(join(packRoot, "README.md"), "utf8");
  assert.equal(/git worktree add[^\n]*(346bbd3c|819fa637)/.test(readme), false);
  assert.match(readme, /prepare-e01-worktree\.sh/);
});
