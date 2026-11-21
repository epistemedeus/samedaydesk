import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { apexAgentCard } from "../lib/apex-agent-card.js";
import { mountApexDeclarations } from "../lib/apex-declarations.js";

test("HTTP declarations advertise the collection only under the existing public-read profile", async (t) => {
  const env = {};
  const app = express();
  mountApexDeclarations(app, { env });
  app.get("/.well-known/agent-card.json", (_req, res) => res.json(apexAgentCard(env)));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise(resolve => server.close(resolve)));
  const root = `http://127.0.0.1:${server.address().port}`;
  const get = async path => (await fetch(root + path)).text();
  for (const path of ["/.well-known/api-catalog", "/.well-known/agent-card.json", "/openapi.json", "/llms.txt"]) {
    assert.doesNotMatch(await get(path), /https:\/\/samedaydesk\.com\/api\/neomorphic-contributor-journey\/v1\/market\/accepted-work/);
  }
  const offline = JSON.parse(await get("/.well-known/agent-card.json"))["x-query-key-caller"];
  assert.equal(offline.runner.version, "1.1.0");
  Object.assign(env, { CONTRIBUTOR_JOURNEY_MODE: "live", CONTRIBUTOR_JOURNEY_INSTALLED: "1",
    CONTRIBUTOR_JOURNEY_PUBLIC_READS: "1", CONTRIBUTOR_JOURNEY_PUBLIC_REVIEW_REF: "review_fixture_received" });
  for (const path of ["/.well-known/api-catalog", "/.well-known/agent-card.json", "/openapi.json"]) {
    assert.match(await get(path), /https:\/\/samedaydesk\.com\/api\/neomorphic-contributor-journey\/v1\/market\/accepted-work/);
  }
});
