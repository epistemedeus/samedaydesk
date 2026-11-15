import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { stage, CLOSURE } from "../scripts/pack.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

test("pack stage is self-contained and copies the exact machine-gateway closure", () => {
  const { target } = stage();
  try {
    const closure = JSON.parse(readFileSync(join(target, "vendor/machine-gateway/CLOSURE.json"), "utf8"));
    assert.equal(closure.files.length, CLOSURE.length);
    for (const file of closure.files) {
      const original = readFileSync(join(repo, file.sourcePath));
      const copied = readFileSync(join(target, file.path));
      assert.deepEqual(copied, original);
      assert.equal(file.sha256, createHash("sha256").update(original).digest("hex"));
    }
    for (const name of readdirSync(join(target, "src"))) {
      assert.ok(!readFileSync(join(target, "src", name), "utf8").includes("../../../server/"), name);
    }
    const out = JSON.parse(execFileSync(process.execPath, [join(target, "bin/samedaydesk.mjs"), "version"], { encoding: "utf8" }));
    assert.equal(out.ok, true);
    assert.equal(out.result.cliVersion ?? out.cliVersion, "0.1.0");
  } finally { rmSync(target, { recursive: true, force: true }); }
});
