import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const cli = join(here, "cli.mjs");

function run(args, opts = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: opts.timeout ?? 30_000,
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

test("doctor --json exits 0 with parseable envelope", () => {
  const result = run(["doctor", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.schemaVersion, 1);
  assert.equal(result.json.command, "doctor");
  assert.equal(result.json.repo, "samedaydesk");
  assert.match(result.json.node.actual, /^v22\./);
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.toolsCalled, false);
  assert.equal(result.json.result.kit.sha256, "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec");
  assert.equal(result.json.result.kit.bytes, 5255824);
  assert.equal(result.json.result.negativeControl.version, "1.1.0");
});

test("dry-run fetch does not require a live server", () => {
  const result = run(["--dry-run", "fetch", "--path", "/api/health", "--origin", "http://127.0.0.1:3999", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.json.dryRun, true);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.command, "fetch");
});

test("unknown command is usage exit 2", () => {
  const result = run(["not-a-command", "--json"]);
  assert.equal(result.status, 2);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "USAGE");
});

test("mcp tools/call is refused without calling tools", () => {
  const result = run(["mcp", "tools", "call", "--json"]);
  assert.equal(result.status, 2);
  assert.equal(result.json.boundary.toolsCalled, false);
  assert.equal(result.json.error.code, "USAGE");
});

test("mcp tools/list slash form is accepted as list-only", () => {
  const result = run(["mcp", "tools/list", "--dry-run", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.dryRun, true);
  assert.equal(result.json.boundary.toolsCalled, false);
});

test("mcp tools/call slash form is refused", () => {
  const result = run(["mcp", "tools/call", "--json"]);
  assert.equal(result.status, 2);
  assert.equal(result.json.error.code, "USAGE");
  assert.equal(result.json.boundary.toolsCalled, false);
});

test("mcp cite-pilot does not POST tools/call", () => {
  const result = run(["mcp", "cite-pilot", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.boundary.toolsCalled, false);
  assert.equal(result.json.result.forkedPlatform, false);
  assert.match(result.json.result.liveOwnerProbe, /verify-samedaydesk-mcp/);
});

test("dry-run build lists npm run build", () => {
  const result = run(["build", "--dry-run", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.json.dryRun, true);
  const blob = JSON.stringify(result.json);
  assert.match(blob, /npm run build/);
  assert.match(blob, /test:hosted-startup/);
});
