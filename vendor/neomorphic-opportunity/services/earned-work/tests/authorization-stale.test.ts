import assert from "node:assert/strict";
import test from "node:test";
import { hashTermsVersion } from "@neomorphic/funded-task-terms/hash";
import {
  OWNER_TOKEN,
  TEST_ARTIFACT,
  TEST_PROVENANCE_LABEL,
  closeServer,
  createReservedTask,
  createTaskPayload,
  dropSchema,
  issueContributor,
  json,
  key,
  listen,
  openStore,
} from "./helpers.js";

async function driveToPass(
  baseUrl: string,
  taskId: string,
  termsVersion: string,
  contrib: { token: string },
) {
  const claimed = await json(baseUrl, `/v1/tasks/${taskId}/claims`, {
    method: "POST",
    token: contrib.token,
    idempotencyKey: key("claim"),
    body: JSON.stringify({ termsVersion }),
  });
  assert.equal(claimed.status, 201, JSON.stringify(claimed.body));
  const reservationId = (claimed.body as { reservation: { id: string } }).reservation.id;
  const submitted = await json(baseUrl, `/v1/tasks/${taskId}/submissions`, {
    method: "POST",
    token: contrib.token,
    idempotencyKey: key("submit"),
    body: JSON.stringify({ reservationId, artifact: TEST_ARTIFACT }),
  });
  assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
  const verified = await json(baseUrl, `/v1/tasks/${taskId}/verdicts`, {
    method: "POST",
    token: OWNER_TOKEN,
    idempotencyKey: key("verdict"),
    body: JSON.stringify({ reservationId }),
  });
  assert.equal(verified.status, 201, JSON.stringify(verified.body));
  return reservationId;
}

test("same-principal claim replay; different principal cannot read cached reservation", async () => {
  const { store, schema } = await openStore();
  const { server: serverA, baseUrl: urlA } = await listen(store);
  const { server: serverB, baseUrl: urlB } = await listen(store);
  try {
    const { taskId, termsVersion } = await createReservedTask(urlA);
    const a = await issueContributor(urlA, { taskId });
    const other = await createReservedTask(urlA, {
      title: "Other scoped task",
    });
    const b = await issueContributor(urlA, { taskId: other.taskId });
    const claimKey = "claim-shared-0001-test";
    const claimBody = JSON.stringify({ termsVersion });

    const first = await json(urlA, `/v1/tasks/${taskId}/claims`, {
      method: "POST",
      token: a.token,
      idempotencyKey: claimKey,
      body: claimBody,
    });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const reservationId = (first.body as { reservation: { id: string } }).reservation.id;

    const replay = await json(urlB, `/v1/tasks/${taskId}/claims`, {
      method: "POST",
      token: a.token,
      idempotencyKey: claimKey,
      body: claimBody,
    });
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.equal((replay.body as { reservation: { id: string } }).reservation.id, reservationId);

    const stolen = await json(urlB, `/v1/tasks/${taskId}/claims`, {
      method: "POST",
      token: b.token,
      idempotencyKey: claimKey,
      body: claimBody,
    });
    assert.equal(stolen.status, 403, JSON.stringify(stolen.body));
    assert.equal((stolen.body as { error: { code: string } }).error.code, "forbidden");
    assert.notEqual((stolen.body as { reservation?: { id: string } }).reservation?.id, reservationId);
  } finally {
    await closeServer(serverA);
    await closeServer(serverB);
    await store.close();
    await dropSchema(schema);
  }
});

