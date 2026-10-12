import assert from "node:assert/strict";
import test from "node:test";
import {
  OWNER_TOKEN,
  TEST_ARTIFACT,
  closeServer,
  createReservedTask,
  dropSchema,
  issueContributor,
  json,
  key,
  listen,
  openStore,
} from "./helpers.js";

test("late submission after reservation TTL is rejected", async () => {
  let now = new Date("2026-09-11T00:00:00.000Z");
  const { store, schema } = await openStore({ clock: () => now });
  const { server, baseUrl } = await listen(store);
  try {
    const { taskId, termsVersion } = await createReservedTask(baseUrl, {
      terms: {
        summary: "test provenance — short TTL",
        claimTtlSeconds: 60,
        maxArtifactBytes: 1024,
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
    assert.equal(claimed.status, 201, JSON.stringify(claimed.body));
    const reservationId = (claimed.body as { reservation: { id: string } }).reservation.id;

    now = new Date("2026-09-11T00:05:00.000Z");
    const late = await json(baseUrl, `/v1/tasks/${taskId}/submissions`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: key("late"),
      body: JSON.stringify({ reservationId, artifact: TEST_ARTIFACT }),
    });
    assert.equal(late.status, 409, JSON.stringify(late.body));
    assert.equal((late.body as { error: { code: string } }).error.code, "late_submission");
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});

test("duplicate submission on the same reservation is rejected; same idempotency key replays", async () => {
  const { store, schema } = await openStore();
  const { server, baseUrl } = await listen(store);
  try {
    const { taskId, termsVersion } = await createReservedTask(baseUrl);
    const contrib = await issueContributor(baseUrl);
    const claimed = await json(baseUrl, `/v1/tasks/${taskId}/claims`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: key("claim"),
      body: JSON.stringify({ termsVersion }),
    });
    assert.equal(claimed.status, 201, JSON.stringify(claimed.body));
    const reservationId = (claimed.body as { reservation: { id: string } }).reservation.id;
    const submitKey = key("submit");
    const first = await json(baseUrl, `/v1/tasks/${taskId}/submissions`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: submitKey,
      body: JSON.stringify({ reservationId, artifact: TEST_ARTIFACT }),
    });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const replay = await json(baseUrl, `/v1/tasks/${taskId}/submissions`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: submitKey,
      body: JSON.stringify({ reservationId, artifact: TEST_ARTIFACT }),
    });
    assert.equal(replay.status, 200);
    assert.equal(
      (replay.body as { submission: { id: string } }).submission.id,
      (first.body as { submission: { id: string } }).submission.id,
    );
    const dup = await json(baseUrl, `/v1/tasks/${taskId}/submissions`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: key("submit-dup"),
      body: JSON.stringify({
        reservationId,
        artifact: { ...TEST_ARTIFACT, ref: "fixture:s275-test-other" },
      }),
    });
    assert.equal(dup.status, 409, JSON.stringify(dup.body));
    assert.equal((dup.body as { error: { code: string } }).error.code, "duplicate_submission");
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});

test("non-claimant cannot submit", async () => {
  const { store, schema } = await openStore();
  const { server, baseUrl } = await listen(store);
  try {
    const { taskId, termsVersion } = await createReservedTask(baseUrl);
    const owner = await issueContributor(baseUrl);
    const other = await issueContributor(baseUrl);
    const claimed = await json(baseUrl, `/v1/tasks/${taskId}/claims`, {
      method: "POST",
      token: owner.token,
      idempotencyKey: key("claim"),
      body: JSON.stringify({ termsVersion }),
    });
    const reservationId = (claimed.body as { reservation: { id: string } }).reservation.id;
    const denied = await json(baseUrl, `/v1/tasks/${taskId}/submissions`, {
      method: "POST",
      token: other.token,
      idempotencyKey: key("submit"),
      body: JSON.stringify({ reservationId, artifact: TEST_ARTIFACT }),
    });
    assert.equal(denied.status, 403);
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});

test("late submission after reservation is released is rejected", async () => {
  const { store, schema } = await openStore();
  const { server, baseUrl } = await listen(store);
  try {
    const { taskId, termsVersion } = await createReservedTask(baseUrl);
    const contrib = await issueContributor(baseUrl);
    const claimed = await json(baseUrl, `/v1/tasks/${taskId}/claims`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: key("claim"),
      body: JSON.stringify({ termsVersion }),
    });
    const reservationId = (claimed.body as { reservation: { id: string } }).reservation.id;
    const rejected = await json(baseUrl, `/v1/tasks/${taskId}/reject`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("reject"),
      body: JSON.stringify({ reservationId, reason: "test provenance — release reservation" }),
    });
    assert.equal(rejected.status, 200);
    const late = await json(baseUrl, `/v1/tasks/${taskId}/submissions`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: key("late-released"),
      body: JSON.stringify({ reservationId, artifact: TEST_ARTIFACT }),
    });
    assert.equal(late.status, 409, JSON.stringify(late.body));
    assert.equal((late.body as { error: { code: string } }).error.code, "late_submission");
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});

test("accept without a pass verdict is rejected", async () => {
  const { store, schema } = await openStore();
  const { server, baseUrl } = await listen(store);
  try {
    const { taskId, termsVersion } = await createReservedTask(baseUrl);
    const contrib = await issueContributor(baseUrl);
    const claimed = await json(baseUrl, `/v1/tasks/${taskId}/claims`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: key("claim"),
      body: JSON.stringify({ termsVersion }),
    });
    const reservationId = (claimed.body as { reservation: { id: string } }).reservation.id;
    await json(baseUrl, `/v1/tasks/${taskId}/submissions`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: key("submit"),
      body: JSON.stringify({ reservationId, artifact: TEST_ARTIFACT }),
    });
    const tooSoon = await json(baseUrl, `/v1/tasks/${taskId}/accept`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("accept"),
      body: JSON.stringify({ reservationId }),
    });
    assert.equal(tooSoon.status, 409);
    assert.equal((tooSoon.body as { error: { code: string } }).error.code, "verdict_required");
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});
