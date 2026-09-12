import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runCreateOrder } from "../lib/create-order.mjs";
import { createFileStore } from "../lib/store-file.mjs";
import { ORDERS, loadOrder, tmpOut, tmpStore } from "./helpers.mjs";

function journal(storeDir) {
  const path = join(storeDir, "executions.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe("d20 interrupt before durable complete does not rerun the engine", { timeout: 180_000 }, () => {
  it("reopen after SIGKILL-before-complete keeps executions.jsonl at 1", async () => {
    const storeDir = tmpStore();
    const store = createFileStore(storeDir);
    const raw = loadOrder("ord-1.json");
    const originalComplete = store.complete.bind(store);
    store.complete = async () => {
      throw Object.assign(new Error("simulated SIGKILL before store.complete"), {
        code: "SIMULATED_KILL",
      });
    };

    await assert.rejects(
      () => runCreateOrder(raw, { store, outDir: tmpOut(), requestDir: ORDERS }),
      (err) => {
        assert.equal(err.code, "SIMULATED_KILL");
        return true;
      },
    );

    const before = journal(storeDir);
    assert.equal(before.length, 1, "first engine run must already be journaled");
    const orderPath = join(storeDir, "ord-1.json");
    const reserved = JSON.parse(readFileSync(orderPath, "utf8"));
    assert.equal(reserved.status, "reserved");
    assert.equal(reserved.executionCount, 1);
    reserved.holderPid = 999999999;
    writeFileSync(orderPath, `${JSON.stringify(reserved, null, 2)}\n`);

    store.complete = originalComplete;
    const reopened = await runCreateOrder(raw, { store, outDir: tmpOut(), requestDir: ORDERS });
    const after = journal(storeDir);
    assert.equal(
      after.length,
      1,
      "ambiguous order automatically reran a completed real engine",
    );
    if (reopened.ok) {
      assert.equal(reopened.wrapper.executionId, before[0].executionId);
    } else {
      assert.equal(reopened.ok, false);
      assert.equal(reopened.sold, false);
      assert.notEqual(reopened.delivery?.complete, true);
    }
  });
});
