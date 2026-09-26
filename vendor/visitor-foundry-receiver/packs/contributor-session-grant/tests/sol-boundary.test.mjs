import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ERROR_CODE, OUTCOME, SCHEMA } from "../src/constants.mjs";
import { GrantError } from "../src/errors.mjs";
import { requestJson } from "../src/http.mjs";
import { tokenFingerprint } from "../src/hash.mjs";
import { reconcileClaimWithSessionFile } from "../src/contributor.mjs";
import { envWithoutOwner, runCli, tempDir, writeOwnerTokenFile } from "./helpers.mjs";
import { missingKernelAcceptance } from "../src/missing-acceptance.mjs";

test("F1: HTTP 503 and redirect after dispatch are unknown, not refused", async () => {
  await assert.rejects(
    () =>
      requestJson({
        baseUrl: "http://127.0.0.1:9",
        method: "POST",
        path: "/v1/contributor-tokens",
        fetchImpl: async () =>
          new Response(JSON.stringify({ error: { code: "unavailable" } }), { status: 503 }),
      }),
    (error) =>
      error instanceof GrantError &&
      error.code === ERROR_CODE.UNKNOWN_OUTCOME &&
      error.outcome === OUTCOME.UNKNOWN,
  );
  await assert.rejects(
    () =>
      requestJson({
        baseUrl: "http://127.0.0.1:9",
        method: "POST",
        path: "/v1/contributor-tokens",
        fetchImpl: async () => new Response("", { status: 302, headers: { location: "/elsewhere" } }),
      }),
    (error) => error.code === ERROR_CODE.UNKNOWN_OUTCOME && error.outcome === OUTCOME.UNKNOWN,
  );
  await assert.rejects(
    () =>
      requestJson({
        baseUrl: "http://127.0.0.1:9",
        method: "POST",
        path: "/v1/contributor-tokens",
        fetchImpl: async () =>
          new Response(JSON.stringify({ error: { code: "unauthorized" } }), { status: 401 }),
      }),
    (error) => error.outcome === OUTCOME.REFUSED && error.status === 401,
  );
});

test("F2: reconcile requires stored attempt; foreign credential and changed target make zero HTTP", async () => {
  const root = tempDir("csg-f2-");
  const tokenA = "ew_ctr_alice_token_value";
  const tokenB = "ew_ctr_bob_token_value";
  const tokenFileA = join(root, "a.token");
  const tokenFileB = join(root, "b.token");
  writeFileSync(tokenFileA, `${tokenA}\n`, { mode: 0o600 });
  writeFileSync(tokenFileB, `${tokenB}\n`, { mode: 0o600 });
  const stateDir = join(root, "state");
  mkdirSync(stateDir, { recursive: true });

  let posts = 0;
  const adapter = {
    evidenceClass: "fixture",
    async claim() {
      posts += 1;
      return { status: 201, body: { reservation: { id: "rsv_1", status: "active" } } };
    },
  };

  const cleanEnv = envWithoutOwner();
  await assert.rejects(
    () =>
      reconcileClaimWithSessionFile({
        adapter,
        tokenFile: tokenFileA,
        stateDir,
        taskId: "tsk_1",
        termsVersion: `sha256:${"a".repeat(64)}`,
        env: cleanEnv,
      }),
    (error) => error.code === ERROR_CODE.MISSING_CLAIM_ATTEMPT,
  );
  assert.equal(posts, 0);

  writeFileSync(
    join(stateDir, "contributor-state.json"),
    `${JSON.stringify({
      schema: SCHEMA.contributorState,
      role: "contributor",
      command: "claim",
      outcome: OUTCOME.UNKNOWN,
      taskId: "tsk_1",
      termsVersion: `sha256:${"a".repeat(64)}`,
      claimIdempotencyKey: "claim-key-original",
      tokenHash: "deadbeef",
      tokenFingerprint: tokenFingerprint(tokenA),
      tokenFile: tokenFileA,
      reservationId: null,
    })}\n`,
  );

  await assert.rejects(
    () =>
      reconcileClaimWithSessionFile({
        adapter,
        tokenFile: tokenFileB,
        stateDir,
        env: cleanEnv,
      }),
    (error) => error.code === ERROR_CODE.FOREIGN_CREDENTIAL,
  );
  assert.equal(posts, 0);

  await assert.rejects(
    () =>
      reconcileClaimWithSessionFile({
        adapter,
        tokenFile: tokenFileA,
        stateDir,
        taskId: "tsk_other",
        env: cleanEnv,
      }),
    (error) => error.code === ERROR_CODE.TARGET_CHANGED,
  );
  assert.equal(posts, 0);

  await assert.rejects(
    () =>
      reconcileClaimWithSessionFile({
        adapter,
        tokenFile: tokenFileA,
        stateDir,
        claimKey: "different-key",
        env: cleanEnv,
      }),
    (error) => error.code === ERROR_CODE.TARGET_CHANGED,
  );
  assert.equal(posts, 0);
});

test("F1 commit-then-503 is not booted against PR109", () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  const missing = missingKernelAcceptance(repoRoot);
  assert.equal(missing.accepted, false);
  assert.equal(missing.booted, false);
  assert.equal(missing.contacted, false);
  assert.equal(missing.sha, "c4048401fa42e1272e61edf983afbf39a3e04555");
});
