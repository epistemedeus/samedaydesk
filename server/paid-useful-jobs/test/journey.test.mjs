import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { REPO_ROOT } from "../lib/pins.mjs";

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
});
