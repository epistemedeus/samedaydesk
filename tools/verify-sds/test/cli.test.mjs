import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const pack = join(here, "..");
const root = join(pack, "../..");
const cli = join(pack, "cli.mjs");

function run(args, opts = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: opts.timeout ?? 90_000,
    env: process.env,
  });
  let json = null;
  try {
    json = JSON.parse(result.stdout.trim().split("\n").at(-1));
  } catch {
    json = null;
  }
  return { ...result, json };
}

test("doctor --json exits 0 with the three jobs and 1.4.7 kit pin", () => {
  const result = run(["doctor", "--json"]);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.schema, "samedaydesk.lab-verify.envelope.v1");
  assert.equal(result.json.command, "doctor");
  assert.equal(result.json.repo, "samedaydesk");
  assert.match(result.json.node.actual, /^v22\./);
  assert.deepEqual(result.json.result.jobs, ["useful-jobs", "packs", "mcp"]);
  assert.equal(result.json.result.kit.sha256, "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec");
  assert.equal(result.json.result.kit.bytes, 5255824);
  assert.equal(result.json.result.negativeControl.version, "1.1.0");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.toolsCalled, false);
  assert.equal(result.json.error, null);
});

test("jobs --json lists useful-jobs, packs, mcp", () => {
  const result = run(["jobs", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.json.result.jobs, ["useful-jobs", "packs", "mcp"]);
});

test("unknown command is usage exit 2", () => {
  const result = run(["not-a-command", "--json"]);
  assert.equal(result.status, 2);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "USAGE");
});

test("--live is refused without payment or MCP calls", () => {
  const result = run(["--live", "doctor", "--json"]);
  assert.equal(result.status, 2);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "USAGE");
  assert.match(result.json.error.message, /unpaid and offline/);
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.toolsCalled, false);
});

test("dry-run run --all does not extract or spawn", () => {
  const result = run(["--dry-run", "run", "--all", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.dryRun, true);
  assert.equal(result.json.job, "all");
  assert.equal(result.json.boundary.toolsCalled, false);
});
