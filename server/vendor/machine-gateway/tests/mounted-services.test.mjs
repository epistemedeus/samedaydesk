import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { MonitorStore } from "../../continuous-monitoring/src/store.mjs";
import { createApi } from "../../continuous-monitoring/src/api.mjs";
import { tick } from "../../continuous-monitoring/src/worker.mjs";
import { fixture, TOKEN_A, sampleInput } from "./helpers.mjs";

test("mounted monitoring observes a gateway authentication refusal without acquiring its tenant authority or executing work", async t => {
  const gateway = await fixture(t);
  const receipt = (await gateway.execute(await gateway.quote(sampleInput, "lockfile.delta"), "mounted-real-free-call")).body;
  assert.equal(receipt.status, "completed"); assert.equal(receipt.output.counts.changed, 1);
  const sourceHeaders = [];
  gateway.server.on("request", req => { sourceHeaders.push(req.headers); });
  const directory = await mkdtemp(join(tmpdir(), "mounted-service-monitor-"));
  const store = new MonitorStore(join(directory, "monitor.sqlite"), {
    demo: true, mountedOrigin: gateway.origin, minIntervalMs: 120, sourceCooldownMs: 120,
    originCooldownMs: 10, visibilityMs: 120, leaseSlackMs: 100,
  });
  const api = createApi(store); api.listen(0, "127.0.0.1"); await once(api, "listening");
  t.after(async () => { api.closeAllConnections(); await new Promise(resolve => api.close(resolve)); store.close(); await rm(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${api.address().port}`;
  store.provision({ id: "monitor-owner", token: TOKEN_A });
  const create = await fetch(`${base}/v1/monitors`, { method: "POST", headers: {
    authorization: `Bearer ${TOKEN_A}`, "content-type": "application/json", "idempotency-key": "monitor-receipt-boundary",
  }, body: JSON.stringify({ url: `${gateway.origin}${receipt.readbackPath}`, mode: "http", intervalMs: 5000 }) });
  assert.equal(create.status, 201);
  const id = (await create.json()).monitor.id;
  const result = await tick(store);
  assert.equal(result.completed[0].observation.material.status, 401);
  assert.equal(sourceHeaders.length, 1); assert.equal(sourceHeaders[0].authorization, undefined);
  assert.equal(store.listEvents("monitor-owner", id).events.length, 0);
  assert.equal(gateway.store.db.prepare("SELECT count(*) AS n FROM attempts").get().n, 1);
  assert.equal(gateway.store.db.prepare("SELECT count(*) AS n FROM credentials").get().n, 0);
  assert.deepEqual((await gateway.request(`/v1/receipts/${receipt.id}`)).body, receipt);
});
