import assert from "node:assert/strict";
import test from "node:test";
import {
  OWNER_TOKEN,
  TEST_PROVENANCE_LABEL,
  closeServer,
  createTaskPayload,
  dropSchema,
  issueContributor,
  json,
  key,
  listen,
  openStore,
} from "./helpers.js";

test("reserve fails when budget does not cover reward", async () => {
  const { store, schema } = await openStore();
  const { server, baseUrl } = await listen(store);
  try {
    const payload = createTaskPayload({
      reward: { amount: "0.10", asset: "USDC", network: "base" },
      budget: { amount: "0.05", asset: "USDC", network: "base" },
    });
    const created = await json(baseUrl, "/v1/tasks", {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("create"),
      body: JSON.stringify(payload),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const taskId = (created.body as { task: { id: string } }).task.id;
    const reserved = await json(baseUrl, `/v1/tasks/${taskId}/funding/reserve`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("reserve"),
      body: "{}",
    });
    assert.equal(reserved.status, 409, JSON.stringify(reserved.body));
    assert.equal((reserved.body as { error: { code: string } }).error.code, "oversubscribed");
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});

test("slotLimit 2 is refused before reserving work", async () => {
  const { store, schema } = await openStore();
  const { server, baseUrl } = await listen(store);
  try {
    const payload = createTaskPayload({
      terms: {
        summary: TEST_PROVENANCE_LABEL,
        claimTtlSeconds: 3600,
        maxArtifactBytes: 1024,
        allowedMediaTypes: ["text/plain"],
        slotLimit: 2,
      },
    });
    const created = await json(baseUrl, "/v1/tasks", {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("create"),
      body: JSON.stringify(payload),
    });
    assert.equal(created.status, 400, JSON.stringify(created.body));
    assert.equal((created.body as { error: { code: string } }).error.code, "invalid_input");
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});

test("claim on an unfunded task is rejected", async () => {
  const { store, schema } = await openStore();
  const { server, baseUrl } = await listen(store);
  try {
    const created = await json(baseUrl, "/v1/tasks", {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("create"),
      body: JSON.stringify(createTaskPayload()),
    });
    const task = created.body as { task: { id: string; termsVersion: string } };
    const taskId = task.task.id;
    const termsVersion = task.task.termsVersion;
    const contrib = await issueContributor(baseUrl);
    const claimed = await json(baseUrl, `/v1/tasks/${taskId}/claims`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: key("claim"),
      body: JSON.stringify({ termsVersion }),
    });
    assert.equal(claimed.status, 409);
    assert.equal((claimed.body as { error: { code: string } }).error.code, "unfunded");
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});
