import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { barrierAppendRows, runLedgerExample, tmpDir } from "../lib/run.mjs";

describe("multi-process buyer-value ledger", { timeout: 180_000 }, () => {
  it("two CLI processes record both owner-qa jobs on one ledger when engines do not collide on append", async () => {
    const work = tmpDir("w5-d19-led-");
    const ledger = join(work, "ledger.json");
    mkdirSync(join(work, "a"), { recursive: true });
    mkdirSync(join(work, "b"), { recursive: true });
    const [a, b] = await Promise.all([
      runLedgerExample({ ledger, outDir: join(work, "a") }),
      runLedgerExample({ ledger, outDir: join(work, "b") }),
    ]);
    assert.notEqual(a.proc.pid, b.proc.pid);
    assert.equal(a.body.ok, true, JSON.stringify(a.body));
    assert.equal(b.body.ok, true, JSON.stringify(b.body));
    assert.equal(a.body.row.independentDemand, false);
    assert.equal(b.body.row.jobRevenueUsdc, null);
    assert.equal(a.body.row.usableOutput, true);
    assert.equal(b.body.row.usableOutput, true);
    assert.notEqual(a.body.row.runId, b.body.row.runId);
    const disk = JSON.parse(readFileSync(ledger, "utf8"));
    assert.equal(disk.independentDemand, false);
    assert.equal(disk.jobRevenueUsdc, null);
    const ids = new Set(disk.rows.map((row) => row.runId));
    assert.equal(ids.has(a.body.row.runId), true);
    assert.equal(ids.has(b.body.row.runId), true);
  });

  it("current Co16 whole-file append loses a row under a 4-writer barrier", async () => {
    const trials = await barrierAppendRows(4, { trials: 8 });
    const lost = trials.filter((row) => row.lost);
    assert.ok(lost.length >= 1, JSON.stringify(trials.map((row) => row.rowCount)));
    for (const trial of trials) {
      assert.equal(trial.n, 4);
      assert.ok(trial.rowCount >= 1);
      assert.ok(trial.rowCount <= 4);
    }
  });
});
