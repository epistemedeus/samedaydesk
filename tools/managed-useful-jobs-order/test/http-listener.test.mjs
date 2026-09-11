import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createListener } from "../lib/listener.mjs";
import { runCreateOrder } from "../lib/create-order.mjs";
import { createFileStore } from "../lib/store-file.mjs";
import { loadOrder, tmpOut, tmpStore, ORDERS } from "./helpers.mjs";

async function postJson(origin, path, body) {
  const res = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

describe("127.0.0.1 test listener", { timeout: 180_000 }, () => {
  it("healthz and local POST create bind orderId without touching samedaydesk.com", async () => {
    const store = createFileStore(tmpStore());
    const listener = createListener({
      store,
      requestDir: ORDERS,
      outDir: tmpOut(),
    });
    const { origin, host } = await listener.listen(0);
    try {
      assert.equal(host, "127.0.0.1");
      assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
      const health = await fetch(`${origin}/healthz`);
      const healthBody = await health.json();
      assert.equal(health.status, 200);
      assert.equal(healthBody.ok, true);
      assert.equal(healthBody.productionExpress, false);
      assert.equal(healthBody.liveCatalogItem, false);

      const order = loadOrder("ord-1.json");
      const created = await postJson(origin, "/managed/useful-jobs/v1/orders", order);
      assert.equal(created.status, 201, JSON.stringify(created.body));
      assert.equal(created.body.ok, true);
      assert.equal(created.body.orderId, "ord-1");
      assert.deepEqual(
        created.body.outputs.map((row) => row.name),
        ["upgrade-brief.json", "upgrade-brief.md"],
      );
      assert.equal(created.body.sold, false);

      const extract = await postJson(origin, "/v1/orders", loadOrder("extract-url.json"));
      assert.equal(extract.status, 400);
      assert.equal(extract.body.ok, false);
      assert.equal(extract.body.falsifier, "F-EXTRACT");
      assert.equal(extract.body.charged, false);
    } finally {
      await listener.close();
      await store.close();
    }
  });

  it("library createOrder is the same contract the listener uses", async () => {
    const store = createFileStore(tmpStore());
    const result = await runCreateOrder(loadOrder("example-true.json"), {
      store,
      requestDir: ORDERS,
    });
    assert.equal(result.ok, false);
    assert.equal(result.falsifier, "F-SAMPLE");
    await store.close();
  });
});
