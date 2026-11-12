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
    // The closure is the repaired client exactly as shipped in machine-gateway 0.1.3.
    const PINNED = {
      "server/vendor/machine-gateway/bin/client-io.mjs": "c6613e44349a5741308d551df41c85b55709f48ea1ce7cf72f229dc00939a8aa",
      "server/vendor/machine-gateway/src/util.mjs": "0d6835e1bc32a3d2224bfee3ce0e56fe9b8ef6b899d2a498bc4ccf51e1fea4b8",
      "server/vendor/machine-gateway/src/errors.mjs": "56317ae7cb5a920f952fb493022fb409fe5fbc893ff38603baaa62d2bbbec303",
    };
    assert.deepEqual(Object.fromEntries(closure.files.map(file => [file.sourcePath, file.sha256])), PINNED);
    const released = JSON.parse(readFileSync(join(repo, "server/vendor/machine-gateway/deploy/RECEIVED-0.1.3.json"), "utf8")).files;
    for (const file of closure.files) assert.equal(file.sha256, released[file.sourcePath.replace("server/vendor/machine-gateway/", "")], file.sourcePath);
    for (const name of readdirSync(join(target, "src"))) {
      assert.ok(!readFileSync(join(target, "src", name), "utf8").includes("../../../server/"), name);
    }
    const out = JSON.parse(execFileSync(process.execPath, [join(target, "bin/samedaydesk.mjs"), "version"], { encoding: "utf8" }));
    assert.equal(out.ok, true);
    assert.equal(out.result.cliVersion ?? out.cliVersion, "0.1.0");
  } finally { rmSync(target, { recursive: true, force: true }); }
});
