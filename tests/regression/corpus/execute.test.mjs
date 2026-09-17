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
  const prefix = `sds-corpus-${process.pid}-archive-missing-args-`;
  const observed = await executeCase(loadCase("archive-missing-args"), { root: repoRoot() });
  assert.equal(observed.json.code, "missing-args");
  assert.deepEqual(corpusTmp(prefix), []);
});

test("unknown execute kind throws instead of leaking a tmpdir", async () => {
  const prefix = `sds-corpus-${process.pid}-presence-offline-unpaid-`;
  const loaded = loadCase("presence-offline-unpaid");
  loaded.spec = { ...loaded.spec, execute: { kind: "not-a-kind" } };
  await assert.rejects(() => executeCase(loaded, { root: repoRoot() }), /unknown_execute_kind:not-a-kind/);
  assert.deepEqual(corpusTmp(prefix), []);
});
