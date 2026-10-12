import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadConfig, parseVerifierMode } from "../src/config.js";
import {
  createConfiguredVerifier,
  createReproductionDispatcher,
  loadReproductionRuntime,
  readBoundSpecDigest,
  REPRODUCTION_VERIFIER_VERSION,
} from "../src/reproduction-verifier.js";
import { defaultVerifier, DEFAULT_VERIFIER_PASS_REASON, DEFAULT_VERIFIER_VERSION } from "../src/verifier.js";
import { TEST_ARTIFACT, TEST_PROVENANCE_LABEL, databaseUrl } from "./helpers.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const e18Root = path.join(repoRoot, "experiments/wave5/e18");
const validPath = path.join(e18Root, "fixtures/submissions/valid-reproduction.json");
const alwaysAcceptPath = path.join(e18Root, "fixtures/submissions/always-accept.json");
const alwaysRejectPath = path.join(e18Root, "fixtures/submissions/always-reject.json");

const HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const WRONG_SPEC = "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

function fileArtifact(filePath: string, ref: string) {
  const buf = readFileSync(filePath);
  return {
    buf,
    artifact: {
      ref,
      digestSha256: createHash("sha256").update(buf).digest("hex"),
      mediaType: "application/json",
      bytes: buf.byteLength,
    },
  };
}

function freshBytes() {
  const template = JSON.parse(readFileSync(validPath, "utf8")) as Record<string, unknown>;
  template.id = "fresh-non-catalog-reproduction";
  const buf = Buffer.from(`${JSON.stringify(template, null, 2)}\n`);
  const catalogDigest = createHash("sha256").update(readFileSync(validPath)).digest("hex");
  const digest = createHash("sha256").update(buf).digest("hex");
  assert.notEqual(digest, catalogDigest);
  return {
    buf,
    artifact: {
      ref: "inline:reproduction-evidence",
      digestSha256: digest,
      mediaType: "application/json",
      bytes: buf.byteLength,
    },
  };
}

function terms(summary: string) {
  return {
    version: HASH,
    schemaVersion: 1,
    termsRevision: 1,
    summary,
    reward: { amount: "0.10", asset: "USDC", network: "base" },
    claimTtlSeconds: 60,
    maxArtifactBytes: 4096,
    allowedMediaTypes: ["text/plain", "application/json"],
    slotLimit: 1,
    createdAt: "2026-09-11T00:00:00.000Z",
  };
}

function runtime() {
  return loadReproductionRuntime({
    root: e18Root,
    specPath: path.join(e18Root, "fixtures/task.sds52-stale-outdir.json"),
    executable: path.join(e18Root, "bin/e18-repro.mjs"),
    timeoutMs: 15_000,
  });
}

test("default verifier pass is explicitly not a reproduction", () => {
  const result = defaultVerifier({
    artifact: TEST_ARTIFACT,
    terms: terms(TEST_PROVENANCE_LABEL),
    taskId: "tsk_meta",
    reservationId: "rsv_test",
    termsVersion: HASH,
  });
  assert.equal(result.outcome, "pass");
  assert.equal(result.verifierVersion, DEFAULT_VERIFIER_VERSION);
  assert.equal(result.reasons[0], DEFAULT_VERIFIER_PASS_REASON);
  assert.match(result.reasons[0] ?? "", /not a reproduction/);
});

test("EARNED_WORK_VERIFIER injection is explicit and refuses unknown modes", () => {
  assert.equal(parseVerifierMode(undefined), "default");
  assert.equal(parseVerifierMode("default"), "default");
  assert.equal(parseVerifierMode("reproduction"), "reproduction");
  assert.throws(() => parseVerifierMode("always-accept"), /default or reproduction/);
  assert.throws(
    () =>
      loadConfig({
        EARNED_WORK_OWNER_TOKEN: "dev-owner-token-s275",
        EARNED_WORK_DATABASE_URL: databaseUrl(),
        EARNED_WORK_VERIFIER: "reproduction",
      }),
    /EARNED_WORK_REPRODUCTION_ROOT/,
  );
  const cfg = loadConfig({
    EARNED_WORK_OWNER_TOKEN: "dev-owner-token-s275",
    EARNED_WORK_DATABASE_URL: databaseUrl(),
  });
  assert.equal(cfg.verifierMode, "default");
  assert.equal(cfg.reproduction, null);
  const hook = createConfiguredVerifier(cfg);
  const unbound = hook({
    artifact: TEST_ARTIFACT,
    terms: terms(TEST_PROVENANCE_LABEL),
    taskId: "tsk_default",
    reservationId: "rsv_default",
    termsVersion: HASH,
  });
  assert.equal(unbound.outcome, "pass");
  assert.equal(unbound.verifierVersion, DEFAULT_VERIFIER_VERSION);
  const boundDefault = hook({
    artifact: TEST_ARTIFACT,
    terms: terms(`e18.specDigest:${HASH}`),
    taskId: "tsk_bound_default",
    reservationId: "rsv_bound_default",
    termsVersion: HASH,
  });
  assert.equal(boundDefault.outcome, "fail");
  assert.match(boundDefault.reasons.join(" "), /cannot impersonate reproduction/);
});