test("same public ID with a different task scope cannot submit to the reservation", async () => {
  const { store, schema } = await openStore();
  const { server, baseUrl } = await listen(store);
  try {
    const { taskId, termsVersion } = await createReservedTask(baseUrl);
    const publicId = "test-shared-public-id";
    const a = await issueContributor(baseUrl, { contributorPublicId: publicId, taskId });
    const other = await createReservedTask(baseUrl, { title: "Scope other" });
    const scopedElsewhere = await issueContributor(baseUrl, {
      contributorPublicId: publicId,
      taskId: other.taskId,
    });

    const claimed = await json(baseUrl, `/v1/tasks/${taskId}/claims`, {
      method: "POST",
      token: a.token,
      idempotencyKey: key("claim"),
      body: JSON.stringify({ termsVersion }),
    });
    assert.equal(claimed.status, 201, JSON.stringify(claimed.body));
    const reservationId = (claimed.body as { reservation: { id: string } }).reservation.id;

    const rotated = await issueContributor(baseUrl, { contributorPublicId: publicId, taskId });
    const rotatedSubmit = await json(baseUrl, `/v1/tasks/${taskId}/submissions`, {
      method: "POST",
      token: rotated.token,
      idempotencyKey: key("submit-rotate"),
      body: JSON.stringify({ reservationId, artifact: TEST_ARTIFACT }),
    });
    assert.equal(rotatedSubmit.status, 403, JSON.stringify(rotatedSubmit.body));
    assert.equal((rotatedSubmit.body as { error: { code: string } }).error.code, "forbidden");

    const submitKey = key("submit-original");
    const originalSubmit = await json(baseUrl, `/v1/tasks/${taskId}/submissions`, {
      method: "POST",
      token: a.token,
      idempotencyKey: submitKey,
      body: JSON.stringify({ reservationId, artifact: TEST_ARTIFACT }),
    });
    assert.equal(originalSubmit.status, 201, JSON.stringify(originalSubmit.body));

    const replay = await json(baseUrl, `/v1/tasks/${taskId}/submissions`, {
      method: "POST",
      token: a.token,
      idempotencyKey: submitKey,
      body: JSON.stringify({ reservationId, artifact: TEST_ARTIFACT }),
    });
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.equal(
      (replay.body as { submission: { id: string } }).submission.id,
      (originalSubmit.body as { submission: { id: string } }).submission.id,
    );

    const crossSubmit = await json(baseUrl, `/v1/tasks/${taskId}/submissions`, {
      method: "POST",
      token: scopedElsewhere.token,
      idempotencyKey: key("submit-cross"),
      body: JSON.stringify({ reservationId, artifact: TEST_ARTIFACT }),
    });
    assert.equal(crossSubmit.status, 403, JSON.stringify(crossSubmit.body));
    assert.equal((crossSubmit.body as { error: { code: string } }).error.code, "forbidden");
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});

test("stale released reservation cannot create an obligation after a successor claim", async () => {
  const { store, schema } = await openStore();
  const { server: serverA, baseUrl: urlA } = await listen(store);
  const { server: serverB, baseUrl: urlB } = await listen(store);
  try {
    const { taskId, termsVersion: h1 } = await createReservedTask(urlA);
    const a = await issueContributor(urlA, { taskId });
    const reservationA = await driveToPass(urlA, taskId, h1, a);

    const rejected = await json(urlA, `/v1/tasks/${taskId}/reject`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("reject"),
      body: JSON.stringify({ reservationId: reservationA, reason: "supersede for H2" }),
    });
    assert.equal(rejected.status, 200, JSON.stringify(rejected.body));

    const revised = await json(urlA, `/v1/tasks/${taskId}/terms`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("terms-h2"),
      body: JSON.stringify({
        summary: `${TEST_PROVENANCE_LABEL} — H2`,
        reward: { amount: "0.10", asset: "USDC", network: "base" },
        claimTtlSeconds: 3600,
        maxArtifactBytes: 1024,
        allowedMediaTypes: ["text/plain", "application/json"],
        slotLimit: 1,
      }),
    });
    assert.equal(revised.status, 201, JSON.stringify(revised.body));
    const h2 = (revised.body as { task: { termsVersion: string } }).task.termsVersion;
    assert.notEqual(h2, h1);

    const reserved = await json(urlA, `/v1/tasks/${taskId}/funding/reserve`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("reserve-again"),
      body: "{}",
    });
    assert.equal(reserved.status, 200, JSON.stringify(reserved.body));

    const b = await issueContributor(urlA, { taskId });
    const claimedB = await json(urlB, `/v1/tasks/${taskId}/claims`, {
      method: "POST",
      token: b.token,
      idempotencyKey: key("claim-b"),
      body: JSON.stringify({ termsVersion: h2 }),
    });
    assert.equal(claimedB.status, 201, JSON.stringify(claimedB.body));
    const reservationB = (claimedB.body as { reservation: { id: string; status: string } }).reservation;
    assert.equal(reservationB.status, "active");

    const staleAccept = await json(urlB, `/v1/tasks/${taskId}/accept`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("accept-stale"),
      body: JSON.stringify({ reservationId: reservationA }),
    });
    assert.equal(staleAccept.status, 409, JSON.stringify(staleAccept.body));
    assert.equal((staleAccept.body as { obligation?: unknown }).obligation, undefined);

    const after = await json(urlB, `/v1/tasks/${taskId}`, { token: OWNER_TOKEN });
    const task = (after.body as { task: { lifecycle: string; payoutState: string; reservation: { id: string } } }).task;
    assert.equal(task.lifecycle, "claimed");
    assert.equal(task.payoutState, "none");
    assert.equal(task.reservation.id, reservationB.id);

    const obligation = await json(urlB, `/v1/tasks/${taskId}/obligation`, { token: OWNER_TOKEN });
    assert.equal(obligation.status, 404);
  } finally {
    await closeServer(serverA);
    await closeServer(serverB);
    await store.close();
    await dropSchema(schema);
  }
});

