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

test("observer and contributor cannot owner-accept or authorize payout", async () => {
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
    await json(baseUrl, `/v1/tasks/${taskId}/submissions`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: key("submit"),
      body: JSON.stringify({ reservationId, artifact: TEST_ARTIFACT }),
    });

    const observerAccept = await json(baseUrl, `/v1/tasks/${taskId}/accept`, {
      method: "POST",
      idempotencyKey: key("observer-accept"),
      body: JSON.stringify({ reservationId }),
    });
    assert.equal(observerAccept.status, 401);
    assert.equal((observerAccept.body as { error: { code: string } }).error.code, "unauthorized");

    const contribAccept = await json(baseUrl, `/v1/tasks/${taskId}/accept`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: key("contrib-accept"),
      body: JSON.stringify({ reservationId }),
    });
    assert.equal(contribAccept.status, 401);
    assert.equal((contribAccept.body as { error: { code: string } }).error.code, "unauthorized");

    const contribPayout = await json(baseUrl, `/v1/tasks/${taskId}/payout`, { token: contrib.token });
    assert.equal(contribPayout.status, 401);
    assert.equal((contribPayout.body as { error: { code: string } }).error.code, "unauthorized");

    const contribVerdict = await json(baseUrl, `/v1/tasks/${taskId}/verdicts`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: key("contrib-verdict"),
      body: JSON.stringify({ reservationId }),
    });
    assert.equal(contribVerdict.status, 401);
    assert.equal((contribVerdict.body as { error: { code: string } }).error.code, "unauthorized");

    const contribObligation = await json(baseUrl, `/v1/tasks/${taskId}/obligation`, {
      token: contrib.token,
    });
    assert.equal(contribObligation.status, 401);
    assert.equal((contribObligation.body as { error: { code: string } }).error.code, "unauthorized");

    const observerPayout = await json(baseUrl, `/v1/tasks/${taskId}/payout`);
    assert.equal(observerPayout.status, 401);
    assert.equal((observerPayout.body as { error: { code: string } }).error.code, "unauthorized");

    const forged = await json(baseUrl, `/v1/tasks/${taskId}/accept`, {
      method: "POST",
      token: "forged-owner-not-the-env-token",
      idempotencyKey: key("forged-accept"),
      body: JSON.stringify({ reservationId }),
    });
    assert.equal(forged.status, 401);
    assert.equal((forged.body as { error: { code: string } }).error.code, "unauthorized");

    const contribCreate = await json(baseUrl, "/v1/tasks", {
      method: "POST",
      token: contrib.token,
      idempotencyKey: key("contrib-create"),
      body: JSON.stringify({
        title: "forged create",
        summary: "test provenance — contributor must not create owner tasks",
        provenance: "test",
        reward: { amount: "0.10", asset: "USDC", network: "base" },
        budget: { amount: "0.10", asset: "USDC", network: "base" },
      }),
    });
    assert.equal(contribCreate.status, 401);
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});
