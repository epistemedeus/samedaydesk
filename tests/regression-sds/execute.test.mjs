import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";
import { executeCase } from "./lib/execute.mjs";
import { loadCase } from "./lib/load.mjs";
import { repoRoot } from "./lib/paths.mjs";

function corpusTmp(prefix) {
  return readdirSync(tmpdir()).filter((name) => name.startsWith(prefix));
}

test("spawn cases delete their mkdtemp directory after destExists is sampled", async () => {
  const prefix = `sds-regression-${process.pid}-s185-missing-input-exit0-`;
  const observed = await executeCase(loadCase("s185-missing-input-exit0"), { root: repoRoot() });
  assert.equal(observed.json.error.code, "missing-input");
  assert.deepEqual(corpusTmp(prefix), []);
});

test("unknown execute kind throws instead of leaking a tmpdir", async () => {
  const prefix = `sds-regression-${process.pid}-payment-replay-blocked-`;
  const loaded = loadCase("payment-replay-blocked");
  loaded.spec = { ...loaded.spec, execute: { kind: "not-a-kind" } };
  await assert.rejects(() => executeCase(loaded, { root: repoRoot() }), /unknown_execute_kind:not-a-kind/);
  assert.deepEqual(corpusTmp(prefix), []);
});

test("soft-404 capture replays issue #1 homepage-identical 200 as reject", async () => {
  const observed = await executeCase(loadCase("issue1-captured-soft-404"), { root: repoRoot() });
  assert.equal(observed.httpStatus, 200);
  assert.equal(observed.kind, "soft_404");
  assert.equal(observed.json.ok, false);
});
