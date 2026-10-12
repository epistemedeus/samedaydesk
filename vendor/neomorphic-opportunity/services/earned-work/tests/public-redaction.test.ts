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

const PAYOUT_SECRET = "test-payout-secret-do-not-leak";

test("public task list and status redact secrets; owner view keeps budget", async () => {
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
    await json(baseUrl, `/v1/tasks/${taskId}/verdicts`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("verdict"),
      body: JSON.stringify({ reservationId }),
    });
    await json(baseUrl, `/v1/tasks/${taskId}/accept`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("accept"),
      body: JSON.stringify({ reservationId }),
    });

    const publicTask = await json(baseUrl, `/v1/tasks/${taskId}`);
    assert.equal(publicTask.status, 200);
    const dumped = JSON.stringify(publicTask.body);
    assert.doesNotMatch(dumped, new RegExp(PAYOUT_SECRET));
    assert.doesNotMatch(dumped, /ew_ctr_/);
    assert.doesNotMatch(dumped, /payoutDestination/);
    assert.doesNotMatch(dumped, /"budget"/);
    assert.doesNotMatch(dumped, /"obligation"/);
    assert.equal((publicTask.body as { task: { provenance: string } }).task.provenance, "test");
    assert.ok(!("payoutState" in ((publicTask.body as { task: Record<string, unknown> }).task)));

    const list = await json(baseUrl, "/v1/tasks");
    assert.equal(list.status, 200);
    assert.doesNotMatch(JSON.stringify(list.body), new RegExp(PAYOUT_SECRET));
    const tasks = (list.body as { tasks: Array<{ id: string }> }).tasks;
    assert.equal(tasks.some((task) => task.id === taskId), false, "accepted tasks are not listed as open");

    const owner = await json(baseUrl, `/v1/tasks/${taskId}`, { token: OWNER_TOKEN });
    assert.equal(owner.status, 200);
    assert.equal((owner.body as { task: { budget: { amount: string } } }).task.budget.amount, "0.10");
    assert.doesNotMatch(JSON.stringify(owner.body), new RegExp(PAYOUT_SECRET));

    const obligation = await json(baseUrl, `/v1/tasks/${taskId}/obligation`, { token: OWNER_TOKEN });
    assert.equal(obligation.status, 200);
    assert.equal(
      (obligation.body as { obligation: { payoutDestination: string } }).obligation.payoutDestination,
      PAYOUT_SECRET,
    );

    const publicObligation = await json(baseUrl, `/v1/tasks/${taskId}/obligation`);
    assert.equal(publicObligation.status, 401);
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});
