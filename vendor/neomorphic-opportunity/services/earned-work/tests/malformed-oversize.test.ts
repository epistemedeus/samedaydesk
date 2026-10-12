import assert from "node:assert/strict";
import test from "node:test";
import {
  OWNER_TOKEN,
  TEST_ARTIFACT,
  closeServer,
  createReservedTask,
  createTaskPayload,
  dropSchema,
  issueContributor,
  json,
  key,
  listen,
  openStore,
} from "./helpers.js";

test("malformed JSON, unknown keys, and bad digest are rejected", async () => {
  const { store, schema } = await openStore();
  const { server, baseUrl } = await listen(store);
  try {
    const malformed = await json(baseUrl, "/v1/tasks", {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("bad-json"),
      body: "{",
    });
    assert.equal(malformed.status, 400);

    const unknown = await json(baseUrl, "/v1/tasks", {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("unknown"),
      body: JSON.stringify({ ...createTaskPayload(), extra: true }),
    });
    assert.equal(unknown.status, 400);

    const floatReward = await json(baseUrl, "/v1/tasks", {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("float"),
      body: JSON.stringify({
        ...createTaskPayload(),
        reward: { amount: 0.1, asset: "USDC", network: "base" },
      }),
    });
    assert.equal(floatReward.status, 400);

    const { taskId, termsVersion } = await createReservedTask(baseUrl);
    const contrib = await issueContributor(baseUrl);
    const claimed = await json(baseUrl, `/v1/tasks/${taskId}/claims`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: key("claim"),
      body: JSON.stringify({ termsVersion }),
    });
    const reservationId = (claimed.body as { reservation: { id: string } }).reservation.id;
    const badDigest = await json(baseUrl, `/v1/tasks/${taskId}/submissions`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: key("bad-digest"),
      body: JSON.stringify({
        reservationId,
        artifact: { ...TEST_ARTIFACT, digestSha256: "not-a-digest" },
      }),
    });
    assert.equal(badDigest.status, 400);
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});

test("oversize artifact.bytes vs terms and oversize HTTP body are rejected", async () => {
  const { store, schema } = await openStore();
  const { server, baseUrl } = await listen(store);
  try {
    const { taskId, termsVersion } = await createReservedTask(baseUrl, {
      terms: {
        summary: "test provenance — tiny artifact bound",
        claimTtlSeconds: 3600,
        maxArtifactBytes: 32,
        allowedMediaTypes: ["text/plain"],
        slotLimit: 1,
      },
    });
    const contrib = await issueContributor(baseUrl);
    const claimed = await json(baseUrl, `/v1/tasks/${taskId}/claims`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: key("claim"),
      body: JSON.stringify({ termsVersion }),
    });
    const reservationId = (claimed.body as { reservation: { id: string } }).reservation.id;
    const oversize = await json(baseUrl, `/v1/tasks/${taskId}/submissions`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: key("oversize"),
      body: JSON.stringify({
        reservationId,
        artifact: { ...TEST_ARTIFACT, bytes: 64 },
      }),
    });
    assert.equal(oversize.status, 400, JSON.stringify(oversize.body));
    assert.equal((oversize.body as { error: { code: string } }).error.code, "oversize");

    const huge = await json(baseUrl, "/v1/tasks", {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("huge"),
      body: JSON.stringify({
        ...createTaskPayload(),
        summary: "x".repeat(40 * 1024),
      }),
    });
    assert.equal(huge.status, 413);
    assert.equal((huge.body as { error: { code: string } }).error.code, "payload_too_large");
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});
