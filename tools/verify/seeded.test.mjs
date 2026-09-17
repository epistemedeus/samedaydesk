import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const cli = join(here, "cli.mjs");

function run(args, timeout = 60_000) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout,
    env: process.env,
  });
  let json = null;
  try {
    json = JSON.parse(result.stdout.trim().split("\n").at(-1));
  } catch {
    json = null;
  }
  return { ...result, json };
}

test("SHA mismatch remaps obtain-archive child exit 0 to verifier exit 1", () => {
  const result = run(["--seeded-failure", "sha-mismatch", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "SEED_REJECT");
  assert.match(result.json.error.message, /SHA mismatch remapped from child exit 0/);
  assert.equal(result.json.result.childExit, 0);
  assert.equal(result.json.result.productCode, "wrong-digest");
  assert.equal(result.json.result.remappedFromChildExit0, true);
  assert.equal(result.json.boundary.paymentSent, false);
});

test("fixture pointer yields the same SHA mismatch reject", () => {
  const result = run(["--fixture", "tools/verify/fixtures/seeded/sha-mismatch.json", "--json"]);
  assert.equal(result.status, 1);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "SEED_REJECT");
});
