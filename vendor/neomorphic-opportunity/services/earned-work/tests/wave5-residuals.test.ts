import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { hashTermsVersion } from "@neomorphic/funded-task-terms/hash";
import { KERNEL_CONTRACT, KERNEL_CONTRACT_ID } from "../src/contract.js";
import { EARNED_WORK_TERMS_SCHEMA, hashEarnedWorkTerms } from "../src/terms-version.js";
import {
  HYPOTHESIS_REWARD,
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

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function driveToSubmitted(baseUrl: string) {
  const { taskId, termsVersion } = await createReservedTask(baseUrl);
  const contrib = await issueContributor(baseUrl, { taskId });
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
  return { taskId, termsVersion, contrib, reservationId };
}

test("published kernel contract is the current interface, not a runtime hash pin", () => {
  assert.equal(KERNEL_CONTRACT_ID, "neomorphic.earned-work.kernel.v1");
  assert.equal(KERNEL_CONTRACT.payout.emptyProjectionIsNotOwed, true);
  assert.equal(KERNEL_CONTRACT.payout.owedRequiresObligationId, true);
  assert.equal(KERNEL_CONTRACT.terms.unlikeSchemasAreNotEqual, true);
  assert.equal(KERNEL_CONTRACT.correctionPolicy.disclosedZeroStaysZero, true);
  const exported = JSON.parse(
    readFileSync(path.join(repoRoot, "services/earned-work/contract/kernel-v1.json"), "utf8"),
  ) as { id: string };
  assert.equal(exported.id, KERNEL_CONTRACT_ID);
});

test("F17 golden hash is not the F01 earned-work terms hash (unlike schemas)", () => {
  const golden = JSON.parse(
    readFileSync(path.join(repoRoot, "packs/funded-task-terms/fixtures/golden/complete.terms.json"), "utf8"),
  ) as Record<string, unknown>;
  const f17 = hashTermsVersion(golden);
  const f01 = hashEarnedWorkTerms("tsk_unlike", 1, {
    summary: "s",
    reward: { amount: "0.10", asset: "USDC", network: "base" },
    claimTtlSeconds: 60,
    maxArtifactBytes: 1024,
    allowedMediaTypes: ["text/plain"],
    slotLimit: 1,
  });
  assert.match(f17, /^sha256:[0-9a-f]{64}$/);
  assert.match(f01, /^sha256:[0-9a-f]{64}$/);
  assert.notEqual(f17, f01);
  assert.equal(golden.schema, "neomorphic.funded-task-terms.v1");
  assert.equal(EARNED_WORK_TERMS_SCHEMA, "neomorphic.earned-work.terms.v1");
  assert.notEqual(golden.schema, EARNED_WORK_TERMS_SCHEMA);
});

test("GET payout before accept is not owed; fail verdict cannot be accepted", async () => {
  const { store, schema } = await openStore();
  const { server, baseUrl } = await listen(store);
  try {
    const { taskId, contrib, reservationId } = await driveToSubmitted(baseUrl);

    const empty = await json(baseUrl, `/v1/tasks/${taskId}/payout`, { token: OWNER_TOKEN });
    assert.equal(empty.status, 200, JSON.stringify(empty.body));
    const emptyBody = empty.body as {
      payoutState: string;
      obligationId: string | null;
      reconciliation: { owed: boolean; sale: boolean; obligationId: string | null };
    };
    assert.equal(emptyBody.payoutState, "none");
    assert.equal(emptyBody.obligationId, null);
    assert.equal(emptyBody.reconciliation.owed, false);
    assert.equal(emptyBody.reconciliation.sale, false);
    assert.equal(emptyBody.reconciliation.obligationId, null);

    const missingObligation = await json(baseUrl, `/v1/tasks/${taskId}/obligation`, { token: OWNER_TOKEN });
    assert.equal(missingObligation.status, 404);
    assert.equal((missingObligation.body as { error: { code: string } }).error.code, "not_found");

    const failed = await json(baseUrl, `/v1/tasks/${taskId}/verdicts`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("verdict-fail"),
      body: JSON.stringify({ reservationId, outcome: "fail" }),
    });
    assert.equal(failed.status, 201, JSON.stringify(failed.body));
    assert.equal((failed.body as { verdict: { outcome: string } }).verdict.outcome, "fail");
    assert.notEqual((failed.body as { task: { lifecycle: string } }).task.lifecycle, "verified");

    const accepted = await json(baseUrl, `/v1/tasks/${taskId}/accept`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("accept-fail"),
      body: JSON.stringify({ reservationId }),
    });
    assert.equal(accepted.status, 409, JSON.stringify(accepted.body));
    assert.equal((accepted.body as { error: { code: string } }).error.code, "verdict_required");

    const stillEmpty = await json(baseUrl, `/v1/tasks/${taskId}/payout`, { token: OWNER_TOKEN });
    assert.equal((stillEmpty.body as { payoutState: string }).payoutState, "none");
    assert.equal((stillEmpty.body as { reconciliation: { owed: boolean } }).reconciliation.owed, false);
    void contrib;
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});

