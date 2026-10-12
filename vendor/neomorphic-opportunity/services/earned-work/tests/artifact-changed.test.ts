import { createHash } from "node:crypto";
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

const OTHER_DIGEST = createHash("sha256").update("other-artifact-bytes\n", "utf8").digest("hex");

test("changed artifact digest vs bound submission is rejected", async () => {
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
    const submitted = await json(baseUrl, `/v1/tasks/${taskId}/submissions`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: key("submit"),
      body: JSON.stringify({ reservationId, artifact: TEST_ARTIFACT }),
    });
    assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
    assert.equal(
      (submitted.body as { submission: { artifact: { digestSha256: string } } }).submission.artifact
        .digestSha256,
      TEST_ARTIFACT.digestSha256,
    );

    const swapped = await json(baseUrl, `/v1/tasks/${taskId}/submissions`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: key("submit-swap"),
      body: JSON.stringify({
        reservationId,
        artifact: { ...TEST_ARTIFACT, digestSha256: OTHER_DIGEST, ref: "fixture:s275-other" },
      }),
    });
    assert.equal(swapped.status, 409);
    assert.equal((swapped.body as { error: { code: string } }).error.code, "duplicate_submission");

    const badVerdict = await json(baseUrl, `/v1/tasks/${taskId}/verdicts`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("verdict-mismatch"),
      body: JSON.stringify({ reservationId, artifactDigestSha256: OTHER_DIGEST }),
    });
    assert.equal(badVerdict.status, 409, JSON.stringify(badVerdict.body));
    assert.equal((badVerdict.body as { error: { code: string } }).error.code, "artifact_changed");

    const verified = await json(baseUrl, `/v1/tasks/${taskId}/verdicts`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("verdict"),
      body: JSON.stringify({ reservationId, artifactDigestSha256: TEST_ARTIFACT.digestSha256 }),
    });
    assert.equal(verified.status, 201, JSON.stringify(verified.body));
    assert.equal(
      (verified.body as { verdict: { artifactDigestSha256: string } }).verdict.artifactDigestSha256,
      TEST_ARTIFACT.digestSha256,
    );

    const badAccept = await json(baseUrl, `/v1/tasks/${taskId}/accept`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("accept-mismatch"),
      body: JSON.stringify({ reservationId, artifactDigestSha256: OTHER_DIGEST }),
    });
    assert.equal(badAccept.status, 409);
    assert.equal((badAccept.body as { error: { code: string } }).error.code, "artifact_changed");
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});
