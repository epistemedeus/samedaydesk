import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const cli = join(here, "cli.mjs");

function run(args, timeout = 60_000) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout,
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

test("prove result-reuse preview supplies required caller fields", { timeout: 30_000 }, () => {
  const result = run(["prove", "--feature", "result-reuse", "--json"], 30_000);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.feature, "result-reuse");
  assert.equal(result.json.result.childExit, 0);
  assert.equal(result.json.result.json?.ok, true);
});

test("result-reuse export without --opt-in is seeded refuse and does not write", { timeout: 30_000 }, () => {
  const result = run(["pack", "run", "result-reuse", "--seeded-failure", "--json"], 30_000);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "SEED_REJECT");
  assert.equal(result.json.result.childExit, 1);
  assert.equal(result.json.result.destExists, false);
  assert.match(JSON.stringify(result.json.result.product || result.json.error), /opt-in/);
});

test("prove hosted-readback keeps the host up for /api/health", { timeout: 60_000 }, () => {
  const result = run(["prove", "--feature", "hosted-readback", "--json"], 60_000);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.feature, "hosted-readback");
  assert.equal(result.json.result.fetch.status, 200);
  assert.equal(result.json.result.fetch.json.service, "samedaydesk");
  assert.equal(result.json.result.serve.status, 200);
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.toolsCalled, false);
  const http = (result.json.evidence || []).find((row) => row.kind === "http" && row.path === "/api/health");
  assert.ok(http, "expected http evidence for /api/health");
});
