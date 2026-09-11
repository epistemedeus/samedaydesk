import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { ARCHIVE_SHA256, EXECUTION_CONTRACT } from "../lib/pins.mjs";
import { prefixLayout, sha256File } from "../lib/install.mjs";
import { runD01Cli, runPythonCli } from "../lib/invoke.mjs";
import { archivePath, sharedPrefix, stageCaller } from "./helpers.mjs";

test("pip-installed Co14 CLI runs caller vendor-budget-impact and writes usable outputs", () => {
  const prefix = sharedPrefix();
  const layout = prefixLayout(prefix);
  const caller = stageCaller(prefix);
  const outDir = join(layout.work, "py-budget");
  const result = runPythonCli(prefix, [
    "run",
    "vendor-budget-impact",
    "--archive",
    archivePath(prefix),
    "--before",
    caller.before,
    "--after",
    caller.after,
    "--out-dir",
    outDir,
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.json?.ok, true);
  assert.equal(result.json?.sold, false);
  assert.equal(result.json?.purchaseAuthority, false);
  assert.equal(result.json?.sample, false);
  assert.equal(result.json?.job, "vendor-budget-impact");
  assert.equal(result.json?.outputsExist, true);
  assert.ok(existsSync(join(outDir, "budget-impact.json")));
  assert.ok(existsSync(join(outDir, "budget-impact.md")));
  const report = JSON.parse(readFileSync(join(outDir, "budget-impact.json"), "utf8"));
  assert.equal(report.appId, "vendor-budget-impact");
  assert.notEqual(result.json?.sha256, undefined);
  assert.equal(result.json?.sha256, ARCHIVE_SHA256);
});

test("D01 CLI from mini-layout returns execution.v1 with complete delivery", () => {
  const prefix = sharedPrefix();
  const layout = prefixLayout(prefix);
  const caller = stageCaller(prefix);
  const outDir = join(layout.work, "d01-budget");
  const result = runD01Cli(prefix, [
    "run",
    "vendor-budget-impact",
    "--before",
    caller.before,
    "--after",
    caller.after,
    "--out-dir",
    outDir,
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.json?.ok, true);
  assert.equal(result.json?.contract, EXECUTION_CONTRACT);
  assert.equal(result.json?.transport, "ok");
  assert.equal(result.json?.delivery?.complete, true);
  assert.equal(result.json?.sold, false);
  assert.ok(existsSync(join(outDir, "budget-impact.json")));
  assert.ok(existsSync(join(outDir, "receipt.json")));
  const digest = sha256File(join(outDir, "budget-impact.json"));
  assert.equal(digest.length, 64);
});
