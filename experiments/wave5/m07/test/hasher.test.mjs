import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";

const pkg = fileURLToPath(new URL("..", import.meta.url));
const probe = join(pkg, "bin/constant-hasher-probe.mjs");

test("default hasher explains integrity bytes; constant hasher currently erases them", () => {
  const r = spawnSync(process.execPath, [probe], { encoding: "utf8", timeout: 30_000 });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const json = JSON.parse(r.stdout);
  assert.equal(json.integrityBytesDiffer, true);
  assert.equal(json.defaultChanged, 1);
  assert.deepEqual(json.defaultKinds, ["integrity"]);
  assert.equal(json.constantChanged, 0);
  assert.equal(json.constantStatus, "informational");
  assert.equal(json.finding, "constant-hasher-redefines-byte-equality");
  assert.equal(json.engineSha, "e81efc8ab71b1bde88eca743d297149e61bbb6f2");
});
