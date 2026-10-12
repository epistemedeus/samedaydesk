import assert from "node:assert/strict";
import test from "node:test";
import {
  OWNER_TOKEN,
  closeServer,
  createTaskPayload,
  dropSchema,
  json,
  key,
  listen,
  openStore,
} from "./helpers.js";

test("identical Idempotency-Key replays; changed body conflicts", async () => {
  const { store, schema } = await openStore();
  const { server, baseUrl } = await listen(store);
  try {
    const payload = createTaskPayload();
    const idem = key("create");
    const first = await json(baseUrl, "/v1/tasks", {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: idem,
      body: JSON.stringify(payload),
    });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const taskId = (first.body as { task: { id: string; termsVersion: string } }).task.id;
    const termsVersion = (first.body as { task: { termsVersion: string } }).task.termsVersion;

    const replay = await json(baseUrl, "/v1/tasks", {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: idem,
      body: JSON.stringify(payload),
    });
    assert.equal(replay.status, 200);
    assert.equal((replay.body as { task: { id: string } }).task.id, taskId);

    const conflict = await json(baseUrl, "/v1/tasks", {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: idem,
      body: JSON.stringify({ ...payload, title: "Different title" }),
    });
    assert.equal(conflict.status, 409);
    assert.equal((conflict.body as { error: { code: string } }).error.code, "idempotency_conflict");

    const reserveKey = key("reserve");
    const reserveBody = "{}";
    const reserved = await json(baseUrl, `/v1/tasks/${taskId}/funding/reserve`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: reserveKey,
      body: reserveBody,
    });
    assert.equal(reserved.status, 200);
    const reserveReplay = await json(baseUrl, `/v1/tasks/${taskId}/funding/reserve`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: reserveKey,
      body: reserveBody,
    });
    assert.equal(reserveReplay.status, 200);
    assert.equal((reserveReplay.body as { task: { fundingState: string } }).task.fundingState, "reserved");

    const contribCreated = await json(baseUrl, "/v1/contributor-tokens", {
      method: "POST",
      token: OWNER_TOKEN,
      body: JSON.stringify({
        contributorPublicId: "test-claim-replay",
        provenance: "test",
      }),
    });
    const contribToken = (contribCreated.body as { token: string }).token;
    const claimKey = key("claim");
    const claimBody = JSON.stringify({ termsVersion });
    const claimed = await json(baseUrl, `/v1/tasks/${taskId}/claims`, {
      method: "POST",
      token: contribToken,
      idempotencyKey: claimKey,
      body: claimBody,
    });
    assert.equal(claimed.status, 201, JSON.stringify(claimed.body));
    const reservationId = (claimed.body as { reservation: { id: string } }).reservation.id;
    const claimReplay = await json(baseUrl, `/v1/tasks/${taskId}/claims`, {
      method: "POST",
      token: contribToken,
      idempotencyKey: claimKey,
      body: claimBody,
    });
    assert.equal(claimReplay.status, 200);
    assert.equal((claimReplay.body as { reservation: { id: string } }).reservation.id, reservationId);
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});

test("mutating POSTs require Idempotency-Key", async () => {
  const { store, schema } = await openStore();
  const { server, baseUrl } = await listen(store);
  try {
    const missing = await json(baseUrl, "/v1/tasks", {
      method: "POST",
      token: OWNER_TOKEN,
      body: JSON.stringify(createTaskPayload()),
    });
    assert.equal(missing.status, 400);
    assert.match((missing.body as { error: { message: string } }).error.message, /Idempotency-Key/);
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});
