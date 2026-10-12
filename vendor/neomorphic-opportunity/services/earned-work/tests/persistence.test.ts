import assert from "node:assert/strict";
import test from "node:test";
import { createPostgresStore } from "../src/store/postgres.js";
import {
  OWNER_TOKEN,
  closeServer,
  createReservedTask,
  databaseUrl,
  dropSchema,
  issueContributor,
  json,
  key,
  listen,
  openStore,
} from "./helpers.js";

test("postgres state persists across store reopen (claimed reservation still present)", async () => {
  const { store, schema } = await openStore();
  const first = await listen(store, { closeConnection: true });
  let taskId = "";
  let reservationId = "";
  try {
    const created = await createReservedTask(first.baseUrl);
    taskId = created.taskId;
    const contrib = await issueContributor(first.baseUrl);
    const claimed = await json(first.baseUrl, `/v1/tasks/${taskId}/claims`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: key("claim"),
      body: JSON.stringify({ termsVersion: created.termsVersion }),
    });
    assert.equal(claimed.status, 201, JSON.stringify(claimed.body));
    reservationId = (claimed.body as { reservation: { id: string } }).reservation.id;
  } finally {
    await closeServer(first.server);
    await store.close();
  }

  const reopened = await createPostgresStore(databaseUrl(), { schema });
  const second = await listen(reopened, { closeConnection: true });
  try {
    const health = await json(second.baseUrl, "/healthz");
    assert.equal(health.status, 200);
    const view = await json(second.baseUrl, `/v1/tasks/${taskId}`, { token: OWNER_TOKEN });
    assert.equal(view.status, 200);
    const task = (view.body as { task: { id: string; lifecycle: string; reservation: { id: string } | null } }).task;
    assert.equal(task.id, taskId);
    assert.equal(task.lifecycle, "claimed");
    assert.equal(task.reservation?.id, reservationId);
  } finally {
    await closeServer(second.server);
    await reopened.close();
    await dropSchema(schema);
  }
});
