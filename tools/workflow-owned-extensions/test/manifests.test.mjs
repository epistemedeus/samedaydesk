import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadAllInterfaces, loadConsumerInterface } from "../src/manifests.mjs";
import { INSTALLATION_STATUS, RUNTIME_EXECUTION_STATUS } from "../src/pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");
const repo = join(here, "../../..");

function walk(directory) {
  const out = [];
  for (const name of readdirSync(directory)) {
    if (name === "node_modules") continue;
    const path = join(directory, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

test("source-only manifests load for Dify and Ghost without claiming installation", () => {
  const all = loadAllInterfaces();
  assert.equal(all.ok, true, all.message);
  assert.equal(all.installationStatus, INSTALLATION_STATUS);
  assert.equal(all.runtimeExecutionStatus, RUNTIME_EXECUTION_STATUS);
  const dify = loadConsumerInterface("dify");
  const ghost = loadConsumerInterface("ghost");
  assert.equal(dify.status.kind, "workflow_runtime_embedding");
  assert.equal(ghost.status.kind, "consumer_adapter");
  assert.ok(dify.files.some((file) => file.endsWith("manifest.yaml")));
  assert.ok(ghost.files.some((file) => file.endsWith("integration.json")));
});

test("no file in this package claims installation passed or runtime success", () => {
  const claim = /\binstallation passed\b|\binstalled successfully\b|\bruntime execution (?:passed|succeeded|complete)\b/i;
  const hits = [];
  for (const file of walk(packageRoot)) {
    if (file.endsWith(".json") && file.includes("/fixtures/outputs/")) continue;
    const text = readFileSync(file, "utf8");
    if (claim.test(text)) hits.push(file);
  }
  assert.deepEqual(hits, []);
});

test("this package does not change files outside tools/workflow-owned-extensions/", () => {
  const names = [
    "client/index.html",
    "server/lib/payment-attempt.js",
    "tools/result-reuse/src/export.mjs",
    "tools/recurring-job-recipes/vendor/merchant-contracts.mjs",
    "package.json",
  ];
  const status = spawnSync("git", ["diff", "--name-only", "--", ...names], {
    encoding: "utf8",
    cwd: repo,
  });
  assert.equal(status.stdout.trim(), "");
});
