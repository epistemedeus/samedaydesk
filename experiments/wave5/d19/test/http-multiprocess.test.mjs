import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LISTEN_PATH } from "../lib/pins.mjs";
import { startOrderListener, stopListener, storeOrderFiles, tmpDir, twoHttpPosts, writeClonedOrder } from "../lib/run.mjs";

describe("multi-process HTTP clients against listen", { timeout: 180_000 }, () => {
  it("two POSTs of distinct orderIds preserve both jobs on the shared store", async () => {
    const store = tmpDir("w5-d19-http-store-");
    const listener = await startOrderListener(store);
    try {
      assert.match(listener.info.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
      assert.equal(listener.info.host, "127.0.0.1");
      assert.equal(listener.info.productionExpress, false);
      const aPath = writeClonedOrder("ord-http-a");
      const bPath = writeClonedOrder("ord-http-b");
      const posted = await twoHttpPosts(listener.info.origin, LISTEN_PATH, aPath, bPath);
      assert.equal(posted.a.ok, true, JSON.stringify(posted.a));
      assert.equal(posted.b.ok, true, JSON.stringify(posted.b));
      assert.equal(posted.a.body.orderId, "ord-http-a");
      assert.equal(posted.b.body.orderId, "ord-http-b");
      const files = storeOrderFiles(store);
      assert.equal(files.includes("ord-http-a.json"), true);
      assert.equal(files.includes("ord-http-b.json"), true);
    } finally {
      await stopListener(listener);
    }
  });

  it("two POSTs of the same orderId keep one reservation file", async () => {
    const store = tmpDir("w5-d19-http-same-");
    const listener = await startOrderListener(store);
    try {
      const req = writeClonedOrder("ord-1");
      const posted = await twoHttpPosts(listener.info.origin, LISTEN_PATH, req, req);
      assert.equal(posted.a.ok, true, JSON.stringify(posted.a));
      assert.equal(posted.b.ok, true, JSON.stringify(posted.b));
      assert.deepEqual(storeOrderFiles(store), ["ord-1.json"]);
      const replayed = [posted.a.body.replayed, posted.b.body.replayed];
      assert.equal(replayed.filter((value) => value === false).length, 1);
    } finally {
      await stopListener(listener);
    }
  });
});
