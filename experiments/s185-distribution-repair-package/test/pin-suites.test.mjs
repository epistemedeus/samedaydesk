import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, "..");

function runPin(rel, extraEnv = {}) {
  const cwd = path.join(PKG, rel);
  return spawnSync(process.execPath, ["--test", "tests"], {
    encoding: "utf8",
    cwd,
    env: {
      ...process.env,
      DIST08_ROOT: path.join(PKG, "vendor/dist08"),
      ...extraEnv,
    },
    maxBuffer: 20 * 1024 * 1024,
  });
}

test("Record05 pin suite", () => {
  const r = runPin("vendor/record05");
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("Record04 pin suite (sibling Record05 via vendor/05)", () => {
  const r = runPin("vendor/record04");
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("DIST08 pin suite", () => {
  const r = runPin("vendor/dist08");
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("NL06 pin suite (sibling DIST08 via vendor/08)", () => {
  const r = runPin("vendor/nl06");
  assert.equal(r.status, 0, r.stderr || r.stdout);
});
