import assert from "node:assert/strict";
import test from "node:test";
import {
  closeServer,
  createReservedTask,
  dropSchema,
  issueContributor,
  json,
  key,
  listen,
  openStore,
} from "./helpers.js";

test("concurrent two-client claim: one active reservation, the other reserved_elsewhere", async () => {
  const { store, schema } = await openStore({ poolMax: 4 });
  const { server, baseUrl } = await listen(store);
  try {
    const { taskId, termsVersion } = await createReservedTask(baseUrl);
    const a = await issueContributor(baseUrl);
    const b = await issueContributor(baseUrl);

    const [first, second] = await Promise.all([
      json(baseUrl, `/v1/tasks/${taskId}/claims`, {
        method: "POST",
        token: a.token,
        idempotencyKey: key("claim-a"),
        body: JSON.stringify({ termsVersion }),
      }),
      json(baseUrl, `/v1/tasks/${taskId}/claims`, {
        method: "POST",
        token: b.token,
        idempotencyKey: key("claim-b"),
        body: JSON.stringify({ termsVersion }),
      }),
    ]);

    const statuses = [first.status, second.status].sort();
    assert.deepEqual(statuses, [201, 409], JSON.stringify({ first: first.body, second: second.body }));
    const winner = first.status === 201 ? first : second;
    const loser = first.status === 409 ? first : second;
    assert.equal((winner.body as { reservation: { status: string } }).reservation.status, "active");
    assert.equal((loser.body as { error: { code: string } }).error.code, "reserved_elsewhere");
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});
