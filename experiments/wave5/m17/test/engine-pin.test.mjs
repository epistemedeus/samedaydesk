import assert from "node:assert/strict";
import test from "node:test";
import { ensureEngine } from "../lib/resolve-engine.mjs";
import { runEnginePackageTests } from "../lib/run-engine.mjs";
import { M04_SHA } from "../lib/pins.mjs";

test("M04 Co12 pin is resolvable and its public CLI tests pass", () => {
  const engine = ensureEngine();
  assert.equal(engine.sha, M04_SHA);
  assert.match(engine.cli, /route-diff\.mjs$/);
  const result = runEnginePackageTests(engine);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const pass = [...String(result.stdout).matchAll(/^# pass (\d+)/gm)].pop();
  const fail = [...String(result.stdout).matchAll(/^# fail (\d+)/gm)].pop();
  const tests = [...String(result.stdout).matchAll(/^# tests (\d+)/gm)].pop();
  assert.equal(Number(tests[1]), 14);
  assert.equal(Number(pass[1]), 14);
  assert.equal(Number(fail[1]), 0);
});
