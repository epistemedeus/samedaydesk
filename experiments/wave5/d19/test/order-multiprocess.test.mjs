import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { co20Fixture } from "../lib/locate.mjs";
import { creators, twoCreates, writeClonedOrder } from "../lib/run.mjs";

describe("multi-process managed orders", { timeout: 180_000 }, () => {
  it("two CLI processes with distinct orderIds preserve both jobs", async () => {
    const pair = await twoCreates([writeClonedOrder("ord-d19-a"), writeClonedOrder("ord-d19-b")]);
    assert.notEqual(pair.a.proc.pid, pair.b.proc.pid);
    assert.equal(pair.a.body.parseError, false, pair.a.body.stderr || pair.a.body.stdout);
    assert.equal(pair.b.body.parseError, false, pair.b.body.stderr || pair.b.body.stdout);
    assert.equal(pair.a.body.ok, true, JSON.stringify(pair.a.body));
    assert.equal(pair.b.body.ok, true, JSON.stringify(pair.b.body));
    assert.equal(pair.a.body.orderId, "ord-d19-a");
    assert.equal(pair.b.body.orderId, "ord-d19-b");
    assert.equal(pair.a.body.sold, false);
    assert.equal(pair.b.body.charged, false);
    assert.equal(pair.storeFiles.includes("ord-d19-a.json"), true);
    assert.equal(pair.storeFiles.includes("ord-d19-b.json"), true);
    assert.equal(pair.storeFiles.length, 2);
    assert.notEqual(pair.a.body.termsHash, pair.b.body.termsHash);
  });

  it("two CLI processes with the same orderId leave one store reservation", async () => {
    const req = co20Fixture("ord-1.json");
    const pair = await twoCreates([req, req]);
    assert.notEqual(pair.a.proc.pid, pair.b.proc.pid);
    assert.equal(pair.a.body.ok, true, JSON.stringify(pair.a.body));
    assert.equal(pair.b.body.ok, true, JSON.stringify(pair.b.body));
    assert.equal(pair.a.body.orderId, "ord-1");
    assert.equal(pair.b.body.orderId, "ord-1");
    assert.deepEqual(pair.storeFiles, ["ord-1.json"]);
    assert.equal(pair.a.body.termsHash, pair.b.body.termsHash);
    const made = creators(pair);
    assert.equal(made.length, 1);
  });

  it("current Co20 pin still runs the engine twice for one orderId", async () => {
    const req = co20Fixture("ord-1.json");
    const pair = await twoCreates([req, req]);
    assert.equal(pair.outputsA, true);
    assert.equal(pair.outputsB, true);
    assert.deepEqual(pair.storeFiles, ["ord-1.json"]);
  });
});
