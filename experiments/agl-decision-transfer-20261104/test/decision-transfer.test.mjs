import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const workflow = join(root, "experiments/n4-workflow-distribution-20261104/bin/workflow.mjs");
const manifest = join(root, "experiments/n4-workflow-distribution-20261104/fixtures/before-work.json");
const input = join(root, "experiments/n4-workflow-distribution-20261104/fixtures/case.json");

test("a distinct participant reuses the prepared decide-or-reuse command", () => {
  const state = mkdtempSync(join(tmpdir(), "agl-dt-"));
  const out = join(state, "out");
  const install = spawnSync(process.execPath, [
    workflow, "install", "--state", state, "--clock", "2026-11-04T22:00:00.000Z",
  ], { encoding: "utf8" });
  assert.equal(install.status, 0, install.stderr || install.stdout);
  const run = spawnSync(process.execPath, [
    workflow, "run", "--state", state, "--input", input, "--out", out,
  ], { encoding: "utf8", cwd: root });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const result = JSON.parse(readFileSync(join(out, "result.json"), "utf8"));
  assert.equal(result.transfer.sent, false);
  assert.equal(result.transfer.artifact, "bound-observation.json");
  const command = result.transfer.command;
  assert.equal(Array.isArray(command), true);
  assert.equal(command.includes("--producer"), false);
  assert.equal(command.includes("source-change-alert"), false);
  const argv = command.slice(1).map((token) => {
    if (token === "<the same before-work manifest>") return manifest;
    if (token === "bound-observation.json") return join(out, "bound-observation.json");
    return token;
  });
  const reused = spawnSync(process.execPath, argv, { encoding: "utf8", cwd: root });
  assert.equal(reused.status, 0, `${reused.stderr || reused.stdout}\ncommand=${JSON.stringify(command)}`);
  const body = JSON.parse(reused.stdout);
  assert.equal(body.verdict, "reuse");
  assert.equal(body.producerInvoked, false);
});
