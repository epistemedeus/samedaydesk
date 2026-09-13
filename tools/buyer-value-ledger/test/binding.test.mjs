import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import { EARLY_X402_OPERATION_ID, ERROR_CODES } from "../lib/pins.mjs";
import { ensureUsefulJobsKit, serveBytes } from "../lib/kit.mjs";
import { hashRequest, sha256Bytes } from "../lib/hash-terms.mjs";
import { joinSettlement } from "../lib/settlements.mjs";
import { runLabelledJob } from "../lib/run.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = join(ROOT, "bin/value.mjs");
const INVALID_BEFORE = join(ROOT, "fixtures/caller/invalid/before.json");
const INVALID_AFTER = join(ROOT, "fixtures/caller/invalid/after.json");
const BIND_FIXTURE = join(ROOT, "fixtures/settlement-bind/vendor-budget-impact.json");

function run(args, cwd = ROOT) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: "utf8",
    cwd,
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function spawnAsync(args, cwd = ROOT) {
  return new Promise((resolveP, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`cli timeout stderr=${stderr}`));
    }, 30_000);
    child.stdout.on("data", (c) => {
      stdout += c.toString("utf8");
    });
    child.stderr.on("data", (c) => {
      stderr += c.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      resolveP({ status, stdout, stderr });
    });
  });
}

function parse(result) {
  assert.ok(String(result.stdout || "").trim(), `empty stdout stderr=${result.stderr}`);
  return JSON.parse(result.stdout);
}

function serveWrongArchive() {
  return serveBytes(Buffer.from("not-the-pinned-useful-jobs-archive"));
}

