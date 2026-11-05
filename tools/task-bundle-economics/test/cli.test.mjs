import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const cli = join(root, "cli.mjs");
const siteRoot = join(here, "../../..");

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", cwd: siteRoot });
}

test("evaluate prints a bundle-helpful decision", () => {
  const result = runCli(["evaluate", "--input", "tools/task-bundle-economics/fixtures/bundle-helpful.json"]);
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.bundleDecision.action, "suggest_bundle");
  assert.equal(body.signer, false);
});

test("receipt writes a portable file and compare discloses unknown effort", () => {
  const out = join(mkdtempSync(join(tmpdir(), "task-econ-")), "receipt.json");
  const written = runCli([
    "receipt",
    "--input",
    "tools/task-bundle-economics/fixtures/reservation-preserved.json",
    "--out",
    out,
  ]);
  assert.equal(written.status, 0, written.stderr);
  const receipt = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(receipt.kind, "requester_receipt");
  assert.deepEqual(receipt.reservations, ["rsv_keep_exact_identity"]);

  const compared = runCli(["compare", "--input", "tools/task-bundle-economics/fixtures/unknown-effort.json"]);
  assert.equal(compared.status, 0, compared.stderr);
  const body = JSON.parse(compared.stdout);
  assert.equal(body.effort.comparison, "costs_unknown");
});

test("help exits 0 and unknown commands are refused", () => {
  const help = runCli(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /evaluate/);
  const bad = runCli(["pay", "--input", "tools/task-bundle-economics/fixtures/bundle-helpful.json"]);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /evaluate, receipt, or compare/);
});
