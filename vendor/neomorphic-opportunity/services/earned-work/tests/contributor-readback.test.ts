import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { quoteIdent } from "../src/config.js";
import {
  OWNER_TOKEN,
  TEST_ARTIFACT,
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

async function driveToOwed(baseUrl: string, taskId: string, termsVersion: string, token: string) {
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
  const verdict = await json(baseUrl, `/v1/tasks/${taskId}/verdicts`, {
    method: "POST",
    token: OWNER_TOKEN,
    idempotencyKey: key("verdict"),
    body: JSON.stringify({ reservationId, outcome: "pass" }),
  });
  assert.equal(verdict.status, 201, JSON.stringify(verdict.body));
  const verdictId = (verdict.body as { verdict: { id: string } }).verdict.id;
  const accepted = await json(baseUrl, `/v1/tasks/${taskId}/accept`, {
    method: "POST",
    token: OWNER_TOKEN,
    idempotencyKey: key("accept"),
    body: JSON.stringify({ reservationId, verdictId }),
  });
  assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
  return {
    reservationId,
    verdictId,
    obligation: (accepted.body as { obligation: { id: string; verdictId: string; payoutState: string } }).obligation,
  };
}

test("contributor obligation readback is none, unknown, or owed; accepted is not owed", async () => {
  const { store, schema } = await openStore();
  const { server, baseUrl } = await listen(store);
  try {
    const { taskId, termsVersion } = await createReservedTask(baseUrl);
    const contrib = await issueContributor(baseUrl, { taskId });
    const other = await issueContributor(baseUrl, { contributorPublicId: "other-label" });

    const beforeClaim = await json(baseUrl, `/v1/tasks/${taskId}/contributor-obligation`, {
      token: contrib.token,
    });
    assert.equal(beforeClaim.status, 403, JSON.stringify(beforeClaim.body));
    assert.equal((beforeClaim.body as { error: { code: string } }).error.code, "forbidden");
    assert.notEqual((beforeClaim.body as { readback?: string }).readback, "owed");

    const claimed = await json(baseUrl, `/v1/tasks/${taskId}/claims`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: key("claim"),
      body: JSON.stringify({ termsVersion }),
    });
    assert.equal(claimed.status, 201);
    const none = await json(baseUrl, `/v1/tasks/${taskId}/contributor-obligation`, { token: contrib.token });
    assert.equal(none.status, 200, JSON.stringify(none.body));
    assert.equal((none.body as { readback: string; obligation: null; paid: boolean }).readback, "none");
    assert.equal((none.body as { obligation: null }).obligation, null);
    assert.equal((none.body as { paid: boolean }).paid, false);

    const reservationId = (claimed.body as { reservation: { id: string } }).reservation.id;
    const submitted = await json(baseUrl, `/v1/tasks/${taskId}/submissions`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: key("submit"),
      body: JSON.stringify({ reservationId, artifact: TEST_ARTIFACT }),
    });
    assert.equal(submitted.status, 201);
    const stillNone = await json(baseUrl, `/v1/tasks/${taskId}/contributor-obligation`, { token: contrib.token });
    assert.equal((stillNone.body as { readback: string }).readback, "none");

    const ownerObligation = await json(baseUrl, `/v1/tasks/${taskId}/obligation`, { token: contrib.token });
    assert.equal(ownerObligation.status, 401);
    const ownerPayout = await json(baseUrl, `/v1/tasks/${taskId}/payout`, { token: contrib.token });
    assert.equal(ownerPayout.status, 401);

    const unrelated = await json(baseUrl, `/v1/tasks/${taskId}/contributor-obligation`, { token: other.token });
    assert.equal(unrelated.status, 403);
    assert.equal((unrelated.body as { error: { code: string } }).error.code, "forbidden");

    const emptyAuth = await json(baseUrl, `/v1/tasks/${taskId}/contributor-obligation`);
    assert.equal(emptyAuth.status, 401);
    assert.notEqual((emptyAuth.body as { readback?: string }).readback, "owed");

    const malformed = await json(baseUrl, `/v1/tasks/${taskId}/contributor-obligation`, {
      token: "not-a-real-contributor-token",
    });
    assert.equal(malformed.status, 401);
    assert.notEqual((malformed.body as { readback?: string }).readback, "owed");

    const verdict = await json(baseUrl, `/v1/tasks/${taskId}/verdicts`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("verdict"),
      body: JSON.stringify({ reservationId, outcome: "pass" }),
    });
    const verdictId = (verdict.body as { verdict: { id: string } }).verdict.id;
    const accepted = await json(baseUrl, `/v1/tasks/${taskId}/accept`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("accept"),
      body: JSON.stringify({ reservationId, verdictId }),
    });
    assert.equal(accepted.status, 201);
    const owed = await json(baseUrl, `/v1/tasks/${taskId}/contributor-obligation`, { token: contrib.token });
    assert.equal(owed.status, 200, JSON.stringify(owed.body));
    const owedBody = owed.body as {
      readback: string;
      obligation: { id: string; verdictId: string; payoutState: string; payoutDestination: null };
      paid: boolean;
      transfer: null;
    };
    assert.equal(owedBody.readback, "owed");
    assert.equal(owedBody.obligation.verdictId, verdictId);
    assert.equal(owedBody.obligation.payoutState, "owed");
    assert.equal(owedBody.obligation.payoutDestination, null);
    assert.equal(owedBody.paid, false);
    assert.equal(owedBody.transfer, null);
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});

test("accepted lifecycle without an obligation row is none; store throw is unknown", async () => {
  const { store, schema } = await openStore();
  const { server, baseUrl } = await listen(store);
  const inspector = new pg.Client({ connectionString: databaseUrl() });
  await inspector.connect();
  try {
    const { taskId, termsVersion } = await createReservedTask(baseUrl);
    const contrib = await issueContributor(baseUrl, { taskId });
    await driveToOwed(baseUrl, taskId, termsVersion, contrib.token);

    await inspector.query(`SET search_path TO ${quoteIdent(schema)}`);
    await inspector.query("DELETE FROM earned_work_obligations WHERE task_id = $1", [taskId]);
    await inspector.query("UPDATE earned_work_tasks SET lifecycle = 'accepted', payout_state = 'none' WHERE id = $1", [
      taskId,
    ]);

    const acceptedAlone = await json(baseUrl, `/v1/tasks/${taskId}/contributor-obligation`, { token: contrib.token });
    assert.equal(acceptedAlone.status, 200, JSON.stringify(acceptedAlone.body));
    assert.equal((acceptedAlone.body as { readback: string; obligation: null }).readback, "none");
    assert.equal((acceptedAlone.body as { obligation: null }).obligation, null);

    const original = store.getContributorObligationReadback.bind(store);
    store.getContributorObligationReadback = async () => {
      throw new Error("induced store failure");
    };
    const unknown = await json(baseUrl, `/v1/tasks/${taskId}/contributor-obligation`, { token: contrib.token });
    assert.equal(unknown.status, 503, JSON.stringify(unknown.body));
    assert.equal((unknown.body as { readback: string }).readback, "unknown");
    assert.notEqual((unknown.body as { readback: string }).readback, "owed");
    store.getContributorObligationReadback = original;
  } finally {
    await inspector.end();
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});
