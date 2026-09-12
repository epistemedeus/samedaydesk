import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { assertEngineTree, incomplete } from "../lib/ensure-engine.mjs";
import { fixturePath } from "../lib/corpus.mjs";
import { runEngineCli } from "../lib/engine-cli.mjs";

test("missing engine tree is incomplete, never a skipped pass", () => {
  assert.equal(existsSync("/tmp/w5-m07-no-such-engine/bin/lockfile-delta.mjs"), false);
  assert.throws(
    () => assertEngineTree("/tmp/w5-m07-no-such-engine"),
    (err) => err.code === "engine-incomplete" && /incomplete/.test(err.message),
  );
  const sample = incomplete("fetch failed");
  assert.equal(sample.code, "engine-incomplete");
});

test("yarn refusal does not carry an npm pin digest", () => {
  const yarn = runEngineCli({
    before: fixturePath("fixtures/yarn-classic/before.lock"),
    after: fixturePath("fixtures/yarn-classic/after.lock"),
  });
  const npm = runEngineCli({
    before: fixturePath("fixtures/npm-v3-version/before.json"),
    after: fixturePath("fixtures/npm-v3-version/after.json"),
  });
  assert.equal(yarn.status, 2);
  assert.equal(yarn.json.refused, true);
  assert.equal(yarn.json.code, "parse-error");
  assert.equal(yarn.json.digest, undefined);
  assert.equal(npm.status, 0);
  assert.match(npm.json.digest, /^[0-9a-f]{64}$/);
  assert.notEqual(yarn.json.digest, npm.json.digest);
});