describe("W5-D13 proof: wrong-source, unrelated payment, failed result", () => {
  test("CLI refuses a wrong archive file after a warm pin cache", () => {
    const work = mkdtempSync(join(tmpdir(), "bvl-cache-"));
    const goodOut = join(work, "good");
    mkdirSync(goodOut);
    const warm = run([
      "run",
      "vendor-budget-impact",
      "--buyer-class",
      "owner-qa",
      "--example",
      "--out-dir",
      goodOut,
    ]);
    assert.equal(warm.status, 0, warm.stderr + warm.stdout);
    const warmJson = parse(warm);
    assert.equal(warmJson.ok, true);
    assert.equal(warmJson.usefulPaidWork, false);

    const wrong = join(work, "wrong.tar.gz");
    writeFileSync(wrong, "not-the-pinned-archive");
    const badOut = join(work, "bad");
    mkdirSync(badOut);
    const cli = run([
      "run",
      "vendor-budget-impact",
      "--buyer-class",
      "owner-qa",
      "--example",
      "--archive-file",
      wrong,
      "--out-dir",
      badOut,
    ]);
    assert.notEqual(cli.status, 0, cli.stderr + cli.stdout);
    const json = parse(cli);
    assert.equal(json.ok, false);
    assert.equal(json.code, "runner-override-refused");
    assert.equal(json.usefulPaidWork, false);
  });

  test("CLI HTTP wrong-source archive cannot become useful paid work", async () => {
    ensureUsefulJobsKit();
    const served = await serveWrongArchive();
    try {
      const work = mkdtempSync(join(tmpdir(), "bvl-http-wrong-"));
      const outDir = join(work, "out");
      mkdirSync(outDir);
      const cli = await spawnAsync([
        "run",
        "vendor-budget-impact",
        "--buyer-class",
        "owner-qa",
        "--example",
        "--archive-origin",
        served.origin,
        "--out-dir",
        outDir,
      ]);
      assert.notEqual(cli.status, 0, cli.stderr + cli.stdout);
      const json = parse(cli);
      assert.equal(json.ok, false);
      assert.equal(json.code, "runner-override-refused");
      assert.equal(json.usefulPaidWork, false);
    } finally {
      await served.stop();
    }
  });

  test("library wrong buffer after cache still refuses instead of reusing the pin kit", async () => {
    const result = await runLabelledJob({
      jobId: "vendor-budget-impact",
      buyerClass: "owner-qa",
      example: true,
      kitOptions: { buffer: Buffer.from("wrong-source") },
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "runner-override-refused");
    assert.equal(result.usefulPaidWork, false);
  });

  test("CLI unrelated early-x402 operationId is not this job's paid work", () => {
    const work = mkdtempSync(join(tmpdir(), "bvl-pay-"));
    const outDir = join(work, "out");
    mkdirSync(outDir);
    const cli = run([
      "run",
      "vendor-budget-impact",
      "--buyer-class",
      "owner-qa",
      "--example",
      "--operation-id",
      EARLY_X402_OPERATION_ID,
      "--out-dir",
      outDir,
    ]);
    assert.equal(cli.status, 0, cli.stderr + cli.stdout);
    const json = parse(cli);
    assert.equal(json.ok, true);
    assert.equal(json.usefulPaidWork, false);
    assert.equal(json.row.settlementJoin.operationIdFound, true);
    assert.equal(json.row.settlementJoin.boundToThisJob, false);
    assert.equal(json.row.settlementJoin.thisJobPayment, false);
    assert.equal(json.row.settlementJoin.matched, false);
    assert.equal(json.row.jobRevenueUsdc, null);
    assert.equal(json.row.paidWorkBlockers.includes("unrelated_or_unbound_payment"), true);
  });

  test("CLI valid analysis refusal is not a crash and is not useful paid work", () => {
    const work = mkdtempSync(join(tmpdir(), "bvl-refuse-"));
    const outDir = join(work, "out");
    mkdirSync(outDir);
    const cli = run([
      "run",
      "vendor-budget-impact",
      "--buyer-class",
      "owner-qa",
      "--before",
      INVALID_BEFORE,
      "--after",
      INVALID_AFTER,
      "--operation-id",
      EARLY_X402_OPERATION_ID,
      "--out-dir",
      outDir,
    ]);
    assert.equal(cli.status, 0, cli.stderr + cli.stdout);
    const json = parse(cli);
    assert.equal(json.ok, true);
    assert.equal(json.refused, true);
    assert.equal(json.outcomeKind, "analysis_refusal");
    assert.equal(json.usefulPaidWork, false);
    assert.equal(json.row.settlementJoin.boundToThisJob, false);
    assert.ok(json.row.outputs.every((item) => item.sha256));
  });

  test("CLI engine crash on a non-directory out-dir is not a valid refusal or paid work", () => {
    const work = mkdtempSync(join(tmpdir(), "bvl-crash-"));
    const outFile = join(work, "out-is-file");
    writeFileSync(outFile, "not-a-directory");
    const cli = run([
      "run",
      "vendor-budget-impact",
      "--buyer-class",
      "owner-qa",
      "--example",
      "--operation-id",
      EARLY_X402_OPERATION_ID,
      "--out-dir",
      outFile,
    ]);
    assert.notEqual(cli.status, 0, cli.stderr + cli.stdout);
    const json = parse(cli);
    assert.equal(json.ok, false);
    assert.equal(json.refused, false);
    assert.equal(json.outcomeKind, "transport_failure");
    assert.equal(json.code, ERROR_CODES.ENGINE_SPAWN_FAILED);
    assert.equal(json.usefulPaidWork, false);
    assert.equal(json.usefulDelivery, false);
  });

  test("failed spawn with leftover files and unrelated payment is not useful paid work", async () => {
    const work = mkdtempSync(join(tmpdir(), "bvl-stale-"));
    writeFileSync(join(work, "budget-impact.json"), '{"stale":true}');
    writeFileSync(join(work, "budget-impact.md"), "stale leftover");
    const result = await runLabelledJob(
      {
        jobId: "vendor-budget-impact",
        buyerClass: "owner-qa",
        example: true,
        outDir: work,
        operationId: EARLY_X402_OPERATION_ID,
      },
      {
        engine: {
          async run() {
            return {
              status: 1,
              stdout: "",
              stderr: "crash",
              json: null,
              error: new Error("engine crash"),
              kitSource: "local-file",
              kitVerified: true,
              durationMs: 2,
              startedAt: new Date().toISOString(),
              endedAt: new Date().toISOString(),
            };
          },
        },
      },
    );
    assert.equal(result.ok, false);
    assert.equal(result.refused, false);
    assert.equal(result.outcomeKind, "engine_failure");
    assert.equal(result.row.producedThisRun, false);
    assert.equal(result.row.usableOutput, false);
    assert.equal(result.usefulPaidWork, false);
    assert.equal(result.row.settlementJoin.boundToThisJob, false);
    assert.equal(result.row.paidWorkBlockers.includes("failed_result"), true);
  });

  test("input digest is taken before spawn, not after a mutated caller file", async () => {
    const work = mkdtempSync(join(tmpdir(), "bvl-hash-"));
    mkdirSync(join(work, "out"));
    const before = join(work, "before.json");
    const after = join(work, "after.json");
    const preBefore = '{"rows":[{"id":"a","price":1}]}';
    const preAfter = '{"rows":[{"id":"a","price":2}]}';
    writeFileSync(before, preBefore);
    writeFileSync(after, preAfter);
    const result = await runLabelledJob(
      {
        jobId: "vendor-budget-impact",
        buyerClass: "owner-qa",
        files: { before, after },
        outDir: join(work, "out"),
      },
      {
        engine: {
          async run() {
            writeFileSync(before, '{"rows":[{"id":"mutated","price":99}]}');
            return {
              status: 0,
              stdout: JSON.stringify({ ok: true, status: "ok", digest: "abc" }),
              stderr: "",
              json: { ok: true, status: "ok", digest: "abc" },
              kitSource: "local-file",
              kitVerified: true,
              durationMs: 1,
              startedAt: new Date().toISOString(),
              endedAt: new Date().toISOString(),
            };
          },
        },
      },
    );
    const preBeforeBuf = Buffer.from(preBefore);
    const preAfterBuf = Buffer.from(preAfter);
    assert.notEqual(sha256Bytes(readFileSync(before)), sha256Bytes(preBeforeBuf));
    assert.equal(
      result.row.requestHash,
      hashRequest({
        jobId: "vendor-budget-impact",
        buyerClass: "owner-qa",
        example: false,
        inputs: {
          before: { path: before, sha256: sha256Bytes(preBeforeBuf), bytes: preBeforeBuf.length },
          after: { path: after, sha256: sha256Bytes(preAfterBuf), bytes: preAfterBuf.length },
        },
      }),
    );
  });

  test("bound overlay settlement still does not force terms hash equality or paid work", () => {
    const overlay = JSON.parse(readFileSync(BIND_FIXTURE, "utf8"));
    const hit = joinSettlement({
      operationId: overlay.settlement.operationId,
      jobId: "vendor-budget-impact",
      outcomeKind: "analysis_success",
      records: [{ record: overlay, validation: { ok: true } }],
    });
    assert.equal(hit.boundToThisJob, true);
    assert.equal(hit.thisJobPayment, true);
    assert.equal(hit.jobRevenueUsdc, null);
    const requestHash = hashRequest({
      jobId: "vendor-budget-impact",
      buyerClass: "unknown",
      example: true,
      inputs: { example: true },
    });
    const overlayHash = hashRequest(overlay);
    assert.notEqual(requestHash, overlayHash);
  });
});
