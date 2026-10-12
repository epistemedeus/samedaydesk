import assert from "node:assert/strict";
import test from "node:test";
import {
  HYPOTHESIS_REWARD,
  OWNER_TOKEN,
  TEST_ARTIFACT,
  TEST_PROVENANCE_LABEL,
  closeServer,
  createReservedTask,
  dropSchema,
  issueContributor,
  json,
  key,
  listen,
  openStore,
} from "./helpers.js";

test("changed terms: old reservation cannot submit; new termsVersion is required to claim", async () => {
  const { store, schema } = await openStore();
  const { server, baseUrl } = await listen(store);
  try {
    const { taskId, termsVersion: v1 } = await createReservedTask(baseUrl);
    const contrib = await issueContributor(baseUrl);
    const claimed = await json(baseUrl, `/v1/tasks/${taskId}/claims`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: key("claim"),
      body: JSON.stringify({ termsVersion: v1 }),
    });
    assert.equal(claimed.status, 201, JSON.stringify(claimed.body));
    const reservationId = (claimed.body as { reservation: { id: string } }).reservation.id;

    const blockedTerms = await json(baseUrl, `/v1/tasks/${taskId}/terms`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("terms-blocked"),
      body: JSON.stringify({
        summary: TEST_PROVENANCE_LABEL,
        reward: HYPOTHESIS_REWARD,
      }),
    });
    assert.equal(blockedTerms.status, 409);

    const rejected = await json(baseUrl, `/v1/tasks/${taskId}/reject`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("reject"),
      body: JSON.stringify({ reservationId, reason: "test provenance — correction path" }),
    });
    assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
    assert.equal((rejected.body as { task: { lifecycle: string } }).task.lifecycle, "rejected");

    const terms = await json(baseUrl, `/v1/tasks/${taskId}/terms`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("terms"),
      body: JSON.stringify({
        summary: `${TEST_PROVENANCE_LABEL} — revised termsVersion`,
        reward: HYPOTHESIS_REWARD,
        claimTtlSeconds: 3600,
        maxArtifactBytes: 2048,
        allowedMediaTypes: ["text/plain"],
        slotLimit: 1,
      }),
    });
    assert.equal(terms.status, 201, JSON.stringify(terms.body));
    const v2 = (terms.body as { task: { termsVersion: string; lifecycle: string } }).task.termsVersion;
    assert.match(v2, /^sha256:[0-9a-f]{64}$/);
    assert.notEqual(v2, v1);
    assert.equal((terms.body as { task: { lifecycle: string } }).task.lifecycle, "open");

    const late = await json(baseUrl, `/v1/tasks/${taskId}/submissions`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: key("late-old-terms"),
      body: JSON.stringify({ reservationId, artifact: TEST_ARTIFACT }),
    });
    assert.equal(late.status, 409, JSON.stringify(late.body));
    assert.equal((late.body as { error: { code: string } }).error.code, "terms_changed");

    const staleClaim = await json(baseUrl, `/v1/tasks/${taskId}/claims`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: key("claim-v1"),
      body: JSON.stringify({ termsVersion: v1 }),
    });
    assert.equal(staleClaim.status, 409);
    assert.equal((staleClaim.body as { error: { code: string } }).error.code, "terms_changed");

    const reserved = await json(baseUrl, `/v1/tasks/${taskId}/funding/reserve`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("reserve-2"),
      body: "{}",
    });
    assert.equal(reserved.status, 200);

    const fresh = await json(baseUrl, `/v1/tasks/${taskId}/claims`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: key("claim-v2"),
      body: JSON.stringify({ termsVersion: v2 }),
    });
    assert.equal(fresh.status, 201, JSON.stringify(fresh.body));
    assert.equal((fresh.body as { reservation: { termsVersion: string } }).reservation.termsVersion, v2);

    const occupyingBlocked = await json(baseUrl, `/v1/tasks/${taskId}/terms`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("terms-v3-blocked-occupy"),
      body: JSON.stringify({
        summary: `${TEST_PROVENANCE_LABEL} — second correction`,
        reward: HYPOTHESIS_REWARD,
      }),
    });
    assert.equal(occupyingBlocked.status, 409);

    const rsv2 = (fresh.body as { reservation: { id: string } }).reservation.id;
    const released = await json(baseUrl, `/v1/tasks/${taskId}/reject`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("reject-v2"),
      body: JSON.stringify({ reservationId: rsv2, reason: "test provenance — second correction attempt" }),
    });
    assert.equal(released.status, 200);

    const secondCorrection = await json(baseUrl, `/v1/tasks/${taskId}/terms`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("terms-v3"),
      body: JSON.stringify({
        summary: `${TEST_PROVENANCE_LABEL} — forbidden second correction`,
        reward: HYPOTHESIS_REWARD,
      }),
    });
    assert.equal(secondCorrection.status, 409, JSON.stringify(secondCorrection.body));
    assert.equal((secondCorrection.body as { error: { code: string } }).error.code, "correction_limit");
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});
