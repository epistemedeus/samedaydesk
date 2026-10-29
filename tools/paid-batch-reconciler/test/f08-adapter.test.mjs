import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";
import { f08IndexPath, loadF08Module, mapF08ResultToItem } from "../lib/adapters.mjs";
import { runBatch } from "../lib/ledger.mjs";
import { callerBudget, loadReservedPayment } from "./helpers.mjs";
import { F08_PIN_SHA } from "../lib/pins.mjs";

const defaultWorktree = "/tmp/sds-f08-pin";

describe("optional F08 adapter (absent on main)", { timeout: 120_000 }, () => {
  it("consumes pinned F08 runPaidOffer when F08_PIN_ROOT is present", async (t) => {
    const root = process.env.F08_PIN_ROOT || (existsSync(f08IndexPath(defaultWorktree)) ? defaultWorktree : null);
    if (!root) {
      t.skip("F08 not on main; set F08_PIN_ROOT to the bae3e7cd worktree for this optional binding");
      return;
    }
    const mod = await loadF08Module(root);
    assert.ok(mod?.runPaidOffer, "F08 public export runPaidOffer");
    const files = callerBudget();
    const f08 = await mod.runPaidOffer({
      jobId: "vendor-budget-impact",
      inputs: files,
      fundingIntent: "reserved-fixture",
      payment: loadReservedPayment(),
    });
    assert.equal(f08.sold, false);
    const mapped = mapF08ResultToItem("vendor-budget-impact", f08);
    assert.equal(mapped.sold, false);
    assert.equal(mapped.outcome, f08.ok ? "completed" : "rejected");

    const ledger = await runBatch(
      {
        runner: "f08",
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
      { f08Root: root, useF08: true },
    );
    assert.equal(ledger.sold, false);
    assert.equal(ledger.status, "partial");
    assert.equal(ledger.items[0].runner, "f08-pin");
    assert.equal(ledger.items[0].sold, false);
    assert.equal(ledger.items[1].outcome, "rejected");
    assert.equal(F08_PIN_SHA, "bae3e7cd5034b21019fb272a99d88db964b831ee");
  });
});
