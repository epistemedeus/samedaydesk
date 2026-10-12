import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { hashTermsVersion } from "@neomorphic/funded-task-terms/hash";
import {
  F17_GOLDEN_TERMS_VERSION,
  hashEarnedWorkTerms,
  parseClaimTermsVersion,
  TERMS_VERSION_RE,
} from "../src/terms-version.js";
import { ApiError } from "../src/errors.js";
import {
  OWNER_TOKEN,
  closeServer,
  createReservedTask,
  dropSchema,
  issueContributor,
  json,
  key,
  listen,
  openStore,
} from "./helpers.js";

const goldenPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../packs/funded-task-terms/fixtures/golden/complete.terms.json",
);

test("F01 hashes terms with F17 hashTermsVersion; golden fixture matches", () => {
  const golden = JSON.parse(readFileSync(goldenPath, "utf8")) as Record<string, unknown>;
  assert.equal(hashTermsVersion(golden), F17_GOLDEN_TERMS_VERSION);
  assert.equal(golden.termsVersion, F17_GOLDEN_TERMS_VERSION);
  assert.match(hashEarnedWorkTerms("tsk_x", 1, {
    summary: "s",
    reward: { amount: "0.10", asset: "USDC", network: "base" },
    claimTtlSeconds: 60,
    maxArtifactBytes: 1024,
    allowedMediaTypes: ["text/plain"],
    slotLimit: 1,
  }), TERMS_VERSION_RE);
});

test("creating a task writes a content-hash termsVersion, not an integer", async () => {
  const { store, schema } = await openStore();
  const { server, baseUrl } = await listen(store);
  try {
    const { taskId, termsVersion } = await createReservedTask(baseUrl);
    assert.match(termsVersion, TERMS_VERSION_RE);
    const view = await json(baseUrl, `/v1/tasks/${taskId}`, { token: OWNER_TOKEN });
    const task = (view.body as { task: { termsVersion: string; terms: { version: string; termsRevision: number; schemaVersion: number } } }).task;
    assert.equal(task.termsVersion, termsVersion);
    assert.equal(task.terms.version, termsVersion);
    assert.equal(task.terms.termsRevision, 1);
    assert.equal(task.terms.schemaVersion, 1);
    assert.equal(typeof task.termsVersion, "string");
    assert.notEqual(typeof task.termsVersion, "number");
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});

test("integer termsVersion is rejected on claim (no dual public key)", async () => {
  const { store, schema } = await openStore();
  const { server, baseUrl } = await listen(store);
  try {
    const { taskId } = await createReservedTask(baseUrl);
    const contrib = await issueContributor(baseUrl);
    const integerClaim = await json(baseUrl, `/v1/tasks/${taskId}/claims`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: key("claim-int"),
      body: JSON.stringify({ termsVersion: 1 }),
    });
    assert.equal(integerClaim.status, 400, JSON.stringify(integerClaim.body));
    assert.equal((integerClaim.body as { error: { code: string } }).error.code, "invalid_input");
    assert.match((integerClaim.body as { error: { message: string } }).error.message, /integer|sha256/i);
    assert.throws(
      () => parseClaimTermsVersion(1),
      (err: unknown) => err instanceof ApiError && err.status === 400 && err.code === "invalid_input",
    );
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});
