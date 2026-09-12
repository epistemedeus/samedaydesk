import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { CHECK_ROOT, loadCorpus, loadPin } from "../lib/paths.mjs";
import { KitIncomplete, resolveKit } from "../lib/kit.mjs";
import { runCheck } from "../lib/check.mjs";
import { isDefect } from "../lib/judge.mjs";

const BIN = join(CHECK_ROOT, "bin", "check.mjs");

test("public kit resolves and compare.mjs matches the RC pin", () => {
  const pin = loadPin();
  const kit = resolveKit(pin);
  assert.equal(existsSync(kit.bin), true);
  assert.deepEqual(kit.cli, ["node", "bin/useful-jobs.mjs", "run", "json-schema-webhook-drift"]);
});

test("shipped default CLI reproduces specified-vs-engine boundaries", () => {
  let kit;
  try {
    kit = resolveKit();
  } catch (err) {
    if (err instanceof KitIncomplete) {
      assert.fail(err.message);
    }
    throw err;
  }
  const corpus = loadCorpus();
  const result = runCheck({ kit });
  assert.equal(result.incomplete, false);
  assert.equal(result.summary.transportFailures.length, 0);
  assert.equal(result.summary.witnessFailures.length, 0);
  assert.equal(result.summary.pinMismatches.length, 0, result.summary.pinMismatches.join(","));
  assert.equal(result.rows.length, corpus.cases.length);

  for (const row of result.rows) {
    assert.equal(row.observed.customerBrief, false, row.id);
    assert.equal(row.observed.purchaseAuthority, false, row.id);
    assert.equal(row.observed.sold, false, row.id);
  }

  const defects = result.rows.filter((row) => isDefect(row.judgment)).map((row) => `${row.judgment.id}:${row.id}`);
  assert.ok(defects.includes("false-unsafe:E1-enum-widen"));
  assert.ok(defects.includes("false-unsafe:T1-integer-to-number"));
  assert.ok(defects.includes("false-safe:O1-nested-type-at-root-used"));
  assert.ok(defects.includes("false-safe:O3-additionalProperties-schema-type"));
  assert.ok(defects.includes("false-safe:R1-ref-nested-under-root-used"));
  assert.equal(result.summary.verdict, "FAIL");

  const agreeIds = result.rows.filter((row) => row.judgment.id === "agree").map((row) => row.id);
  assert.ok(agreeIds.includes("C1-no-change"));
  assert.ok(agreeIds.includes("C2-useful-type-change"));
  assert.ok(agreeIds.includes("C3-unused-sibling"));
  assert.ok(agreeIds.includes("C5-kit-sample"));
  assert.ok(agreeIds.includes("C6-example"));
  assert.ok(agreeIds.includes("C7-missing-inputs"));
  assert.ok(agreeIds.includes("O2-nested-type-at-leaf-used"));
  assert.ok(agreeIds.includes("T2-number-to-integer"));
});

test("check CLI writes the report against the default useful-jobs command", () => {
  const outDir = mkdtempSync(join(tmpdir(), "w5-m06-final-cli-"));
  const spawned = spawnSync(process.execPath, [BIN, "--out-dir", outDir], {
    encoding: "utf8",
  });
  assert.equal(spawned.status, 0, spawned.stderr || spawned.stdout);
  const report = JSON.parse(readFileSync(join(outDir, "final-engine-inputs-report.json"), "utf8"));
  assert.equal(report.summary.verdict, "FAIL");
  assert.deepEqual(report.summary.defaultCli, [
    "node",
    "bin/useful-jobs.mjs",
    "run",
    "json-schema-webhook-drift",
  ]);
});
