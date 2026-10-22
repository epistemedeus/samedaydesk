import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PACK = join(dirname(fileURLToPath(import.meta.url)), "..");
const RUNNER = join(PACK, "run.mjs");

function run(args, { timeout = 60_000 } = {}) {
  return spawnSync(process.execPath, [RUNNER, ...args], {
    encoding: "utf8",
    cwd: PACK,
    timeout,
  });
}

test("CLI --help exits 0 without network", () => {
  const result = run(["--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /sds-regression-replay-nonce/);
  assert.match(result.stdout, /Does not pay/);
});

test("CLI --seeded-failure list names replay-as-fresh-apply", () => {
  const result = run(["--seeded-failure", "list"]);
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.mode, "seeded-failure-list");
  assert.ok(body.ids.includes("replay-as-fresh-apply"));
});

test("CLI refuses --checkout", () => {
  const result = run(["--checkout"]);
  assert.notEqual(result.status, 0);
  const body = JSON.parse(result.stderr);
  assert.equal(body.error.code, "payment-forbidden");
});

test("CLI refuses --live=url as payment-forbidden", () => {
  const result = run(["--live=https://example.com"]);
  assert.equal(result.status, 2, result.stderr);
  const body = JSON.parse(result.stderr);
  assert.equal(body.error.code, "payment-forbidden");
});