test("disclosed maxRevisions 0 stays 0; omitted policy defaults to 1", async () => {
  const { store, schema } = await openStore();
  const { server, baseUrl } = await listen(store);
  try {
    const zero = await json(baseUrl, "/v1/tasks", {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("create-zero"),
      body: JSON.stringify(createTaskPayload({ correctionPolicy: { maxRevisions: 0 } })),
    });
    assert.equal(zero.status, 201, JSON.stringify(zero.body));
    const zeroTask = (zero.body as { task: { id: string; correctionPolicy: { maxRevisions: number } } }).task;
    assert.equal(zeroTask.correctionPolicy.maxRevisions, 0);

    await json(baseUrl, `/v1/tasks/${zeroTask.id}/funding/reserve`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("reserve-zero"),
      body: "{}",
    });
    const blocked = await json(baseUrl, `/v1/tasks/${zeroTask.id}/terms`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("terms-zero"),
      body: JSON.stringify({
        summary: `${TEST_PROVENANCE_LABEL} revision refused`,
        reward: HYPOTHESIS_REWARD,
      }),
    });
    assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
    assert.equal((blocked.body as { error: { code: string } }).error.code, "correction_limit");
    assert.match((blocked.body as { error: { message: string } }).error.message, /0/);

    const omitted = await json(baseUrl, "/v1/tasks", {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("create-default"),
      body: JSON.stringify(createTaskPayload({ correctionPolicy: undefined })),
    });
    assert.equal(omitted.status, 201, JSON.stringify(omitted.body));
    assert.equal(
      (omitted.body as { task: { correctionPolicy: { maxRevisions: number } } }).task.correctionPolicy.maxRevisions,
      1,
    );
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});

test("public claimable:false is not a claim; fresh key after committed claim is already_claimed", async () => {
  const { store, schema } = await openStore();
  const { server, baseUrl } = await listen(store);
  try {
    const { taskId, termsVersion } = await createReservedTask(baseUrl);
    const contrib = await issueContributor(baseUrl, { taskId });
    const claimKey = key("claim-committed");
    const claimed = await json(baseUrl, `/v1/tasks/${taskId}/claims`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: claimKey,
      body: JSON.stringify({ termsVersion }),
    });
    assert.equal(claimed.status, 201, JSON.stringify(claimed.body));
    const reservationId = (claimed.body as { reservation: { id: string } }).reservation.id;

    const publicView = await json(baseUrl, `/v1/tasks/${taskId}`);
    assert.equal(publicView.status, 200);
    const publicTask = (publicView.body as { task: Record<string, unknown> }).task;
    assert.equal(publicTask.claimable, false);
    assert.equal("reservation" in publicTask, false);
    assert.equal(publicTask.claimable === false && publicTask.reservation == null, true);

    const replay = await json(baseUrl, `/v1/tasks/${taskId}/claims`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: claimKey,
      body: JSON.stringify({ termsVersion }),
    });
    assert.equal(replay.status, 200);
    assert.equal((replay.body as { reservation: { id: string } }).reservation.id, reservationId);

    const freshKey = await json(baseUrl, `/v1/tasks/${taskId}/claims`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: key("claim-fresh-after-commit"),
      body: JSON.stringify({ termsVersion }),
    });
    assert.equal(freshKey.status, 409, JSON.stringify(freshKey.body));
    assert.equal((freshKey.body as { error: { code: string } }).error.code, "already_claimed");

    const other = await issueContributor(baseUrl, { taskId, contributorPublicId: "other-public" });
    const elsewhere = await json(baseUrl, `/v1/tasks/${taskId}/claims`, {
      method: "POST",
      token: other.token,
      idempotencyKey: key("claim-other"),
      body: JSON.stringify({ termsVersion }),
    });
    assert.equal(elsewhere.status, 409);
    assert.equal((elsewhere.body as { error: { code: string } }).error.code, "reserved_elsewhere");
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});