test("reproduction dispatcher: received bytes pass; catalog hash without bytes fails", () => {
  const loaded = runtime();
  const hook = createReproductionDispatcher(loaded);
  assert.equal("catalog" in loaded, false);
  assert.equal(readBoundSpecDigest(`trial ${loaded.specDigest}`), null);
  assert.equal(readBoundSpecDigest(`e18.specDigest:${loaded.specDigest}`), loaded.specDigest);

  const unbound = hook({
    artifact: TEST_ARTIFACT,
    terms: terms(TEST_PROVENANCE_LABEL),
    taskId: "tsk_unbound",
    reservationId: "rsv_unbound",
    termsVersion: HASH,
  });
  assert.equal(unbound.outcome, "pass");
  assert.equal(unbound.verifierVersion, DEFAULT_VERIFIER_VERSION);
  assert.match(unbound.reasons.join(" "), /not a reproduction/);

  const valid = fileArtifact(validPath, "e18:fixtures/submissions/valid-reproduction.json");
  const boundSummary = `SDS52 historical workflow trial. e18.specDigest:${loaded.specDigest} e18.runtimeDigest:${loaded.runtimeDigest}`;

  const unboundRuntime = hook({
    artifact: valid.artifact,
    terms: terms(`SDS52 historical workflow trial. e18.specDigest:${loaded.specDigest}`),
    taskId: "tsk_unbound_runtime",
    reservationId: "rsv_unbound_runtime",
    termsVersion: HASH,
    evidenceBytes: valid.buf,
    contributorPublicId: "contrib-a",
  });
  assert.equal(unboundRuntime.outcome, "fail");
  assert.match(unboundRuntime.reasons.join(" "), /unbound runtime/);

  const wrongRuntime = hook({
    artifact: valid.artifact,
    terms: terms(
      `SDS52 historical workflow trial. e18.specDigest:${loaded.specDigest} e18.runtimeDigest:sha256:${"0".repeat(64)}`,
    ),
    taskId: "tsk_wrong_runtime",
    reservationId: "rsv_wrong_runtime",
    termsVersion: HASH,
    evidenceBytes: valid.buf,
    contributorPublicId: "contrib-a",
  });
  assert.equal(wrongRuntime.outcome, "fail");
  assert.match(wrongRuntime.reasons.join(" "), /verifier inputs changed/);

  const wrongTask = hook({
    artifact: valid.artifact,
    terms: terms(`wrong bound task. e18.specDigest:${WRONG_SPEC} e18.runtimeDigest:${loaded.runtimeDigest}`),
    taskId: "tsk_wrong",
    reservationId: "rsv_wrong",
    termsVersion: HASH,
    evidenceBytes: valid.buf,
    contributorPublicId: "contrib-a",
  });
  assert.equal(wrongTask.outcome, "fail");
  assert.equal(wrongTask.verifierVersion, REPRODUCTION_VERIFIER_VERSION);
  assert.match(wrongTask.reasons.join(" "), /wrong task/);

  const stolenHash = hook({
    artifact: valid.artifact,
    terms: terms(boundSummary),
    taskId: "tsk_bound",
    reservationId: "rsv_art",
    termsVersion: HASH,
  });
  assert.equal(stolenHash.outcome, "fail");
  assert.match(stolenHash.reasons.join(" "), /require received evidence/);

  const differentContent = hook({
    artifact: valid.artifact,
    terms: terms(boundSummary),
    taskId: "tsk_mismatch",
    reservationId: "rsv_mut",
    termsVersion: HASH,
    evidenceBytes: Buffer.from('{"schema":"neomorphic.wave5.e18.submission.v1","id":"mutated"}\n'),
    contributorPublicId: "contrib-a",
  });
  assert.equal(differentContent.outcome, "fail");
  assert.match(differentContent.reasons.join(" "), /does not match bound artifact/);

  const fresh = freshBytes();
  const freshPass = hook({
    artifact: { ...fresh.artifact, ref: "/tmp/should-never-be-executed.mjs" },
    terms: terms(boundSummary),
    taskId: "tsk_fresh",
    reservationId: "rsv_fresh",
    termsVersion: HASH,
    evidenceBytes: fresh.buf,
    contributorPublicId: "contrib-a",
  });
  assert.equal(freshPass.outcome, "pass", JSON.stringify(freshPass));
  assert.equal(freshPass.verifierVersion, REPRODUCTION_VERIFIER_VERSION);
  const reasons = freshPass.reasons.join(" ");
  assert.match(reasons, /false_delivery/);
  assert.match(reasons, /immutable spec/);
  assert.match(reasons, /advertised claim labels were not used as the oracle/);

  const alwaysAccept = fileArtifact(alwaysAcceptPath, "e18:fixtures/submissions/always-accept.json");
  const alwaysAcceptResult = hook({
    artifact: alwaysAccept.artifact,
    terms: terms(boundSummary),
    taskId: "tsk_accept",
    reservationId: "rsv_aa",
    termsVersion: HASH,
    evidenceBytes: alwaysAccept.buf,
    contributorPublicId: "contrib-a",
  });
  assert.equal(alwaysAcceptResult.outcome, "fail");
  assert.match(alwaysAcceptResult.reasons.join(" "), /always-accept/);

  const alwaysReject = fileArtifact(alwaysRejectPath, "e18:fixtures/submissions/always-reject.json");
  const alwaysRejectResult = hook({
    artifact: alwaysReject.artifact,
    terms: terms(boundSummary),
    taskId: "tsk_reject",
    reservationId: "rsv_ar",
    termsVersion: HASH,
    evidenceBytes: alwaysReject.buf,
    contributorPublicId: "contrib-a",
  });
  assert.equal(alwaysRejectResult.outcome, "fail");
  assert.match(alwaysRejectResult.reasons.join(" "), /always-reject/);
});
