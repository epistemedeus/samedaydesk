import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { RECIPE_ROOT } from "../src/paths.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECKER = join(HERE, "hermes-dropin.py");
const SKILL_SRC = join(RECIPE_ROOT, "skill/lockfile-pin-delta");
const HERMES_SRC = process.env.HERMES_AGENT_SRC || "/tmp/s77-input/hermes-agent";
const REAL_HERMES = join(homedir(), ".hermes");

function runChecker(home) {
  return spawnSync("python3", [CHECKER], {
    encoding: "utf8",
    timeout: 20_000,
    env: {
      ...process.env,
      HERMES_HOME: home,
      HERMES_AGENT_SRC: HERMES_SRC,
      SKILL_SRC,
      PYTHONPATH: HERMES_SRC,
    },
  });
}

test("official Hermes skill_utils loads lockfile-pin-delta from a disposable drop-in profile", () => {
  const home = mkdtempSync(join(tmpdir(), "h04-hermes-lockfile-"));
  try {
    const result = runChecker(home);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.ok, true);
    assert.equal(receipt.mode, "drop_in");
    assert.equal(receipt.hermes_home, home);
    assert.notEqual(receipt.hermes_home, REAL_HERMES);
    assert.ok(receipt.skills["lockfile-pin-delta"]);
    assert.equal(receipt.skills["lockfile-pin-delta"].scan_verdict, "safe");
    assert.equal(receipt.skills["lockfile-pin-delta"].community_install_allowed_without_force, true);
    assert.equal(receipt.payment_executed, false);
    assert.equal(receipt.model_execution, false);
    assert.equal(receipt.native_payer, false);
    assert.match(receipt.skills["lockfile-pin-delta"].description, /lockfile-pin-delta/);
    assert.match(receipt.skills["lockfile-pin-delta"].description, /1\.1\.0/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("official drop-in refuses the default Hermes profile", () => {
  const result = runChecker(REAL_HERMES);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /refusing default/);
});
