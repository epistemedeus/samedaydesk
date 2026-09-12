import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";

const pkg = fileURLToPath(new URL("..", import.meta.url));

test("replay CLI classifies 20 cases without engine failure", () => {
  const r = spawnSync(process.execPath, [join(pkg, "bin/replay.mjs")], {
    encoding: "utf8",
    timeout: 60_000,
    cwd: pkg,
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const json = JSON.parse(r.stdout);
  assert.equal(json.engine.sha, "e81efc8ab71b1bde88eca743d297149e61bbb6f2");
  assert.equal(json.tested, 20);
  assert.equal(json.passed, 20);
  assert.equal(json.failed, 0);
  assert.equal(json.kinds["engine-failure"], 0);
  assert.equal(json.kinds.gap, 2);
  assert.equal(json.kinds.match, 7);
  assert.equal(json.kinds["valid-refusal"], 11);
});
