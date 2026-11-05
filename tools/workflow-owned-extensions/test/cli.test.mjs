import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const repo = join(here, "../../..");
const cli = join(root, "cli.mjs");

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", cwd: repo });
}

test("CLI preview uses the direct fallback and prints honest runtime status", () => {
  const preview = run([
    "preview",
    "--input", join(root, "fixtures/inputs/fitting-n45-page-change.json"),
    "--task-id", "n45-example-com",
    "--subject", "n45-example-com-result",
    "--sequence", "1",
    "--clock", "2026-09-09T08:00:00.000Z",
  ]);
  assert.equal(preview.status, 0, preview.stderr);
  const body = JSON.parse(preview.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.fitting, true);
  assert.equal(body.runtimeExecutionStatus, "not yet executed on runtime");
  assert.equal(body.installationStatus, "source_only_not_installed");
  assert.equal(body.executionPath, "direct_sdk_fallback");
});

test("CLI invoke accepts Dify-shaped params and a non-fitting task exits 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "woe-cli-"));
  const params = join(dir, "params.json");
  writeFileSync(params, `${JSON.stringify({
    consumer: "dify",
    tool: "preview_reuse",
    input_json: JSON.parse(readFileSync(join(root, "fixtures/inputs/nonfitting-unrecognized-chat-task.json"), "utf8")),
    task_id: "n45-example-com",
    subject: "n45-example-com-result",
    sequence: 1,
    clock: "2026-09-09T08:00:00.000Z",
  }, null, 2)}\n`);
  const invoked = run(["invoke", "--params", params]);
  assert.equal(invoked.status, 0, invoked.stderr);
  const body = JSON.parse(invoked.stdout);
  assert.equal(body.fitting, false);
  assert.equal(body.ok, true);
});

test("CLI register and update keep the extension source-only", () => {
  const store = mkdtempSync(join(tmpdir(), "woe-cli-store-"));
  const registered = run(["register", "--store", store, "--clock", "2026-11-05T12:00:00.000Z"]);
  assert.equal(registered.status, 0, registered.stderr);
  const updated = run(["update", "--store", store, "--version", "0.1.1", "--clock", "2026-11-05T12:05:00.000Z"]);
  assert.equal(updated.status, 0, updated.stderr);
  const body = JSON.parse(updated.stdout);
  assert.equal(body.record.version, "0.1.1");
  assert.equal(body.record.installationStatus, "source_only_not_installed");
});

test("CLI export without opt-in exits 1", () => {
  const denied = run([
    "export",
    "--input", join(root, "fixtures/inputs/fitting-n45-page-change.json"),
    "--task-id", "n45-example-com",
    "--subject", "n45-example-com-result",
    "--sequence", "1",
    "--clock", "2026-09-09T08:00:00.000Z",
    "--out", join(tmpdir(), "should-not-matter.json"),
  ]);
  assert.equal(denied.status, 1);
  const body = JSON.parse(denied.stderr.trim().split("\n").findLast((line) => line.startsWith("{")));
  assert.equal(body.ok, false);
  assert.match(body.sdk.message, /opt-in/);
});
