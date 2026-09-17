import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadCorpus } from "./lib/load.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const runner = join(here, "run.mjs");

function run(args, timeout = 120_000) {
  const result = spawnSync(process.execPath, [runner, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout,
    env: process.env,
  });
  let json = null;
  try {
    json = JSON.parse(String(result.stdout || "").trim().split("\n").at(-1));
  } catch {
    json = null;
  }
  return { ...result, json };
}

test("catalog matches case directories and schemaVersion 1", () => {
  const corpus = loadCorpus();
  assert.equal(corpus.catalog.schemaVersion, 1);
  assert.equal(corpus.catalog.repo, "samedaydesk");
  assert.equal(corpus.catalog.seededFalseAccept, "archive-wrong-digest");
  assert.equal(corpus.catalog.seededFalseReject, "offer-routing-complete-issue");
  assert.equal(corpus.cases.length, 15);
  const surfaces = new Set(corpus.cases.map((item) => item.spec.surface));
  assert.deepEqual([...surfaces].sort(), ["buyer", "merchant", "pack", "verifier"]);
});

test("corpus run against real product artifacts exits 0 and catches both seeds", () => {
  const result = run(["--json"]);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.command, "run");
  assert.equal(result.json.repo, "samedaydesk");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.toolsCalled, false);
  assert.equal(result.json.result.failed, 0);
  assert.equal(result.json.result.total, 15);
  assert.ok(result.json.result.caughtFalseAccepts.includes("archive-wrong-digest"));
  assert.ok(result.json.result.caughtFalseRejects.includes("offer-routing-complete-issue"));
  const digest = result.json.result.cases.find((row) => row.id === "archive-wrong-digest");
  assert.equal(digest.observed.exitCode, 0);
  assert.equal(digest.observed.json.code, "wrong-digest");
  assert.equal(digest.falseAccept, true);
  const route = result.json.result.cases.find((row) => row.id === "offer-routing-complete-issue");
  assert.equal(route.observed.exitCode, 2);
  assert.equal(route.observed.json.selected, null);
  assert.equal(route.falseReject, true);
});

test("missing --case value is usage exit 2", () => {
  const result = run(["--case", "--json"]);
  assert.equal(result.status, 2);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "USAGE");
});
