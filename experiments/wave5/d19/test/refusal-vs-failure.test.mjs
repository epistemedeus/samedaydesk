import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";
import { co20Fixture } from "../lib/locate.mjs";
import { createOrder, runLedgerExample, tmpDir, twoCreates } from "../lib/run.mjs";

describe("refusal versus transport or engine failure", { timeout: 180_000 }, () => {
  it("example:true is a parseable F-SAMPLE refusal beside a successful sibling job", async () => {
    const pair = await twoCreates([co20Fixture("example-true.json"), co20Fixture("ord-1.json")]);
    assert.notEqual(pair.a.proc.pid, pair.b.proc.pid);
    const sample = pair.a.body.orderId === "ord-bad-sample" ? pair.a.body : pair.b.body;
    const real = pair.a.body.orderId === "ord-1" ? pair.a.body : pair.b.body;
    assert.equal(sample.parseError, false, JSON.stringify(sample));
    assert.equal(sample.ok, false);
    assert.equal(sample.falsifier, "F-SAMPLE");
    assert.equal(sample.sold, false);
    assert.equal(sample.charged, false);
    assert.equal(real.ok, true, JSON.stringify(real));
    assert.equal(real.orderId, "ord-1");
    assert.equal(real.acceptanceClass, "local-runtime");
  });

  it("missing request file is a transport failure, not a useful order", async () => {
    const missing = join(tmpDir("w5-d19-missing-"), "no-such-order.json");
    const result = await createOrder({
      requestPath: missing,
      store: tmpDir("w5-d19-store-"),
      outDir: tmpDir("w5-d19-out-"),
    });
    assert.notEqual(result.proc.status, 0);
    assert.equal(result.body.ok === true, false);
  });

  it("missing buyerClass is a labelled ledger refusal, not an engine crash", async () => {
    const located = (await import("../lib/locate.mjs")).locateCo16();
    const { spawnNode, parseJsonProc } = await import("../lib/run.mjs");
    const proc = await spawnNode(
      [located.cli, "run", "vendor-budget-impact", "--example", "--out-dir", tmpDir("w5-d19-ref-")],
      { cwd: located.root },
    );
    const body = parseJsonProc(proc);
    assert.notEqual(proc.status, 0);
    assert.equal(body.parseError, false, body.stderr);
    assert.equal(body.ok, false);
    assert.equal(body.refused, true);
    assert.equal(body.code, "missing_buyer_class");
    assert.equal(body.independentDemand, false);
    assert.equal(body.jobRevenueUsdc, null);
  });

  it("engine status partial with usable output stays a domain outcome", async () => {
    const work = tmpDir("w5-d19-partial-");
    const result = await runLedgerExample({
      ledger: join(work, "ledger.json"),
      outDir: join(work, "out"),
    });
    assert.equal(result.body.ok, true, JSON.stringify(result.body));
    assert.equal(result.body.row.usableOutput, true);
    assert.equal(result.body.row.engine.ok, true);
    assert.equal(result.body.row.engine.status, "partial");
    assert.equal(result.body.row.engine.exitCode, 0);
  });
});
