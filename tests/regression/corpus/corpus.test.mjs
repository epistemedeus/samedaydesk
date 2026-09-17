import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { judge, loadCatalog } from "./lib/catalog.mjs";
import { evaluateCase } from "./lib/evaluate.mjs";
import { REPO_ROOT } from "./lib/root.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const runner = join(here, "run.mjs");

function run(args, timeout = 120_000) {
  const result = spawnSync(process.execPath, [runner, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout,
    env: process.env,
  });
  let json = null;
  try {
    json = JSON.parse(result.stdout.trim());
  } catch {
    json = null;
  }
  return { ...result, json };
}

test("catalog covers merchant, buyer, verifier, and pack", () => {
  const catalog = loadCatalog();
  const surfaces = new Set(catalog.cases.map((entry) => entry.surface));
  assert.deepEqual([...surfaces].sort(), ["buyer", "merchant", "pack", "verifier"]);
  assert.equal(catalog.writeBoundary, "tests/regression/corpus/**");
  assert.ok(catalog.cases.some((entry) => entry.kind === "seeded_false_accept"));
  assert.ok(catalog.cases.some((entry) => entry.kind === "seeded_false_reject"));
});

test("every product case matches the live module", async () => {
  const catalog = loadCatalog();
  const product = catalog.cases.filter((entry) => entry.kind === "product");
  assert.ok(product.length >= 16);
  for (const entry of product) {
    const observed = await evaluateCase(entry);
    const judged = judge(entry, observed);
    assert.equal(judged.ok, true, `${entry.id}: ${observed.code} ${observed.message}`);
  }
});

test("seeded false-accept and false-reject are caught in the catalog", async () => {
  const catalog = loadCatalog();
  const seeds = catalog.cases.filter((entry) => entry.kind.startsWith("seeded_"));
  assert.equal(seeds.length, 2);
  for (const entry of seeds) {
    const observed = await evaluateCase(entry);
    const judged = judge(entry, observed);
    assert.equal(judged.status, "caught", entry.id);
    assert.equal(judged.ok, true, entry.id);
  }
});

test("run.mjs --json exits 0 and reports seeded caught", () => {
  const result = run(["--json"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.status, "pass");
  assert.ok(result.json.counts.caught >= 1, JSON.stringify(result.json.counts));
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.toolsCalled, false);
  const caught = result.json.cases.filter((row) => row.status === "caught").map((row) => row.id);
  assert.ok(caught.includes("seeded.false-accept.archive-wrong-digest"));
  assert.ok(caught.includes("seeded.false-reject.valid-record"));
});

test("run.mjs --seeded-failure exits 1 with SEED_REJECT false-accept", () => {
  const result = run(["--seeded-failure", "--json"]);
  assert.notEqual(result.status, 0);
  assert.equal(result.status, 1);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "SEED_REJECT");
  assert.equal(result.json.error.kind, "false_accept");
  assert.match(result.json.error.message, /false_accept/);
  assert.equal(result.json.cases[0].observedVerdict, "reject");
  assert.equal(result.json.cases[0].claimedVerdict, "accept");
});

test("run.mjs --fixture false-reject.json exits 1 with SEED_REJECT false-reject", () => {
  const result = run([
    "--fixture",
    "tests/regression/corpus/fixtures/seeded/false-reject.json",
    "--json",
  ]);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.equal(result.json.error.code, "SEED_REJECT");
  assert.equal(result.json.error.kind, "false_reject");
  assert.equal(result.json.cases[0].observedVerdict, "accept");
  assert.equal(result.json.cases[0].claimedVerdict, "reject");
});

test("matching claimed verdict is SEED_MISS, not SEED_REJECT", () => {
  const result = run([
    "--fixture",
    "tests/regression/corpus/fixtures/seeded/matching-wrong-digest.json",
    "--json",
  ]);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "SEED_MISS");
  assert.equal(result.json.cases[0].claimedVerdict, "reject");
  assert.equal(result.json.cases[0].observedVerdict, "reject");
});

test("write boundary stays inside tests/regression/corpus", () => {
  const catalog = JSON.parse(readFileSync(join(here, "catalog.json"), "utf8"));
  assert.equal(catalog.writeBoundary, "tests/regression/corpus/**");
});
