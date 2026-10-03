import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CLI, OWNED, REPO_ROOT, journeyRequest } from "./helpers.mjs";
import { runBatch } from "../lib/ledger.mjs";
import { FIXTURE_PRICE_USDC } from "../lib/pins.mjs";
import { isTermsVersionHash } from "../lib/terms.mjs";

describe("caller journey: two reserved-fixture vendor-budget items", { timeout: 120_000 }, () => {
  it("CLI: one completed, one rejected, batch partial, sold false, fixture prices", () => {
    const outDir = mkdtempSync(join(tmpdir(), "paid-batch-journey-"));
    const request = join(OWNED, "fixtures/batches/partial-vendor-budget.json");
    const r = spawnSync(process.execPath, [CLI, "run", request, "--out-dir", outDir], {
      encoding: "utf8",
      cwd: REPO_ROOT,
      timeout: 120_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const ledger = JSON.parse(r.stdout);
    assert.equal(ledger.sold, false);
    assert.equal(ledger.anySold, false);
    assert.equal(ledger.status, "partial");
    assert.equal(ledger.liveSettlement, "out-of-scope");
    assert.equal(ledger.purchaseAuthority, false);
    assert.equal(ledger.liveCatalogWritten, false);
    assert.equal(ledger.counts.completed, 1);
    assert.equal(ledger.counts.rejected, 1);
    assert.equal(ledger.items.length, 2);
    assert.ok(isTermsVersionHash(ledger.termsVersion));

    const ok = ledger.items.find((i) => i.id === "ok-caller-pair");
    const missing = ledger.items.find((i) => i.id === "missing-after");
    assert.equal(ok.outcome, "completed");
    assert.equal(ok.fundingState, "reserved-fixture");
    assert.equal(ok.sold, false);
    assert.equal(ok.price.kind, "fixture");
    assert.equal(ok.price.live, false);
    assert.equal(ok.price.amountUsdc, FIXTURE_PRICE_USDC);
    assert.equal(ok.price.publishedToLiveCatalog, false);
    assert.equal(existsSync(join(outDir, "ok-caller-pair", "budget-impact.json")), true);
    assert.equal(existsSync(join(outDir, "ok-caller-pair", "budget-impact.md")), true);

    assert.equal(missing.outcome, "rejected");
    assert.equal(missing.fundingState, "rejected");
    assert.equal(missing.sold, false);
    assert.equal(missing.code, "missing-required-inputs");
    assert.equal(missing.price.kind, "fixture");
    assert.equal(missing.price.amountUsdc, FIXTURE_PRICE_USDC);

    const saved = JSON.parse(readFileSync(join(outDir, "ledger.json"), "utf8"));
    assert.equal(saved.sold, false);
    assert.equal(saved.status, "partial");
  });

  it("library: rejected sibling cannot mark the completed item sold", async () => {
    const ledger = await runBatch(journeyRequest(), { persistKind: "fixture" });
    assert.equal(ledger.status, "partial");
    assert.equal(ledger.sold, false);
    assert.ok(ledger.items.every((item) => item.sold === false));
    assert.ok(ledger.items.every((item) => item.price.kind === "fixture"));
    assert.equal(ledger.items[0].outcome, "completed");
    assert.equal(ledger.items[1].outcome, "rejected");
  });
});
