import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createSdsApp } from "../app.js";

// Run with the producer's tsx loader. Exact isolated source/build supplied by Root.
const product = process.env.CONTRIBUTOR_JOURNEY_TEST_PRODUCT_ROOT;
assert.ok(product && path.isAbsolute(product), "set CONTRIBUTOR_JOURNEY_TEST_PRODUCT_ROOT to the isolated received producer checkout");
const service = await import(pathToFileURL(path.join(product, "services/contributor-journey/dist/index.js")).href);
const helpers = await import(pathToFileURL(path.join(product, "tests/contributor-journey/helpers.ts")).href);
const scenario = await import(pathToFileURL(path.join(product, "tests/contributor-journey/scenario.ts")).href);

test("actual SDS host mounts the actual compiled producer with real Postgres, core replay and truthful pending leaves", async () => {
  const database = await helpers.disposablePostgres();
  let server = null; let handle = null; let app = null;
  try {
    const data = helpers.fixtureData(await database.database());
    app = createSdsApp({
      neomorphicContributorJourney: { env: helpers.fixtureEnv(data), ports: helpers.fixturePorts(data), loadService: async () => service },
      neomorphicOpportunity: { env: {} }, correspondence: { env: {} }, hostedUsefulJourney: { env: {} }, managedWatch: { env: {} },
    });
    handle = app.get("neoContributorJourney"); await handle.ready(); assert.equal(handle.state.status, "ready");
    server = await new Promise(resolve => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const base = origin + service.JOURNEY_MOUNT_PATH;
    const replay = await scenario.replayExistingCore(handle.state.runtime, data, base);
    assert.ok(replay.receipt.stages.every(stage => stage.state !== "failed"));
    assert.equal(replay.receipt.wholeJourneyPassed, false);
    const health = await helpers.request(base, "/healthz"); assert.equal(health.status, 200); assert.equal(health.body.publicEnabled, false);
    assert.equal((await fetch(origin + "/api/health")).status, 200);
    const oversized = await helpers.request(base, "/v1/session", { method: "POST", body: { text: "a".repeat(40000) } });
    assert.equal(oversized.status, 413); // SDS's host-global 1MiB parser did not run first.
    const oldMount = await fetch(origin + "/api/neomorphic-opportunity/healthz"); assert.equal(oldMount.status, 200);
    assert.equal((await oldMount.json()).reason, "unconfigured");
    await handle.close(); assert.equal(handle.state.runtime, null);
    assert.equal((await fetch(base + "/v1/core/tasks")).status, 503);
  } finally {
    if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await handle?.close();
    await app?.get("s51Correspondence")?.close?.(); await app?.get("neoOpportunity")?.close?.();
    await app?.get("s346HostedUsefulJourney")?.close?.(); await app?.get("l12ManagedWatch")?.close?.();
    await database.close();
  }
});
