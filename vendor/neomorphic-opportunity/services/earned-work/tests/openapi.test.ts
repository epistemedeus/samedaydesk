import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { closeServer, dropSchema, json, listen, openStore } from "./helpers.js";

const root = path.dirname(fileURLToPath(import.meta.url));

test("OpenAPI documents the implemented earned-work routes", () => {
  const document = JSON.parse(readFileSync(path.join(root, "../openapi.json"), "utf8")) as {
    openapi: string;
    paths: Record<string, unknown>;
    info: { description: string };
  };
  assert.equal(document.openapi, "3.1.0");
  assert.deepEqual(Object.keys(document.paths).sort(), [
    "/healthz",
    "/openapi.json",
    "/v1/contributor-tokens",
    "/v1/tasks",
    "/v1/tasks/{taskId}",
    "/v1/tasks/{taskId}/accept",
    "/v1/tasks/{taskId}/claims",
    "/v1/tasks/{taskId}/contributor-obligation",
    "/v1/tasks/{taskId}/funding/reserve",
    "/v1/tasks/{taskId}/obligation",
    "/v1/tasks/{taskId}/payout",
    "/v1/tasks/{taskId}/reject",
    "/v1/tasks/{taskId}/submissions",
    "/v1/tasks/{taskId}/terms",
    "/v1/tasks/{taskId}/terms/{termsVersion}",
    "/v1/tasks/{taskId}/verdicts",
  ]);
  assert.match(document.info.description, /does not execute artifacts/i);
  assert.match(document.info.description, /payment rails/i);
  assert.match(JSON.stringify(document), /owed_record/);
  assert.match(JSON.stringify(document), /Empty projection/);
  assert.match(JSON.stringify(document), /"Provenance"/);
  assert.match(JSON.stringify(document), /evidenceBase64/);
});

test("GET /openapi.json and /healthz are unauthenticated", async () => {
  const { store, schema } = await openStore();
  const { server, baseUrl } = await listen(store);
  try {
    const spec = await json(baseUrl, "/openapi.json");
    assert.equal(spec.status, 200);
    assert.equal((spec.body as { openapi: string }).openapi, "3.1.0");
    const health = await json(baseUrl, "/healthz");
    assert.equal(health.status, 200);
    assert.equal((health.body as { ok: boolean; store: string }).ok, true);
    assert.equal((health.body as { store: string }).store, "postgres");
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});
