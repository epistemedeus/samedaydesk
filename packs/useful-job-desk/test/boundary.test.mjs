import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { PACK_ROOT, REPO_ROOT } from "./helpers.mjs";

const PIN = JSON.parse(readFileSync(join(PACK_ROOT, "PIN.json"), "utf8"));
const FOREIGN = [
  "tests/v6-",
  "packs/e3-changed-data-second-run",
  "packs/e4-maintained-runtime-discovery",
  "paid-useful-jobs",
  "managed-useful-jobs-order",
  "result-mailbox",
];

function walkFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.name === "out" || name.name === ".tmp" || name.name === "node_modules") continue;
    const abs = join(dir, name.name);
    if (name.isDirectory()) out.push(...walkFiles(abs));
    else out.push(abs);
  }
  return out;
}

test("pack does not vendor engines or import disjoint packs", () => {
  assert.equal(existsSync(join(PACK_ROOT, "engines")), false);
  assert.equal(existsSync(join(REPO_ROOT, "engines")), false);
  assert.deepEqual(PIN.disjointFrom, [
    "tests/v6-*/**",
    "packs/e3-changed-data-second-run/**",
    "packs/e4-maintained-runtime-discovery/**",
  ]);
  for (const abs of walkFiles(PACK_ROOT)) {
    const rel = abs.slice(PACK_ROOT.length + 1);
    if (!/\.(mjs|js|json|md|txt)$/.test(rel)) continue;
    if (rel === "PIN.json" || rel === "SOURCE.txt" || rel === "README.md" || rel === "lib/paths.mjs") {
      continue;
    }
    if (rel.startsWith("test/")) continue;
    const text = readFileSync(abs, "utf8");
    for (const marker of FOREIGN) {
      assert.equal(text.includes(marker), false, `${rel} mentions ${marker}`);
    }
    if (rel.endsWith(".mjs")) {
      assert.equal(/from\s+["'][^"']*(e3-changed-data|e4-maintained-runtime|v6-useful-job-desk)/.test(text), false, rel);
    }
  }
});
