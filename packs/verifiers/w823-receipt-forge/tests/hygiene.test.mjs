import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { REFUSED_FLAGS } from "../src/constants.mjs";
import { refusedFlag } from "../src/lib.mjs";

const packRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

test("refusedFlag catches live/pay/neo/publish before other work", () => {
  for (const flag of REFUSED_FLAGS) {
    assert.equal(refusedFlag([`--${flag}`, "--cold"]), `--${flag}`);
    assert.equal(refusedFlag([`--${flag}=true`, "--cold"]), `--${flag}=true`);
  }
  assert.equal(refusedFlag(["--cold"]), null);
});

test("pack sources do not contain live payment secrets", () => {
  const files = walk(packRoot).filter((file) => {
    if (file.includes("/tests/")) return false;
    return /\.(mjs|md|json|txt)$/.test(file);
  });
  const needle = ["sk", "live"].join("_");
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.equal(text.includes(needle), false, file);
    assert.equal(text.includes("BEGIN PRIVATE KEY"), false, file);
  }
});
