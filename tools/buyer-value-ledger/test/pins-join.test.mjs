import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import { EARLY_X402_OPERATION_ID, USEFUL_JOBS_ARCHIVE_BYTES, USEFUL_JOBS_ARCHIVE_PATH, USEFUL_JOBS_ARCHIVE_SHA256 } from "../lib/pins.mjs";
import { hashRequest } from "../lib/hash-terms.mjs";
import { createSettlementAdapter, joinSettlement } from "../lib/settlements.mjs";
import { loadPublicCatalog } from "../lib/engine.mjs";
import { verifyArchiveBuffer } from "../lib/kit.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = join(ROOT, "bin/value.mjs");
const REPO = resolve(ROOT, "../..");

function run(args) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: "utf8",
    cwd: ROOT,
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

describe("pins, hash terms, and exact settlement join", () => {
  test("committed useful-jobs archive matches the public pin", () => {
    const buf = readFileSync(USEFUL_JOBS_ARCHIVE_PATH);
    const pin = verifyArchiveBuffer(buf);
    assert.equal(pin.bytes, USEFUL_JOBS_ARCHIVE_BYTES);
    assert.equal(pin.sha256, USEFUL_JOBS_ARCHIVE_SHA256);
    const catalog = loadPublicCatalog();
    assert.equal(
      catalog.jobs.some((job) => job.id === "vendor-budget-impact"),
      true,
    );
  });

  test("I01/S275 hashRequest is order-insensitive stable SHA-256", () => {
    const a = hashRequest({ jobId: "vendor-budget-impact", buyerClass: "owner-qa", example: true });
    const b = hashRequest({ example: true, buyerClass: "owner-qa", jobId: "vendor-budget-impact" });
    assert.equal(a, b);
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.notEqual(
      a,
      hashRequest({ jobId: "vendor-budget-impact", buyerClass: "unknown", example: true }),
    );
  });

  test("settlement join requires exact operationId; else unknown", async () => {
    const { records } = await createSettlementAdapter().load();
    assert.equal(records.length >= 1, true);
    assert.equal(records.every((item) => item.validation.ok), true);

    const none = joinSettlement({ records });
    assert.equal(none.matched, false);
    assert.equal(none.unknown, true);

    const miss = joinSettlement({ operationId: "not-a-real-operation", records });
    assert.equal(miss.matched, false);
    assert.equal(miss.unknown, true);

    const hit = joinSettlement({ operationId: EARLY_X402_OPERATION_ID, jobId: "vendor-budget-impact", records });
    assert.equal(hit.operationIdFound, true);
    assert.equal(hit.matched, false);
    assert.equal(hit.boundToThisJob, false);
    assert.equal(hit.thisJobPayment, false);
    assert.equal(hit.amountUsdc, "0.040");
    assert.equal(hit.jobRevenueUsdc, null);
    assert.equal(hit.independentDemand, false);
  });

  test("CLI join with exact early-x402 operationId still has null job revenue", () => {
    const work = mkdtempSync(join(tmpdir(), "bvl-join-"));
    const outDir = join(work, "out");
    mkdirSync(outDir);
    const result = run([
      "run",
      "vendor-budget-impact",
      "--buyer-class",
      "unknown",
      "--example",
      "--operation-id",
      EARLY_X402_OPERATION_ID,
      "--out-dir",
      outDir,
    ]);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const json = JSON.parse(result.stdout);
    assert.equal(json.row.settlementJoin.operationIdFound, true);
    assert.equal(json.row.settlementJoin.operationId, EARLY_X402_OPERATION_ID);
    assert.equal(json.row.settlementJoin.boundToThisJob, false);
    assert.equal(json.row.settlementJoin.thisJobPayment, false);
    assert.equal(json.row.settlementJoin.matched, false);
    assert.equal(json.row.jobRevenueUsdc, null);
    assert.equal(json.row.settlementJoin.jobRevenueUsdc, null);
    assert.equal(json.usefulPaidWork, false);
  });
});
