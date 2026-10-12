import assert from "node:assert/strict";
import test from "node:test";
import { defaultVerifier, DEFAULT_VERIFIER_VERSION } from "../src/verifier.js";
import { TEST_ARTIFACT, TEST_PROVENANCE_LABEL } from "./helpers.js";

const HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const terms = {
  version: HASH,
  schemaVersion: 1,
  termsRevision: 1,
  summary: TEST_PROVENANCE_LABEL,
  reward: { amount: "0.10", asset: "USDC", network: "base" },
  claimTtlSeconds: 60,
  maxArtifactBytes: 1024,
  allowedMediaTypes: ["text/plain"],
  slotLimit: 1,
  createdAt: "2026-09-11T00:00:00.000Z",
};

test("default verifier passes in-bounds metadata and never requires fetching the ref", () => {
  const result = defaultVerifier({
    artifact: TEST_ARTIFACT,
    terms,
    taskId: "tsk_test",
    reservationId: "rsv_test",
    termsVersion: HASH,
  });
  assert.equal(result.outcome, "pass");
  assert.equal(result.verifierVersion, DEFAULT_VERIFIER_VERSION);
  assert.match(result.reasons.join(" "), /not a reproduction/);
  assert.match(TEST_ARTIFACT.ref, /^fixture:/);
});

test("default verifier fails digest/media/bytes bound violations", () => {
  const badDigest = defaultVerifier({
    artifact: { ...TEST_ARTIFACT, digestSha256: "deadbeef" },
    terms,
    taskId: "tsk_test",
    reservationId: "rsv_test",
    termsVersion: HASH,
  });
  assert.equal(badDigest.outcome, "fail");

  const oversize = defaultVerifier({
    artifact: { ...TEST_ARTIFACT, bytes: 2048 },
    terms,
    taskId: "tsk_test",
    reservationId: "rsv_test",
    termsVersion: HASH,
  });
  assert.equal(oversize.outcome, "fail");
  assert.match(oversize.reasons.join(" "), /maxArtifactBytes/);

  const media = defaultVerifier({
    artifact: { ...TEST_ARTIFACT, mediaType: "image/png" },
    terms,
    taskId: "tsk_test",
    reservationId: "rsv_test",
    termsVersion: HASH,
  });
  assert.equal(media.outcome, "fail");
});

test("empty allowlist is needs_review, not a boolean default", () => {
  const result = defaultVerifier({
    artifact: TEST_ARTIFACT,
    terms: { ...terms, allowedMediaTypes: [] },
    taskId: "tsk_test",
    reservationId: "rsv_test",
    termsVersion: HASH,
  });
  assert.equal(result.outcome, "needs_review");
});
