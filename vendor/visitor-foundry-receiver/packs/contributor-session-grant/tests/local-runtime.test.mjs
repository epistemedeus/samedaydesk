import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { missingKernelAcceptance } from "../src/missing-acceptance.mjs";

const packRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(packRoot, "../..");

test("PR109 is not accepted here and local-runtime does not boot it", () => {
  const missing = missingKernelAcceptance(repoRoot);
  assert.equal(missing.accepted, false);
  assert.equal(missing.presentOnCheckout, false);
  assert.equal(missing.contacted, false);
  assert.equal(missing.booted, false);
  assert.equal(missing.pr, 109);
  assert.equal(missing.sha, "c4048401fa42e1272e61edf983afbf39a3e04555");
  assert.equal(missing.tree, "1a5dad7755fb81c75564dbc9d3667ab16db9bbcd");
  assert.equal(existsSync(join(repoRoot, "services/earned-work")), false);
  const boot = readFileSync(join(packRoot, "tests/boot-local-runtime.mjs"), "utf8");
  assert.match(boot, /c4048401fa42e1272e61edf983afbf39a3e04555/);
  assert.doesNotMatch(readFileSync(fileURLToPath(import.meta.url), "utf8"), /await bootI01LocalRuntime\(/);
});
