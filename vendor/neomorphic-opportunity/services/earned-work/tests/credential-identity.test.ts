import assert from "node:assert/strict";
import test from "node:test";
import {
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

test("two legitimate credentials sharing a public label cannot steal the other's reservation", async () => {
  const { store, schema } = await openStore({ poolMax: 4 });
  const { server, baseUrl } = await listen(store);
  try {
    const { taskId, termsVersion } = await createReservedTask(baseUrl);
    const publicId = "shared-public-label";
    const a = await issueContributor(baseUrl, { contributorPublicId: publicId, taskId });
    const b = await issueContributor(baseUrl, { contributorPublicId: publicId, taskId });
    assert.equal(a.publicId, publicId);
    assert.equal(b.publicId, publicId);
    assert.notEqual(a.token, b.token);

    const claimBody = JSON.stringify({ termsVersion });
    const [first, second] = await Promise.all([
      json(baseUrl, `/v1/tasks/${taskId}/claims`, {
        method: "POST",
        token: a.token,
        idempotencyKey: key("claim-a"),
        body: claimBody,
      }),
      json(baseUrl, `/v1/tasks/${taskId}/claims`, {
        method: "POST",
        token: b.token,
        idempotencyKey: key("claim-b"),
        body: claimBody,
      }),
    ]);
    const statuses = [first.status, second.status].sort();
    assert.deepEqual(statuses, [201, 409], JSON.stringify({ first: first.body, second: second.body }));
    const winner = first.status === 201 ? first : second;
    const loser = first.status === 409 ? first : second;
    const loserToken = first.status === 409 ? a.token : b.token;
    const winnerToken = first.status === 201 ? a.token : b.token;
    assert.equal((loser.body as { error: { code: string } }).error.code, "reserved_elsewhere");
    const reservationId = (winner.body as { reservation: { id: string } }).reservation.id;

    const stolenSubmit = await json(baseUrl, `/v1/tasks/${taskId}/submissions`, {
      method: "POST",
      token: loserToken,
      idempotencyKey: key("submit-loser"),
      body: JSON.stringify({ reservationId, artifact: TEST_ARTIFACT }),
    });
    assert.equal(stolenSubmit.status, 403, JSON.stringify(stolenSubmit.body));
    assert.equal((stolenSubmit.body as { error: { code: string } }).error.code, "forbidden");

    const submitKey = key("submit-winner");
    const submitBody = JSON.stringify({ reservationId, artifact: TEST_ARTIFACT });
    const original = await json(baseUrl, `/v1/tasks/${taskId}/submissions`, {
      method: "POST",
      token: winnerToken,
      idempotencyKey: submitKey,
      body: submitBody,
    });
    assert.equal(original.status, 201, JSON.stringify(original.body));

    const replay = await json(baseUrl, `/v1/tasks/${taskId}/submissions`, {
      method: "POST",
      token: winnerToken,
      idempotencyKey: submitKey,
      body: submitBody,
    });
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.equal(
      (replay.body as { submission: { id: string } }).submission.id,
      (original.body as { submission: { id: string } }).submission.id,
    );
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});
