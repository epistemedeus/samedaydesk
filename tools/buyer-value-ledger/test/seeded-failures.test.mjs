import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import { inspectBuyerClass } from "../lib/labels.mjs";
import { attributeJobRevenue } from "../lib/revenue.mjs";
import { ERROR_CODES } from "../lib/pins.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = join(ROOT, "bin/value.mjs");

function run(args) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: "utf8",
    cwd: ROOT,
    timeout: 30_000,
  });
}

function parse(result) {
  assert.ok(String(result.stdout || "").trim(), `empty stdout stderr=${result.stderr}`);
  return JSON.parse(result.stdout);
}

describe("seeded failures (public CLI + request fixtures)", () => {
  test("missing buyerClass is refused before a useful-jobs spawn", () => {
    const missing = JSON.parse(readFileSync(join(ROOT, "fixtures/reject/missing-buyer-class.json"), "utf8"));
    const labelled = inspectBuyerClass(missing);
    assert.equal(labelled.ok, false);
    assert.equal(labelled.code, ERROR_CODES.MISSING_BUYER_CLASS);

    const cli = run(["run", "vendor-budget-impact", "--example"]);
    assert.notEqual(cli.status, 0);
    const json = parse(cli);
    assert.equal(json.ok, false);
    assert.equal(json.code, ERROR_CODES.MISSING_BUYER_CLASS);
    assert.equal(json.independentDemand, false);
    assert.equal(json.jobRevenueUsdc, null);
  });

  test("labelling fixture-buyer as independent is refused", () => {
    const req = JSON.parse(
      readFileSync(join(ROOT, "fixtures/reject/fixture-buyer-as-independent.json"), "utf8"),
    );
    const labelled = inspectBuyerClass(req);
    assert.equal(labelled.ok, false);
    assert.equal(labelled.code, ERROR_CODES.FIXTURE_BUYER_IS_NOT_INDEPENDENT);

    const cli = run([
      "run",
      "vendor-budget-impact",
      "--buyer-class",
      "fixture-buyer",
      "--independent-demand",
      "--example",
    ]);
    assert.notEqual(cli.status, 0);
    const json = parse(cli);
    assert.equal(json.code, ERROR_CODES.FIXTURE_BUYER_IS_NOT_INDEPENDENT);
    assert.equal(json.independentDemand, false);
  });

  test("summing early-x402-revenue as job revenue is refused", () => {
    const req = JSON.parse(
      readFileSync(join(ROOT, "fixtures/reject/sum-early-x402-as-job-revenue.json"), "utf8"),
    );
    const lib = attributeJobRevenue(req);
    assert.equal(lib.ok, false);
    assert.equal(lib.code, ERROR_CODES.SETTLEMENT_IS_NOT_JOB_REVENUE);
    assert.equal(lib.jobRevenueUsdc, null);
    assert.equal(lib.amountUsdc, "0.040");

    const cli = run(["revenue", "--include-operation", "early-x402-revenue"]);
    assert.notEqual(cli.status, 0);
    const json = parse(cli);
    assert.equal(json.code, ERROR_CODES.SETTLEMENT_IS_NOT_JOB_REVENUE);
    assert.equal(json.citedBankedUsdc, "8.105");
  });

  test("treating 8.105 USDC as this job's revenue is refused", () => {
    const req = JSON.parse(
      readFileSync(join(ROOT, "fixtures/reject/cited-banked-as-job-revenue.json"), "utf8"),
    );
    const lib = attributeJobRevenue(req);
    assert.equal(lib.ok, false);
    assert.equal(lib.code, ERROR_CODES.CITED_BANKED_USDC_IS_NOT_JOB_REVENUE);

    const cli = run(["revenue", "--cited-banked-usdc"]);
    assert.notEqual(cli.status, 0);
    const json = parse(cli);
    assert.equal(json.code, ERROR_CODES.CITED_BANKED_USDC_IS_NOT_JOB_REVENUE);
    assert.equal(json.jobRevenueUsdc, null);
  });
});
