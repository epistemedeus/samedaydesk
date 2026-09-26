import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const liveProof = join(here, "local-runtime.test.mjs");
const experimentConsumer = join(
  here,
  "../../../experiments/wave5/e01/scripts/compiled-cli-consumer.mjs",
);

test("E01 is not booted from this checkout and the wave5 consumer is not copied", () => {
  assert.equal(existsSync(liveProof), true);
  const source = readFileSync(liveProof, "utf8");
  assert.match(source, /accepted: false|missingKernelAcceptance/);
  assert.doesNotMatch(source, /await bootI01LocalRuntime\(/);
  assert.equal(existsSync(experimentConsumer), false);
});
