import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { classifyStale } from "../lib/stale.mjs";
import { resolveRoot } from "../lib/repo.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pack = join(here, "..");
const root = join(pack, "../..");
const cli = join(pack, "cli.mjs");

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

test("seeded stale-output is rejected with STALE_OUTPUT", () => {
  const result = run(["--seeded-failure", "stale-output", "--json", "--clock", "2026-09-17T12:00:00.000Z"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "STALE_OUTPUT");
  assert.match(result.json.error.message, /^stale_output: receipt is not current \(reasons: /);
  assert.ok(result.json.result.reasons.includes("pin_mismatch"));
  assert.ok(result.json.result.reasons.includes("clock_past_horizon"));
  assert.ok(result.json.result.reasons.includes("input_digest_mismatch"));
  assert.equal(result.json.boundary.paymentSent, false);
});

test("accept --fixture seeded stale-output quotes the same failure", () => {
  const result = run([
    "accept",
    "--fixture",
    "tools/verify-sds/fixtures/seeded/stale-output.json",
    "--json",
    "--clock",
    "2026-09-17T12:00:00.000Z",
  ]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.error.code, "STALE_OUTPUT");
  assert.equal(
    result.json.error.message,
    "stale_output: receipt is not current (reasons: pin_mismatch, input_digest_mismatch, clock_past_horizon)",
  );
});

test("seeded stale-pin is rejected", () => {
  const result = run([
    "--seeded-failure",
    "stale-pin",
    "--json",
    "--clock",
    "2026-09-17T12:00:00.000Z",
  ]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.error.code, "STALE_OUTPUT");
  assert.ok(result.json.result.reasons.includes("pin_mismatch"));
});

test("seeded stale-clock is rejected", () => {
  const result = run([
    "--seeded-failure",
    "stale-clock",
    "--json",
    "--clock",
    "2026-09-17T12:00:00.000Z",
  ]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.error.code, "STALE_OUTPUT");
  assert.ok(result.json.result.reasons.includes("clock_past_horizon"));
});

test("fresh mcp receipt is accepted", () => {
  const produced = run(["run", "mcp", "--json", "--clock", "2026-09-17T12:00:00.000Z"]);
  assert.equal(produced.status, 0, produced.stderr);
  const dir = mkdtempSync(join(tmpdir(), "sds-lab-verify-receipt-"));
  const path = join(dir, "fresh-mcp.json");
  writeFileSync(path, `${JSON.stringify(produced.json.receipt, null, 2)}\n`);
  const accepted = run(["accept", "--output", path, "--json", "--clock", "2026-09-17T12:00:00.000Z"]);
  assert.equal(accepted.status, 0, accepted.stderr + accepted.stdout);
  assert.equal(accepted.json.ok, true);
  assert.equal(accepted.json.result.stale, false);
});

test("classifyStale flags a backdated copy of a current pin", () => {
  const repo = resolveRoot(root);
  const produced = run(["run", "mcp", "--json", "--clock", "2026-09-17T12:00:00.000Z"]);
  const receipt = { ...produced.json.receipt, clock: "2020-01-01T00:00:00.000Z" };
  const classified = classifyStale(receipt, {
    root: repo,
    now: "2026-09-17T12:00:00.000Z",
    horizonHours: 24,
  });
  assert.equal(classified.stale, true);
  assert.ok(classified.reasons.includes("clock_past_horizon"));
  assert.ok(!classified.reasons.includes("pin_mismatch"));
});
