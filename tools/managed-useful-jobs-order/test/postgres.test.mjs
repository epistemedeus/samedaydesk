import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPostgresStore } from "../lib/store-postgres.mjs";
import { runCreateOrder } from "../lib/create-order.mjs";
import { loadOrder, ORDERS, tmpOut } from "./helpers.mjs";
import { postgresBinariesAvailable, startDisposablePostgres } from "./pg-cluster.mjs";

const havePg = postgresBinariesAvailable();

describe("real local Postgres order store", { timeout: 180_000 }, () => {
  it("persists terms hash and refuses swapped files on the same orderId", async () => {
    if (!havePg) {
      throw new Error("postgresql-16 initdb/pg_ctl missing; missing dependency is incomplete, not a skip");
    }
    const cluster = startDisposablePostgres();
    const store = await createPostgresStore({
      clientConfig: cluster.clientConfig,
      schema: "managed_useful_jobs_order",
    });
    try {
      const first = await runCreateOrder(loadOrder("ord-1.json"), {
        store,
        requestDir: ORDERS,
        outDir: tmpOut(),
      });
      assert.equal(first.ok, true, JSON.stringify(first));
      assert.equal(first.orderId, "ord-1");
      assert.equal(first.acceptanceClass, "local-runtime");
      assert.match(first.termsHash, /^[0-9a-f]{64}$/);

      const loaded = await store.get("ord-1");
      assert.equal(loaded.termsHash, first.termsHash);
      assert.equal(loaded.result.orderId, "ord-1");

      const swapped = await runCreateOrder(loadOrder("ord-1-swapped.json"), {
        store,
        requestDir: ORDERS,
        outDir: tmpOut(),
      });
      assert.equal(swapped.ok, false);
      assert.equal(swapped.falsifier, "F-ORDER");
      assert.equal(swapped.httpStatus, 409);
      assert.equal(swapped.sold, false);
    } finally {
      await store.close();
      cluster.stop();
    }
  });

  it("two Postgres clients concurrently reserve one order", async () => {
    if (!havePg) {
      throw new Error("postgresql-16 initdb/pg_ctl missing; missing dependency is incomplete, not a skip");
    }
    const cluster = startDisposablePostgres();
    const storeA = await createPostgresStore({
      clientConfig: cluster.clientConfig,
      schema: "managed_useful_jobs_order",
    });
    const storeB = await createPostgresStore({
      clientConfig: cluster.clientConfig,
      schema: "managed_useful_jobs_order",
    });
    try {
      const [a, b] = await Promise.all([
        runCreateOrder(loadOrder("ord-1.json"), {
          store: storeA,
          requestDir: ORDERS,
          outDir: tmpOut(),
        }),
        runCreateOrder(loadOrder("ord-1.json"), {
          store: storeB,
          requestDir: ORDERS,
          outDir: tmpOut(),
        }),
      ]);
      assert.equal(a.ok, true, JSON.stringify(a));
      assert.equal(b.ok, true, JSON.stringify(b));
      assert.equal(a.orderId, "ord-1");
      assert.equal(b.orderId, "ord-1");
      assert.equal(a.termsHash, b.termsHash);
      const replayed = [a.replayed, b.replayed].filter(Boolean).length;
      assert.equal(replayed, 1, `expected one replay got a=${a.replayed} b=${b.replayed}`);
      const execs = await storeA.listExecutions("ord-1");
      assert.equal(execs.length, 1);
    } finally {
      await storeA.close();
      await storeB.close();
      cluster.stop();
    }
  });
});
