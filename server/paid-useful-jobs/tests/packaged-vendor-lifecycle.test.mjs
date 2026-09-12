import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

test("packaged 1.4.3 extracts its real pinned vendors without leaving scratch", () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const work = mkdtempSync(join(tmpdir(), "packaged-vendor-test-"));
  try {
    const archive = join(root, "client/public/for-agents/useful-jobs/useful-jobs-1.4.3.tar.gz");
    const extracted = spawnSync("tar", ["-xzf", archive, "-C", work], { encoding: "utf8" });
    assert.equal(extracted.status, 0, extracted.stderr);
    const source = join(work, "useful-jobs-1.4.3/lib/common.mjs");
    const controls = spawnSync(process.execPath, ["--test", fileURLToPath(new URL("vendor-temp-lifecycle.test.mjs", import.meta.url))], {
      env: { ...process.env, VENDOR_COMMON_TEST_SOURCE: source }, encoding: "utf8",
    });
    assert.equal(controls.status, 0, controls.stdout + controls.stderr);
    const scratch = join(work, "scratch");
    mkdirSync(scratch);
    const code = `const m=await import(${JSON.stringify(pathToFileURL(source).href)}); m.assertArchivePins(); console.log(m.ensureVendorsExtracted());`;
    const processResult = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
      env: { ...process.env, TMPDIR: scratch }, encoding: "utf8",
    });
    assert.equal(processResult.status, 0, processResult.stderr);
    assert.equal(existsSync(processResult.stdout.trim()), false);
    assert.deepEqual(readdirSync(scratch), []);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
