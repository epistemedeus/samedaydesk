import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = join(ROOT, "bin/value.mjs");
const CALLER_BEFORE = join(ROOT, "fixtures/caller/vendor-budget-impact/before.json");
const CALLER_AFTER = join(ROOT, "fixtures/caller/vendor-budget-impact/after.json");

function run(args, cwd = ROOT) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: "utf8",
    cwd,
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function parse(result) {
  assert.ok(String(result.stdout || "").trim(), `empty stdout stderr=${result.stderr}`);
  return JSON.parse(result.stdout);
}

describe("public CLI journey: owner-qa vendor-budget-impact example vs caller", () => {
  test("two labelled rows; example sample=true; caller sample=false; neither independent demand", () => {
    const work = mkdtempSync(join(tmpdir(), "bvl-journey-"));
    const ledger = join(work, "ledger.json");
    const exampleOut = join(work, "example");
    const callerOut = join(work, "caller");
    mkdirSync(exampleOut);
    mkdirSync(callerOut);

    const example = run([
      "run",
      "vendor-budget-impact",
      "--buyer-class",
      "owner-qa",
      "--example",
      "--ledger",
      ledger,
      "--out-dir",
      exampleOut,
    ]);
    assert.equal(example.status, 0, example.stderr + example.stdout);
    const exampleJson = parse(example);
    assert.equal(exampleJson.ok, true);
    assert.equal(exampleJson.row.buyerClass, "owner-qa");
    assert.equal(exampleJson.row.sample, true);
    assert.equal(exampleJson.row.independentDemand, false);
    assert.equal(exampleJson.row.organicDemand, false);
    assert.equal(exampleJson.row.jobRevenueUsdc, null);
    assert.equal(exampleJson.row.citedBankedUsdcIsNotJobRevenue, true);
    assert.equal(exampleJson.row.usableOutput, true);
    assert.equal(exampleJson.row.outputBytes > 0, true);
    assert.equal(Number.isInteger(exampleJson.row.durationMs), true);
    assert.equal(exampleJson.row.durationMs >= 0, true);
    assert.equal(exampleJson.row.evidence.jobExecution, "local-runtime");
    assert.equal(exampleJson.row.evidence.callerInputs, "example-sample");
    assert.equal(exampleJson.row.evidence.externalAcceptance, false);
    assert.equal(exampleJson.honesty.citedBankedUsdc, "8.105");
    assert.deepEqual(
      exampleJson.row.outputs.map((item) => item.name),
      ["budget-impact.json", "budget-impact.md"],
    );
    assert.equal(
      exampleJson.row.prohibitedInferences.includes("analytics_count_is_independent_demand"),
      true,
    );

    const caller = run([
      "run",
      "vendor-budget-impact",
      "--buyer-class",
      "owner-qa",
      "--before",
      CALLER_BEFORE,
      "--after",
      CALLER_AFTER,
      "--ledger",
      ledger,
      "--out-dir",
      callerOut,
    ]);
    assert.equal(caller.status, 0, caller.stderr + caller.stdout);
    const callerJson = parse(caller);
    assert.equal(callerJson.ok, true);
    assert.equal(callerJson.row.sample, false);
    assert.equal(callerJson.row.independentDemand, false);
    assert.equal(callerJson.row.usableOutput, true);
    assert.equal(callerJson.row.evidence.callerInputs, "fixture");
    assert.equal(callerJson.row.engine.archiveSha256, exampleJson.row.engine.archiveSha256);

    const shown = run(["show", "--ledger", ledger]);
    assert.equal(shown.status, 0, shown.stderr + shown.stdout);
    const shownJson = parse(shown);
    assert.equal(shownJson.rowCount, 2);
    assert.equal(shownJson.independentDemand, false);
    assert.equal(shownJson.samples[0].sample, true);
    assert.equal(shownJson.samples[1].sample, false);
    assert.equal(shownJson.samples.every((row) => row.buyerClass === "owner-qa"), true);
    assert.equal(shownJson.samples.every((row) => row.independentDemand === false), true);
    assert.equal(shownJson.honesty.jobRevenueUsdc, null);

    const disk = JSON.parse(readFileSync(ledger, "utf8"));
    assert.equal(disk.rows.length, 2);
    assert.equal(disk.jobRevenueUsdc, null);
  });
});
