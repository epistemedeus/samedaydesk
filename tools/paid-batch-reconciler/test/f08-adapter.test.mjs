import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadF08Module, resolveF08Root } from "../lib/adapters.mjs";
import { runBatch } from "../lib/ledger.mjs";
import { callerBudget, loadReservedPayment } from "./helpers.mjs";
import { F08_PIN_SHA } from "../lib/pins.mjs";

describe("consumed PR52 runner (required, not skipped)", { timeout: 120_000 }, () => {
  it("imports runPaidOffer from pin aeef964 and maps a mixed batch", async () => {
    const root = resolveF08Root();
    assert.ok(root, "F08_PIN_ROOT / PR52 worktree is required");
    const mod = await loadF08Module(root);
    assert.equal(typeof mod.runPaidOffer, "function");
    assert.equal(typeof mod.classifyFunding, "function");
    const files = callerBudget();
    const f08 = await mod.runPaidOffer({
      jobId: "vendor-budget-impact",
      inputs: files,
      fundingIntent: "reserved-fixture",
      payment: loadReservedPayment(),
    });
    assert.equal(f08.sold, false);

    const intentOnly = mod.classifyFunding({ fundingIntent: "reserved-fixture" });
    assert.equal(intentOnly.fundingState, "rejected");
    assert.equal(intentOnly.code, "reserved-fixture-requires-payment");

    const ledger = await runBatch(
      {
        items: [
          {
            id: "f08-ok",
            engineId: "vendor-budget-impact",
            files,
            funding: "reserved-fixture",
            payment: loadReservedPayment(),
          },
          {
            id: "f08-missing",
            engineId: "vendor-budget-impact",
            files: { before: files.before },
            funding: "reserved-fixture",
            payment: loadReservedPayment(),
          },
        ],
      },
      { f08Root: root },
    );
    assert.equal(ledger.sold, false);
    assert.equal(ledger.status, "partial");
    assert.equal(ledger.runner, "paid-useful-jobs");
    assert.equal(ledger.runnerPin, F08_PIN_SHA);
    assert.equal(ledger.items[0].runner, "paid-useful-jobs");
    assert.equal(ledger.items[0].sold, false);
    assert.equal(ledger.items[1].outcome, "rejected");
    assert.equal(F08_PIN_SHA, "aeef964fa188443078958d9d6d393afae1d542ee");
  });
});
