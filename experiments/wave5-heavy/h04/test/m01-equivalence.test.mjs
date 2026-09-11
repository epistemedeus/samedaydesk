import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { H04_ROOT } from "../src/paths.mjs";

const COMPOSITION_SHA = "a20232b0f777b0f737cdffefb64a9ca9d9c9ba0e";
const RESULT_PATH = join(H04_ROOT, "runs", "m01-equivalence", "result.json");

test("M01 CLI/library lockfile-pin-delta equivalence result exists", () => {
  assert.equal(existsSync(RESULT_PATH), true, `missing ${RESULT_PATH}`);
  const result = JSON.parse(readFileSync(RESULT_PATH, "utf8"));
  assert.equal(typeof result, "object");
  assert.equal(result.compositionSha, COMPOSITION_SHA);
  assert.equal(typeof result.detail, "string");
  assert.notEqual(result.detail, "");
  assert.equal("pass" in result, true);
  assert.equal("cli" in result, true);
  assert.equal("library" in result, true);
  assert.equal("pinDeltaSha256Match" in result, true);
  assert.equal("countsMatch" in result, true);
  assert.equal("durationMs" in result, true);
});

test("M01 CLI and library outcomes match on h04-lock-01, or fail with the mismatch", () => {
  assert.equal(existsSync(RESULT_PATH), true, `missing ${RESULT_PATH}`);
  const result = JSON.parse(readFileSync(RESULT_PATH, "utf8"));
  assert.equal(result.compositionSha, COMPOSITION_SHA);
  assert.equal(result.expectedCompositionSha, COMPOSITION_SHA);
  if (result.pass !== true) {
    assert.fail(result.detail || JSON.stringify({
      pinDeltaSha256Match: result.pinDeltaSha256Match,
      countsMatch: result.countsMatch,
      cli: result.cli,
      library: result.library,
    }));
  }
  assert.equal(result.pass, true, result.detail);
  assert.equal(result.countsMatch, true, result.detail);
  assert.equal(result.cli.outcomeKind, "analysis", result.detail);
  assert.equal(result.library.outcomeKind, "analysis", result.detail);
  assert.equal(result.library.invokeEngine.outcomeKind, "analysis", result.detail);
  assert.equal(result.cli.status, result.library.status, result.detail);
  assert.deepEqual(result.cli.counts, result.library.counts);
  if (result.pinDeltaSha256Match !== true) {
    assert.equal(result.pinDeltaStableSha256Match, true, result.detail);
    assert.match(result.detail, /generatedAt/, result.detail);
    assert.notEqual(result.cli.pinDeltaSha256, result.library.pinDeltaSha256);
  }
});
