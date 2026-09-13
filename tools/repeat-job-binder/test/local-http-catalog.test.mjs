import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import test from "node:test";
import { USEFUL_JOBS_CATALOG_PATH } from "../lib/pins.mjs";

test("local HTTP serves committed catalog.json (local-runtime, not external acceptance)", async () => {
  const body = fs.readFileSync(USEFUL_JOBS_CATALOG_PATH);
  const catalog = JSON.parse(body.toString("utf8"));
  assert.equal(catalog.runtime.schedulerDaemon, false);
  assert.equal(catalog.runtime.purchaseAuthority, false);
  assert.ok(catalog.jobs.some((j) => j.id === "repeat-job-record"));
  assert.ok(catalog.jobs.some((j) => j.id === "vendor-budget-impact"));
  assert.ok(catalog.jobs.some((j) => j.id === "api-upgrade-brief"));

  const server = http.createServer((req, res) => {
    if (req.url === "/catalog.json") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(body);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/catalog.json`);
    assert.equal(res.ok, true);
    const got = await res.json();
    assert.equal(got.runtime.schedulerDaemon, false);
    assert.equal(got.jobs.length, catalog.jobs.length);
    assert.equal(got.schema, "useful-jobs.catalog.v1");
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