test("public termsDocument hashes to termsVersion and survives claim through owed", async () => {
  const { store, schema } = await openStore();
  const { server, baseUrl } = await listen(store);
  try {
    const payload = createTaskPayload({
      summary: "Listing blurb that must not replace hashed terms.summary",
      terms: {
        summary: "Exact agreed terms summary for hash binding",
        claimTtlSeconds: 3600,
        maxArtifactBytes: 1024,
        allowedMediaTypes: ["text/plain", "application/json"],
        slotLimit: 1,
      },
    });
    const created = await json(baseUrl, "/v1/tasks", {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("create"),
      body: JSON.stringify(payload),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const taskId = (created.body as { task: { id: string; termsVersion: string } }).task.id;
    const reserved = await json(baseUrl, `/v1/tasks/${taskId}/funding/reserve`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("reserve"),
      body: "{}",
    });
    assert.equal(reserved.status, 200);

    const pub = await json(baseUrl, `/v1/tasks/${taskId}`);
    assert.equal(pub.status, 200);
    const pubTask = (
      pub.body as {
        task: {
          summary: string;
          termsVersion: string;
          termsDocument: Record<string, unknown>;
        };
      }
    ).task;
    assert.equal(pubTask.summary, payload.summary);
    assert.equal(pubTask.termsDocument.summary, "Exact agreed terms summary for hash binding");
    assert.equal(pubTask.termsDocument.schemaVersion, 1);
    assert.equal(pubTask.termsDocument.termsRevision, 1);
    const recomputed = hashTermsVersion(pubTask.termsDocument);
    assert.equal(pubTask.termsVersion, recomputed);

    const byHash = await json(baseUrl, `/v1/tasks/${taskId}/terms/${encodeURIComponent(pubTask.termsVersion)}`);
    assert.equal(byHash.status, 200);
    assert.deepEqual((byHash.body as { termsDocument: unknown }).termsDocument, pubTask.termsDocument);

    const contrib = await issueContributor(baseUrl, { taskId });
    const reservationId = await driveToPass(baseUrl, taskId, pubTask.termsVersion, contrib);
    const accepted = await json(baseUrl, `/v1/tasks/${taskId}/accept`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("accept"),
      body: JSON.stringify({ reservationId }),
    });
    assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
    const obligation = (
      accepted.body as { obligation: { termsVersion: string; payoutState: string; transfer: null } }
    ).obligation;
    assert.equal(obligation.termsVersion, pubTask.termsVersion);
    assert.equal(obligation.payoutState, "owed");
    assert.equal(obligation.transfer, null);
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});

test("two-server restart still replays the authorized claim only", async () => {
  const { store, schema } = await openStore();
  const first = await listen(store);
  try {
    const { taskId, termsVersion } = await createReservedTask(first.baseUrl);
    const a = await issueContributor(first.baseUrl, { taskId });
    const claimKey = key("claim-restart");
    const body = JSON.stringify({ termsVersion });
    const claimed = await json(first.baseUrl, `/v1/tasks/${taskId}/claims`, {
      method: "POST",
      token: a.token,
      idempotencyKey: claimKey,
      body,
    });
    assert.equal(claimed.status, 201);
    const reservationId = (claimed.body as { reservation: { id: string } }).reservation.id;
    await closeServer(first.server);

    const restarted = await listen(store);
    try {
      const replay = await json(restarted.baseUrl, `/v1/tasks/${taskId}/claims`, {
        method: "POST",
        token: a.token,
        idempotencyKey: claimKey,
        body,
      });
      assert.equal(replay.status, 200);
      assert.equal((replay.body as { reservation: { id: string } }).reservation.id, reservationId);

      const b = await issueContributor(restarted.baseUrl, { taskId });
      const stolen = await json(restarted.baseUrl, `/v1/tasks/${taskId}/claims`, {
        method: "POST",
        token: b.token,
        idempotencyKey: claimKey,
        body,
      });
      assert.equal(stolen.status, 403);
    } finally {
      await closeServer(restarted.server);
    }
  } finally {
    try {
      await closeServer(first.server);
    } catch {
      // already closed
    }
    await store.close();
    await dropSchema(schema);
  }
});
