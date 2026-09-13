import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CLI, OWNED, REPO_ROOT, callerBudget, loadReservedPayment } from "./helpers.mjs";
import { runBatch } from "../lib/ledger.mjs";
import { createPaidBatchServer, listenLocal } from "../lib/http.mjs";
import { CURRENT_RUNTIME_PIN } from "../lib/pins.mjs";
import { isTermsVersionHash } from "../lib/terms.mjs";

function cliRun(requestPath) {
  return spawnSync(process.execPath, [CLI, "run", requestPath], {
    encoding: "utf8",
    cwd: REPO_ROOT,
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
    env: process.env,
  });
}

describe("batch identity: duplicate/traversing refused; mixed charges stay distinct", { timeout: 120_000 }, () => {
  it("CLI rejects duplicate item ids without selling anything", () => {
    const r = cliRun(join(OWNED, "fixtures/batches/duplicate-ids.json"));
    assert.equal(r.status, 2, r.stderr + r.stdout);
    const ledger = JSON.parse(r.stdout);
    assert.equal(ledger.sold, false);
    assert.equal(ledger.status, "rejected");
    assert.equal(ledger.code, "duplicate-item");
    assert.equal(ledger.items.length, 0);
    assert.equal(ledger.anySold, false);
  });

  it("CLI rejects traversing item ids", () => {
    const r = cliRun(join(OWNED, "fixtures/batches/traversing-id.json"));
    assert.equal(r.status, 2, r.stderr + r.stdout);
    const ledger = JSON.parse(r.stdout);
    assert.equal(ledger.sold, false);
    assert.equal(ledger.code, "traversing-item");
    assert.equal(ledger.items.length, 0);
  });

  it("CLI rejects traversing file paths", () => {
    const r = cliRun(join(OWNED, "fixtures/batches/traversing-path.json"));
    assert.equal(r.status, 2, r.stderr + r.stdout);
    const ledger = JSON.parse(r.stdout);
    assert.equal(ledger.sold, false);
    assert.equal(ledger.code, "traversing-item");
    assert.equal(ledger.items.length, 0);
  });

  it("CLI rejects encoded traversal item ids", () => {
    const dir = mkdtempSync(join(tmpdir(), "paid-batch-enc-"));
    const request = join(dir, "request.json");
    writeFileSync(
      request,
      JSON.stringify({
        items: [
          {
            id: "%2e%2e%2fescape",
            engineId: "vendor-budget-impact",
            files: callerBudget(),
            funding: "reserved-fixture",
            payment: loadReservedPayment(),
          },
        ],
      }),
    );
    const r = spawnSync(process.execPath, [CLI, "run", request], {
      encoding: "utf8",
      cwd: REPO_ROOT,
      timeout: 30_000,
      env: process.env,
    });
    assert.equal(r.status, 2, r.stderr + r.stdout);
    const ledger = JSON.parse(r.stdout);
    assert.equal(ledger.code, "traversing-item");
    assert.equal(ledger.sold, false);
  });

  it("CLI refuses synthesized reserved-fixture without a payment object", () => {
    const r = cliRun(join(OWNED, "fixtures/batches/reserved-fixture-without-payment.json"));
    assert.equal(r.status, 2, r.stderr + r.stdout);
    const ledger = JSON.parse(r.stdout);
    assert.equal(ledger.sold, false);
    assert.equal(ledger.status, "rejected");
    assert.equal(ledger.items.length, 1);
    assert.equal(ledger.items[0].code, "reserved-fixture-requires-payment");
    assert.equal(ledger.items[0].sold, false);
    assert.equal(ledger.items[0].fundingState, "rejected");
  });

  it("CLI refuses useful-jobs as a fallback runner", () => {
    const r = cliRun(join(OWNED, "fixtures/batches/fallback-runner.json"));
    assert.equal(r.status, 2, r.stderr + r.stdout);
    const ledger = JSON.parse(r.stdout);
    assert.equal(ledger.code, "fallback-runner-refused");
    assert.equal(ledger.sold, false);
    assert.equal(ledger.items.length, 0);
  });

  it("CLI mixed completed items keep distinct item and charge identities", () => {
    const r = cliRun(join(OWNED, "fixtures/batches/mixed-two-ok.json"));
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const ledger = JSON.parse(r.stdout);
    assert.equal(ledger.status, "completed");
    assert.equal(ledger.sold, false);
    assert.equal(ledger.runner, "paid-useful-jobs");
    assert.equal(ledger.runnerPin, CURRENT_RUNTIME_PIN);
    assert.equal(ledger.items.length, 2);
    assert.equal(ledger.charges.length, 2);
    const a = ledger.items.find((i) => i.id === "charge-a");
    const b = ledger.items.find((i) => i.id === "charge-b");
    assert.equal(a.outcome, "completed");
    assert.equal(b.outcome, "completed");
    assert.equal(a.chargeId, `${ledger.batchId}:charge-a`);
    assert.equal(b.chargeId, `${ledger.batchId}:charge-b`);
    assert.notEqual(a.chargeId, b.chargeId);
    assert.equal(a.price.itemId, `${ledger.batchId}:charge-a`);
    assert.equal(b.price.itemId, `${ledger.batchId}:charge-b`);
    assert.equal(a.price.amountUsdc, "0.02");
    assert.equal(b.price.amountUsdc, "0.02");
    assert.equal(ledger.charges[0].itemId, "charge-a");
    assert.equal(ledger.charges[1].itemId, "charge-b");
    assert.ok(isTermsVersionHash(ledger.termsVersion));
  });

  it("HTTP POST /batch rejects duplicates and accepts a mixed ledger", async () => {
    const { server } = createPaidBatchServer({ baseDir: REPO_ROOT });
    const info = await listenLocal(server, { host: "127.0.0.1", port: 0 });
    try {
      const dup = await fetch(`${info.url}/batch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: [
            {
              id: "same",
              engineId: "vendor-budget-impact",
              files: callerBudget(),
              funding: "reserved-fixture",
              payment: loadReservedPayment(),
            },
            {
              id: "same",
              engineId: "vendor-budget-impact",
              files: callerBudget(),
              funding: "reserved-fixture",
              payment: loadReservedPayment(),
            },
          ],
        }),
      });
      assert.equal(dup.status, 400);
      const dupBody = await dup.json();
      assert.equal(dupBody.code, "duplicate-item");
      assert.equal(dupBody.sold, false);

      const trav = await fetch(`${info.url}/batch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: [
            {
              id: "../escape",
              engineId: "vendor-budget-impact",
              files: callerBudget(),
              funding: "reserved-fixture",
              payment: loadReservedPayment(),
            },
          ],
        }),
      });
      assert.equal(trav.status, 400);
      const travBody = await trav.json();
      assert.equal(travBody.code, "traversing-item");

      const mixed = await fetch(`${info.url}/batch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: [
            {
              id: "http-ok",
              engineId: "vendor-budget-impact",
              files: callerBudget(),
              funding: "reserved-fixture",
              payment: loadReservedPayment(),
            },
            {
              id: "http-missing",
              engineId: "vendor-budget-impact",
              files: { before: callerBudget().before },
              funding: "reserved-fixture",
              payment: loadReservedPayment(),
            },
          ],
        }),
      });
      assert.equal(mixed.status, 200);
      const body = await mixed.json();
      assert.equal(body.status, "partial");
      assert.equal(body.sold, false);
      assert.equal(body.items[0].chargeId, `${body.batchId}:http-ok`);
      assert.equal(body.items[1].chargeId, `${body.batchId}:http-missing`);
      assert.notEqual(body.items[0].chargeId, body.items[1].chargeId);
      assert.equal(body.items[0].outcome, "completed");
      assert.equal(body.items[1].outcome, "rejected");
      assert.equal(body.items[1].code, "missing-required-inputs");
    } finally {
      server.close();
    }
  });

  it("inline JSON SAMPLE cannot be a reserved-fixture sale", async () => {
    const sample = JSON.stringify({
      label: "SAMPLE",
      sampleLabel: "SAMPLE",
      rows: [{ field: "x", value: 1, unit: "USD/1M-tokens" }],
    });
    const ledger = await runBatch({
      items: [
        {
          id: "inline-sample",
          engineId: "vendor-budget-impact",
          files: { before: sample, after: callerBudget().after },
          funding: "reserved-fixture",
          payment: loadReservedPayment(),
        },
      ],
    });
    assert.equal(ledger.sold, false);
    assert.equal(ledger.items[0].code, "sample-not-a-sale");
    assert.equal(ledger.items[0].sold, false);
  });

  it("does not force ledger termsVersion equal to the runner receipt hash", async () => {
    const root = resolveF08Root();
    const mod = await loadF08Module(root);
    const files = callerBudget();
    const offer = await mod.runPaidOffer({
      jobId: "vendor-budget-impact",
      inputs: files,
      fundingIntent: "reserved-fixture",
      payment: loadReservedPayment(),
    });
    const ledger = await runBatch({
      items: [
        {
          id: "terms-a",
          engineId: "vendor-budget-impact",
          files,
          funding: "reserved-fixture",
          payment: loadReservedPayment(),
        },
        {
          id: "terms-b",
          engineId: "vendor-budget-impact",
          files,
          funding: "reserved-fixture",
          payment: loadReservedPayment(),
        },
      ],
    });
    assert.ok(isTermsVersionHash(ledger.termsVersion));
    const receiptHash = offer?.receipt?.termsVersion || offer?.termsVersion || null;
    if (receiptHash) {
      assert.notEqual(ledger.termsVersion, receiptHash);
    }
    const one = await runBatch({
      items: [
        {
          id: "terms-a",
          engineId: "vendor-budget-impact",
          files,
          funding: "reserved-fixture",
          payment: loadReservedPayment(),
        },
      ],
    });
    assert.notEqual(ledger.termsVersion, one.termsVersion);
  });
});
