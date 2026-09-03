import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  listJsonFiles,
  loadCatalog,
  loadJson,
  settlementFixtureDir,
  validateRecord,
} from "../evidence-records/lib.mjs";
import {
  GOLDEN_PATH,
  classifyRecord,
  loadSettlementRecords,
  reconcileDir,
  reconcileRecords,
} from "./reconcile.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const catalog = loadCatalog();
const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));

function settlementRecords() {
  return loadSettlementRecords().map((item) => structuredClone(item.record));
}

test("every settlement fixture is a valid evidence record", () => {
  const files = listJsonFiles(settlementFixtureDir());
  assert.equal(files.length, 5);
  for (const filePath of files) {
    const result = validateRecord(loadJson(filePath), catalog);
    assert.equal(result.ok, true, `${basename(filePath)}: ${JSON.stringify(result.errors)}`);
  }
});

test("generated table equals the committed golden file", () => {
  const report = reconcileDir();
  assert.equal(report.ok, true, JSON.stringify(report.rejected));
  assert.deepEqual(report.table, golden);
  assert.equal(report.table.citedBankedUsdc, "8.105");
  assert.equal(report.table.computedUsdc, "8.105");
  assert.equal(report.table.differenceUsdc, "0.000");
});

test("removing a record completeness field moves it to unknown", () => {
  const records = settlementRecords();
  const frantic = records.find((item) => item.recordId === "frantic-42-revenue-2026-06-25");
  assert.ok(frantic);
  delete frantic.completeness;
  const report = reconcileRecords(records, catalog);
  assert.equal(report.ok, true, JSON.stringify(report.rejected));
  const byClass = Object.fromEntries(report.table.rows.map((row) => [row.buyerClass, row]));
  assert.equal(byClass.independent.count, 1);
  assert.equal(byClass.independent.usdc, "0.005");
  assert.deepEqual(
    byClass.independent.operations.map((item) => item.operationId),
    ["what-agents-buy-independent-benchmark-2026-08-30"],
  );
  assert.equal(byClass.unknown.count, 4);
  assert.equal(byClass.unknown.usdc, "8.100");
  assert.ok(
    byClass.unknown.operations.some((item) => item.operationId === "frantic-42-revenue-2026-06-25"),
  );
  assert.equal(byClass.owner.usdc, "0.000");
  assert.equal(byClass.sponsored.usdc, "0.000");
  assert.equal(report.table.computedUsdc, "8.105");
  assert.equal(report.table.differenceUsdc, "0.000");
});

test("a record with a prohibited inference is rejected", () => {
  const records = settlementRecords();
  const frantic = records.find((item) => item.recordId === "frantic-42-revenue-2026-06-25");
  frantic.scope.providerId = "coinbase_cdp_facilitator";
  const report = reconcileRecords(records, catalog);
  assert.equal(report.ok, false);
  assert.equal(report.table, null);
  assert.ok(report.rejected.length >= 1);
  const codes = report.rejected.flatMap((item) => item.errors.map((error) => error.code));
  assert.ok(codes.includes("collapsed_provider_scope"), JSON.stringify(codes));
});

test("classifyRecord rejects organic label on a controlled source", () => {
  const record = structuredClone(loadJson(join(settlementFixtureDir(), "early-x402-revenue.json")));
  record.sourceKind = "operator_validation";
  record.producer.providerId = "operator_controlled";
  record.scope.providerId = "operator_controlled";
  record.prohibitedInferences = [
    "cross_source_join_without_exact_key",
    "sum_across_authority_classes",
    "organic_label_for_controlled_or_incentivized_traffic",
    "collapsed_provider_scope",
    "local_observation_is_provider_billing",
  ];
  record.labels = { acquisition: "organic" };
  const result = classifyRecord(record, catalog);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((item) => item.code === "organic_label_for_controlled_or_incentivized_traffic"),
  );
});

test("CLI emits the golden table", () => {
  const cli = spawnSync(process.execPath, [join(here, "reconcile.mjs"), "--pretty"], {
    encoding: "utf8",
  });
  assert.equal(cli.status, 0, cli.stderr);
  const payload = JSON.parse(cli.stdout);
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.table, golden);
  assert.match(payload.markdown, /independent/);
  assert.match(payload.markdown, /8\.005/);
  assert.match(payload.markdown, /difference 0\.000/);
});
