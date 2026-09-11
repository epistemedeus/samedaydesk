import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { REPO_ROOT } from "../lib/pins.mjs";
import { runPaidOffer } from "../lib/wrapper.mjs";
import { callerBudget, callerRepeatWithRoot, loadReservedPayment } from "./helpers.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "../bin/cli.mjs");
const before = join(here, "../fixtures/caller/vendor-budget-impact/before.json");
const after = join(here, "../fixtures/caller/vendor-budget-impact/after.json");
const payment = join(here, "../fixtures/payment/reserved-fixture.json");

describe("literal user journey", { timeout: 120_000 }, () => {
  it("in-repo engines → supplied input → wrapper → usable output + receipt", () => {
    const outDir = mkdtempSync(join(tmpdir(), "puj-journey-"));
    const r = spawnSync(
      process.execPath,
      [
        cli,
        "run",
        "vendor-budget-impact",
        "--before",
        before,
        "--after",
        after,
        "--funding",
        "reserved-fixture",
        "--payment",
        payment,
        "--out-dir",
        outDir,
      ],
      { encoding: "utf8", cwd: REPO_ROOT, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 },
    );
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const body = JSON.parse(r.stdout);
    assert.equal(body.ok, true);
    assert.equal(body.sold, false);
    assert.equal(body.sample, false);
    assert.equal(body.fundingState, "reserved-fixture");
    assert.equal(existsSync(join(outDir, "budget-impact.json")), true);
    assert.equal(existsSync(join(outDir, "budget-impact.md")), true);
    const receipt = JSON.parse(readFileSync(join(outDir, "receipt.json"), "utf8"));
    assert.equal(receipt.jobId, "vendor-budget-impact");
    assert.equal(receipt.sample, false);
    assert.equal(receipt.sold, false);
    assert.equal(receipt.payment.liveSettleAttempted, false);
    assert.equal(receipt.payment.liveSettleAllowed, false);
    assert.match(receipt.inputsDigest, /^[0-9a-f]{64}$/);
    assert.match(receipt.outputsDigest, /^[0-9a-f]{64}$/);
    assert.equal(receipt.purchaseAuthority, false);
  });

  it("unknown job id is a structured rejection, not an uncaught throw", () => {
    const r = spawnSync(
      process.execPath,
      [cli, "run", "not-a-real-job"],
      { encoding: "utf8", cwd: REPO_ROOT, timeout: 30_000, maxBuffer: 8 * 1024 * 1024 },
    );
    assert.equal(r.status, 2, r.stderr + r.stdout);
    assert.equal(r.signal, null);
    const body = JSON.parse(r.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.sold, false);
    assert.equal(body.fundingState, "rejected");
    assert.equal(body.code, "unknown-job");
    assert.match(body.error, /unknown job/i);
  });

  it("--example with reserved-fixture payment is not a sale", () => {
    const r = spawnSync(
      process.execPath,
      [
        cli,
        "run",
        "vendor-budget-impact",
        "--example",
        "--funding",
        "reserved-fixture",
        "--payment",
        payment,
      ],
      { encoding: "utf8", cwd: REPO_ROOT, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 },
    );
    assert.notEqual(r.status, 0, r.stderr + r.stdout);
    const body = JSON.parse(r.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.sold, false);
    assert.equal(body.sample, true);
    assert.equal(body.fundingState, "rejected");
    assert.equal(body.code, "sample-not-a-sale");
  });

  it("CLI repeat-job-record --input-root directory exits 0 with verified identity", () => {
    const files = callerRepeatWithRoot();
    const outDir = mkdtempSync(join(tmpdir(), "puj-repeat-root-"));
    const r = spawnSync(
      process.execPath,
      [
        cli,
        "run",
        "repeat-job-record",
        "--next-run",
        files["next-run"],
        "--input-root",
        files["input-root"],
        "--out-dir",
        outDir,
      ],
      { encoding: "utf8", cwd: REPO_ROOT, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 },
    );
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const body = JSON.parse(r.stdout);
    assert.equal(body.ok, true);
    assert.equal(body.sold, false);
    assert.equal(body.engine.identityVerified, true);
    assert.equal(existsSync(join(outDir, "repeat-job.json")), true);
    assert.equal(existsSync(join(outDir, "repeat-job.md")), true);
    const receipt = JSON.parse(readFileSync(join(outDir, "receipt.json"), "utf8"));
    const rootEntry = receipt.inputs.find((i) => i.name === "input-root");
    assert.equal(rootEntry.kind, "directory");
    assert.equal(rootEntry.sha256, null);
    assert.equal(receipt.engineResult.identityVerified, true);
    assert.match(receipt.engine.archiveSha256, /^[0-9a-f]{64}$/);
  });

  it("CLI and library classify reserved-fixture without payment the same", async () => {
    const files = callerBudget();
    const cliResult = spawnSync(
      process.execPath,
      [
        cli,
        "run",
        "vendor-budget-impact",
        "--before",
        files.before,
        "--after",
        files.after,
        "--funding",
        "reserved-fixture",
      ],
      { encoding: "utf8", cwd: REPO_ROOT, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 },
    );
    assert.equal(cliResult.status, 2, cliResult.stderr + cliResult.stdout);
    const cliBody = JSON.parse(cliResult.stdout);
    const lib = await runPaidOffer({
      jobId: "vendor-budget-impact",
      inputs: files,
      fundingIntent: "reserved-fixture",
    });
    assert.equal(cliBody.ok, false);
    assert.equal(lib.ok, false);
    assert.equal(cliBody.sold, false);
    assert.equal(lib.sold, false);
    assert.equal(cliBody.fundingState, lib.fundingState);
    assert.equal(cliBody.fundingState, "rejected");
    assert.equal(cliBody.code, lib.code);
    assert.equal(cliBody.code, "reserved-fixture-requires-payment");
    assert.equal(cliBody.receipt?.payment?.fixture ?? false, false);
    assert.equal(lib.receipt?.payment?.fixture ?? false, false);
  });

  it("CLI and library reserved-fixture with fixture payment match", async () => {
    const files = callerBudget();
    const cliResult = spawnSync(
      process.execPath,
      [
        cli,
        "run",
        "vendor-budget-impact",
        "--before",
        files.before,
        "--after",
        files.after,
        "--funding",
        "reserved-fixture",
        "--payment",
        payment,
      ],
      { encoding: "utf8", cwd: REPO_ROOT, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 },
    );
    assert.equal(cliResult.status, 0, cliResult.stderr + cliResult.stdout);
    const cliBody = JSON.parse(cliResult.stdout);
    const lib = await runPaidOffer({
      jobId: "vendor-budget-impact",
      inputs: files,
      fundingIntent: "reserved-fixture",
      payment: loadReservedPayment(),
    });
    assert.equal(cliBody.ok, true);
    assert.equal(lib.ok, true);
    assert.equal(cliBody.fundingState, "reserved-fixture");
    assert.equal(lib.fundingState, "reserved-fixture");
    assert.equal(cliBody.receipt.payment.fixture, true);
    assert.equal(lib.receipt.payment.fixture, true);
    assert.equal(cliBody.receipt.engine.archiveSha256, lib.receipt.engine.archiveSha256);
  });
});
