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

async function submitReady(baseUrl: string, taskId: string, termsVersion: string, token: string) {
  const claimed = await json(baseUrl, `/v1/tasks/${taskId}/claims`, {
    method: "POST",
    token,
    idempotencyKey: key("claim"),
    body: JSON.stringify({ termsVersion }),
  });
  assert.equal(claimed.status, 201, JSON.stringify(claimed.body));
  const reservationId = (claimed.body as { reservation: { id: string } }).reservation.id;
  const submitted = await json(baseUrl, `/v1/tasks/${taskId}/submissions`, {
    method: "POST",
    token,
    idempotencyKey: key("submit"),
    body: JSON.stringify({ reservationId, artifact: TEST_ARTIFACT }),
  });
  assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
  return reservationId;
}

test("accept binds an explicit verdict id; later fail cannot select a previous pass", async () => {
  const frozen = new Date("2026-09-11T12:00:00.000Z");
  const { store, schema } = await openStore({ clock: () => frozen });
  const { server, baseUrl } = await listen(store);
  try {
    const { taskId, termsVersion } = await createReservedTask(baseUrl);
    const contrib = await issueContributor(baseUrl, { taskId });
    const reservationId = await submitReady(baseUrl, taskId, termsVersion, contrib.token);

    const pass = await json(baseUrl, `/v1/tasks/${taskId}/verdicts`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("verdict-pass"),
      body: JSON.stringify({ reservationId, outcome: "pass" }),
    });
    assert.equal(pass.status, 201, JSON.stringify(pass.body));
    const passVerdict = (
      pass.body as { verdict: { id: string; ordinal: number; outcome: string; createdAt: string }; task: { lifecycle: string } }
    ).verdict;
    assert.equal(passVerdict.ordinal, 1);
    assert.equal(passVerdict.outcome, "pass");
    assert.equal((pass.body as { task: { lifecycle: string } }).task.lifecycle, "verified");

    const fail = await json(baseUrl, `/v1/tasks/${taskId}/verdicts`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("verdict-fail"),
      body: JSON.stringify({ reservationId, outcome: "fail" }),
    });
    assert.equal(fail.status, 201, JSON.stringify(fail.body));
    const failVerdict = (
      fail.body as { verdict: { id: string; ordinal: number; outcome: string; createdAt: string }; task: { lifecycle: string } }
    ).verdict;
    assert.equal(failVerdict.ordinal, 2);
    assert.equal(failVerdict.createdAt, passVerdict.createdAt);
    assert.notEqual(failVerdict.id, passVerdict.id);
    assert.equal((fail.body as { task: { lifecycle: string } }).task.lifecycle, "submitted");

    const ambiguous = await json(baseUrl, `/v1/tasks/${taskId}/accept`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("accept-omit"),
      body: JSON.stringify({ reservationId }),
    });
    assert.equal(ambiguous.status, 409, JSON.stringify(ambiguous.body));
    assert.equal((ambiguous.body as { error: { code: string } }).error.code, "missing_verdict_id");

    const oldPass = await json(baseUrl, `/v1/tasks/${taskId}/accept`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("accept-old"),
      body: JSON.stringify({ reservationId, verdictId: passVerdict.id }),
    });
    assert.equal(oldPass.status, 409, JSON.stringify(oldPass.body));
    assert.equal((oldPass.body as { error: { code: string } }).error.code, "superseded_verdict");

    const failAccept = await json(baseUrl, `/v1/tasks/${taskId}/accept`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("accept-fail"),
      body: JSON.stringify({ reservationId, verdictId: failVerdict.id }),
    });
    assert.equal(failAccept.status, 409, JSON.stringify(failAccept.body));
    assert.equal((failAccept.body as { error: { code: string } }).error.code, "verdict_required");

    const after = await json(baseUrl, `/v1/tasks/${taskId}`, { token: OWNER_TOKEN });
    assert.equal((after.body as { task: { lifecycle: string; payoutState: string } }).task.lifecycle, "submitted");
    assert.equal((after.body as { task: { payoutState: string } }).task.payoutState, "none");
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});

test("equal-clock two pass verdicts require the immutable id; obligation stores that id", async () => {
  const frozen = new Date("2026-09-11T12:00:00.000Z");
  const { store, schema } = await openStore({ clock: () => frozen });
  const { server, baseUrl } = await listen(store);
  try {
    const { taskId, termsVersion } = await createReservedTask(baseUrl);
    const contrib = await issueContributor(baseUrl, { taskId });
    const reservationId = await submitReady(baseUrl, taskId, termsVersion, contrib.token);

    const first = await json(baseUrl, `/v1/tasks/${taskId}/verdicts`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("v1"),
      body: JSON.stringify({ reservationId, outcome: "pass" }),
    });
    const second = await json(baseUrl, `/v1/tasks/${taskId}/verdicts`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("v2"),
      body: JSON.stringify({ reservationId, outcome: "pass" }),
    });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    const firstId = (first.body as { verdict: { id: string; ordinal: number } }).verdict.id;
    const secondVerdict = (second.body as { verdict: { id: string; ordinal: number; createdAt: string } }).verdict;
    assert.equal(secondVerdict.ordinal, 2);
    assert.equal(secondVerdict.createdAt, (first.body as { verdict: { createdAt: string } }).verdict.createdAt);

    const omitted = await json(baseUrl, `/v1/tasks/${taskId}/accept`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("accept-omit"),
      body: JSON.stringify({ reservationId }),
    });
    assert.equal(omitted.status, 409);
    assert.equal((omitted.body as { error: { code: string } }).error.code, "missing_verdict_id");

    const previous = await json(baseUrl, `/v1/tasks/${taskId}/accept`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("accept-prev"),
      body: JSON.stringify({ reservationId, verdictId: firstId }),
    });
    assert.equal(previous.status, 409);
    assert.equal((previous.body as { error: { code: string } }).error.code, "superseded_verdict");

    const accepted = await json(baseUrl, `/v1/tasks/${taskId}/accept`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("accept-latest"),
      body: JSON.stringify({ reservationId, verdictId: secondVerdict.id }),
    });
    assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
    const obligation = (accepted.body as { obligation: { verdictId: string; payoutState: string; transfer: null } })
      .obligation;
    assert.equal(obligation.verdictId, secondVerdict.id);
    assert.equal(obligation.payoutState, "owed");
    assert.equal(obligation.transfer, null);

    const owner = await json(baseUrl, `/v1/tasks/${taskId}/obligation`, { token: OWNER_TOKEN });
    assert.equal((owner.body as { obligation: { verdictId: string } }).obligation.verdictId, secondVerdict.id);
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});
