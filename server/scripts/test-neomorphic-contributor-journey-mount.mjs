import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { mountNeomorphicContributorJourney, CONTRIBUTOR_JOURNEY_PREFIX as prefix } from "../lib/neomorphic-contributor-journey-mount.js";

async function host(options) {
  const app = express();
  const handle = mountNeomorphicContributorJourney(app, options);
  app.get("/unrelated", (_req, res) => res.json({ ok: true }));
  const server = await new Promise(resolve => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { handle, base, close: async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await handle.close();
  } };
}
test("default mount is disabled, loads no service and leaves unrelated routes usable", async () => {
  let loaded = false;
  const fixture = await host({ env: {}, loadService: () => { loaded = true; throw new Error("must not load"); } });
  try {
    const response = await fetch(`${fixture.base}${prefix}/healthz`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.reason, "disabled"); assert.equal(body.publicEnabled, false);
    assert.equal((await fetch(`${fixture.base}${prefix}/v1/account`)).status, 503);
    assert.equal((await fetch(`${fixture.base}/unrelated`)).status, 200);
    assert.equal(loaded, false);
  } finally { await fixture.close(); }
});
test("absent received artifact is integration pending and never starts a replacement service", async () => {
  const fixture = await host({ env: { CONTRIBUTOR_JOURNEY_MODE: "staging" }, loadService:()=>import('../fixtures/absent-contributor-journey/index.js') });
  try {
    await fixture.handle.ready();
    assert.equal(fixture.handle.state.reason, "integration_pending");
    assert.equal((await fetch(`${fixture.base}/unrelated`)).status, 200);
    assert.equal((await fetch(`${fixture.base}${prefix}/v1/core/tasks`)).status, 503);
  } finally { await fixture.close(); }
});
test("unapproved production mode does not load a service", async () => {
  const fixture = await host({ env: { CONTRIBUTOR_JOURNEY_MODE: "production" }, loadService: () => assert.fail("unexpected load") });
  try { assert.equal((await (await fetch(`${fixture.base}${prefix}/healthz`)).json()).reason, "invalid_config"); }
  finally { await fixture.close(); }
});
