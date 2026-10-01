import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { hashTermsVersion, parseTerms, validateTermsFile } from "../src/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const goldenPath = join(root, "fixtures/golden/complete.terms.json");

function runCli(file: string) {
  return spawnSync(process.execPath, [join(root, "bin/validate.mjs"), file], {
    encoding: "utf8",
  });
}

test("node validator accepts the golden fixture and prints canonical hash/termsVersion", () => {
  const result = runCli(goldenPath);
  assert.equal(result.status, 0, result.stderr);
  const printed = JSON.parse(result.stdout) as {
    ok: boolean;
    termsVersion: string;
    canonicalHash: string;
    taskId: string;
  };
  assert.equal(printed.ok, true);
  assert.equal(printed.termsVersion, printed.canonicalHash);
  assert.match(printed.termsVersion, /^sha256:[0-9a-f]{64}$/);
  assert.equal(printed.taskId, "task_f17_golden_fixture_01");
  const parsed = parseTerms(JSON.parse(readFileSync(goldenPath, "utf8")));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(printed.termsVersion, parsed.value.termsVersion);
  assert.equal(hashTermsVersion(parsed.value), printed.canonicalHash);
});

test("validateTermsFile helper matches CLI", () => {
  const helper = validateTermsFile(goldenPath);
  const cli = runCli(goldenPath);
  assert.deepEqual(JSON.parse(cli.stdout), helper);
});

test("node validator rejects every seeded negative", () => {
  const dir = join(root, "fixtures/negatives");
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    const result = runCli(join(dir, name));
    assert.notEqual(result.status, 0, name);
    const payload = JSON.parse(result.stderr) as { ok: boolean; code: string };
    assert.equal(payload.ok, false, name);
    assert.equal(typeof payload.code, "string");
  }
});

test("pack TypeScript sources do not eval, spawn, or vm-run artifact code", () => {
  const srcDir = join(root, "src");
  const files = ["canonical.ts", "forbidden.ts", "hash.ts", "money.ts", "schema.ts", "validate.ts", "index.ts"];
  const joined = files.map((name) => readFileSync(join(srcDir, name), "utf8")).join("\n");
  assert.equal(joined.includes("eval("), false);
  assert.equal(joined.includes("Function("), false);
  assert.equal(joined.includes("child_process"), false);
  assert.equal(joined.includes("node:vm"), false);
  assert.equal(joined.includes("fetch("), false);
});
