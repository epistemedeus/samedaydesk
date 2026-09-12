import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";
import { createFileStore } from "../lib/store-file.mjs";
import { runCreateOrder } from "../lib/create-order.mjs";
import { loadOrder, ORDERS, parseStdout, runCli, tmpOut, tmpStore, WRAPPER_ROOT } from "./helpers.mjs";

describe("actual-interface contract boundaries", { timeout: 180_000 }, () => {
  it("stale files in caller outDir are not this order's outputs", () => {
    const store = tmpStore();
    const outDir = tmpOut();
    writeFileSync(join(outDir, "foreign.txt"), "not-this-job\n");
    writeFileSync(join(outDir, "upgrade-brief.json"), `${JSON.stringify({ stale: true, appId: "stale" })}\n`);
    const proc = runCli(
      ["create", "--request", "tools/managed-useful-jobs-order/fixtures/orders/ord-1.json"],
      { store, outDir },
    );
    assert.equal(proc.status, 0, `${proc.stderr}\n${proc.stdout}`);
    const body = parseStdout(proc);
    assert.equal(body.ok, true);
    assert.deepEqual(
      body.outputs.map((row) => row.name),
      ["upgrade-brief.json", "upgrade-brief.md"],
    );
    const published = JSON.parse(readFileSync(join(outDir, "upgrade-brief.json"), "utf8"));
    assert.equal(published.appId, "api-upgrade-brief");
    assert.notEqual(published.stale, true);
    assert.equal(existsSync(join(outDir, "foreign.txt")), true);
    assert.equal(
      body.outputs.some((row) => row.name === "foreign.txt"),
      false,
    );
    assert.equal(body.wrapper.delivery.complete, true);
  });

  it("corrupt store replay refuses and does not execute", () => {
    const store = tmpStore();
    writeFileSync(join(store, "ord-1.json"), "{not-json\n");
    const proc = runCli(
      ["create", "--request", "tools/managed-useful-jobs-order/fixtures/orders/ord-1.json"],
      { store, outDir: tmpOut() },
    );
    assert.equal(proc.status, 2, proc.stdout);
    const body = parseStdout(proc);
    assert.equal(body.ok, false);
    assert.equal(body.code, "corrupt-replay");
    assert.equal(body.sold, false);
    assert.equal(existsSync(join(store, "executions.jsonl")), false);
  });

  it("D01 loopback /execute is a thin HTTP consumer of the same contract", async () => {
    const mod = await import(pathToFileURL(join(WRAPPER_ROOT, "index.mjs")).href);
    const { server } = mod.createExecutionServer();
    const { origin } = await mod.listenExecutionServer(server);
    const store = createFileStore(tmpStore());
    try {
      const result = await runCreateOrder(loadOrder("ord-1.json"), {
        store,
        requestDir: ORDERS,
        outDir: tmpOut(),
        wrapperRoot: WRAPPER_ROOT,
        executeUrl: origin,
      });
      assert.equal(result.ok, true, JSON.stringify(result));
      assert.equal(result.orderId, "ord-1");
      assert.equal(result.wrapper.contract, "samedaydesk.paid-useful-jobs.execution.v1");
      assert.equal(result.competingRunner, false);
      const retrieved = await fetch(`${origin}/results/${result.wrapper.executionId}`);
      const stored = await retrieved.json();
      assert.equal(retrieved.status, 200);
      assert.equal(stored.ok, true);
      assert.equal(stored.contract, "samedaydesk.paid-useful-jobs.execution.v1");
    } finally {
      await store.close();
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
