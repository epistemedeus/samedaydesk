import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkerRoot } from "../lib/public-adapter.mjs";

test("anonymous clean install refuses git and runs the seeded rows", { timeout: 180_000 }, () => {
  const root = mkdtempSync(join(tmpdir(), "l08-public-install-"));
  const bin = join(root, "bin");
  const log = join(root, "git.log");
  try {
    mkdirSync(bin);
    writeFileSync(log, "");
    writeFileSync(join(bin, "git"), `#!/bin/sh\necho "$@" >> "$GIT_STUB_LOG"\necho "refused git $*" >&2\nexit 128\n`);
    chmodSync(join(bin, "git"), 0o755);
    for (const rel of ["package.json", "package-lock.json", "LICENSE", "integrity.mjs", "integrity.catalog-repair.test.mjs"]) {
      cpSync(join(checkerRoot, rel), join(root, rel));
    }
    cpSync(join(checkerRoot, "action"), join(root, "action"), { recursive: true });
    const env = {
      PATH: `${bin}:${process.env.PATH}`,
      HOME: process.env.HOME || "/tmp",
      TMPDIR: process.env.TMPDIR || "/tmp",
      GIT_STUB_LOG: log,
      GIT_TERMINAL_PROMPT: "0",
      npm_config_ignore_scripts: "true",
    };
    const installed = spawnSync("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], {
      cwd: root,
      encoding: "utf8",
      env,
      timeout: 150_000,
    });
    assert.equal(installed.status, 0, `${installed.stdout}\n${installed.stderr}`);
    assert.equal(readFileSync(log, "utf8"), "");
    const run = (fixture) => spawnSync(process.execPath, ["integrity.catalog-repair.test.mjs", `action/fixtures/${fixture}`], {
      cwd: root,
      encoding: "utf8",
      env: { ...env, CATALOG_ROW_CHECK: "1" },
      timeout: 20_000,
    });
    const defect = run("catalog-row-repair-add-required.json");
    assert.equal(defect.status, 1, defect.stderr);
    const defectJson = JSON.parse(defect.stdout);
    assert.equal(defectJson.ok, false);
    assert.equal(defectJson.repairComplete, false);
    assert.equal(defectJson.paymentSent, false);
    const changed = run("catalog-row-repair-complete.json");
    assert.equal(changed.status, 0, changed.stderr);
    const changedJson = JSON.parse(changed.stdout);
    assert.equal(changedJson.ok, true);
    assert.equal(changedJson.repairComplete, true);
    assert.equal(`${defect.stdout}${changed.stdout}`.includes("BEGIN PRIVATE KEY"), false);
    assert.equal(readFileSync(log, "utf8"), "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
