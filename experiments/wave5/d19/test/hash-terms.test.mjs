import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";
import { co20Fixture } from "../lib/locate.mjs";
import { createOrder, runLedgerExample, tmpDir } from "../lib/run.mjs";

describe("unlike terms hashes stay unlike", { timeout: 180_000 }, () => {
  it("order termsHash is not forced equal to ledger requestHash", async () => {
    const order = await createOrder({
      requestPath: co20Fixture("ord-1.json"),
      store: tmpDir("w5-d19-hash-store-"),
      outDir: tmpDir("w5-d19-hash-out-"),
    });
    assert.equal(order.body.ok, true, JSON.stringify(order.body));
    assert.match(order.body.termsHash, /^[0-9a-f]{64}$/);

    const work = tmpDir("w5-d19-hash-led-");
    const ledger = await runLedgerExample({
      ledger: join(work, "ledger.json"),
      outDir: join(work, "out"),
    });
    assert.equal(ledger.body.ok, true, JSON.stringify(ledger.body));
    assert.match(ledger.body.row.requestHash, /^[0-9a-f]{64}$/);
    assert.equal(ledger.body.row.hashTerms.competingKernelCopied, false);
    assert.notEqual(order.body.termsHash, ledger.body.row.requestHash);
    assert.notEqual(order.body.schema, ledger.body.row.schema);
  });
});
