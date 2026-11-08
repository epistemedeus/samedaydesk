import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import { createAgentReadinessRouter } from "../../routes/agent-readiness.js";

test("documentation JSON is explicitly selected and never falls through to the capability checker", async (t) => {
  const docs = { schema: "agent-readiness.documentation.v1", checks: [], topFixes: [] };
  const legacy = { schema: "agent-readiness.report.v1", score: 42 };
  const app = express();
  let legacyCalls = 0;
  let docsCalls = 0;
  app.use("/agent-readiness", createAgentReadinessRouter({
    run: async () => { legacyCalls++; return { payload: legacy }; },
    runDocumentation: async (host, options) => {
      assert.equal(host, "docs.example.org");
      assert.ok(options.clientKey);
      docsCalls++;
      if (docsCalls > 1) throw Object.assign(new Error("Try later"), { status: 429, retryAfterSec: 9 });
      return docs;
    },
  }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const get = (query) => fetch(`http://127.0.0.1:${server.address().port}/agent-readiness?${query}`);
  const path = "format=documentation";
  assert.equal((await get(path)).status, 400);
  const report = await get(`${path}&host=docs.example.org`);
  assert.equal(report.status, 200);
  assert.equal(report.headers.get("cache-control"), "no-store");
  assert.deepEqual(await report.json(), docs);
  const limited = await get(`${path}&host=docs.example.org`);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "9");
  assert.equal(legacyCalls, 0);
  const json = await get("host=docs.example.org&format=json");
  assert.deepEqual(await json.json(), legacy);
  assert.equal(legacyCalls, 1);
});
