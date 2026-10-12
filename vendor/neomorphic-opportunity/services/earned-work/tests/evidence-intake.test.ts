import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import pg from "pg";
import { quoteIdent } from "../src/config.js";
import { decodeEvidenceBase64, REPRODUCTION_EVIDENCE_MAX_BYTES } from "../src/evidence.js";
import {
  createReproductionDispatcher,
  loadReproductionRuntime,
  REPRODUCTION_VERIFIER_VERSION,
} from "../src/reproduction-verifier.js";
import {
  OWNER_TOKEN,
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

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const e18Root = path.join(repoRoot, "experiments/wave5/e18");
const validPath = path.join(e18Root, "fixtures/submissions/valid-reproduction.json");

function runtime() {
  return loadReproductionRuntime({
    root: e18Root,
    specPath: path.join(e18Root, "fixtures/task.sds52-stale-outdir.json"),
    executable: path.join(e18Root, "bin/e18-repro.mjs"),
    timeoutMs: 15_000,
  });
}

function evidenceFrom(buf: Buffer, ref = "inline:reproduction-evidence") {
  return {
    artifact: {
      ref,
      digestSha256: createHash("sha256").update(buf).digest("hex"),
      mediaType: "application/json",
      bytes: buf.byteLength,
    },
    evidenceBase64: buf.toString("base64"),
  };
}

function freshEvidence() {
  const template = JSON.parse(readFileSync(validPath, "utf8")) as Record<string, unknown>;
  template.id = `fresh-${randomBytes(6).toString("hex")}`;
  const buf = Buffer.from(`${JSON.stringify(template, null, 2)}\n`);
  const catalogDigest = createHash("sha256").update(readFileSync(validPath)).digest("hex");
  assert.notEqual(createHash("sha256").update(buf).digest("hex"), catalogDigest);
  return evidenceFrom(buf);
}

test("decodeEvidenceBase64 is bounded and strict", () => {
  const ok = Buffer.from('{"ok":true}');
  const encoded = ok.toString("base64");
  assert.deepEqual(decodeEvidenceBase64(encoded), ok);
  assert.throws(() => decodeEvidenceBase64("not base64!!"), /standard base64/);
  assert.throws(() => decodeEvidenceBase64("abc"), /standard base64/);
  const tooBig = Buffer.alloc(REPRODUCTION_EVIDENCE_MAX_BYTES + 1, 0x61);
  assert.throws(() => decodeEvidenceBase64(tooBig.toString("base64")), /exceeds/);
});

test(
  "HTTP evidence intake: fresh bytes pass; catalog hash without bytes fails; mutated staged bytes fail",
  { timeout: 120_000 },
  async () => {
    const loaded = runtime();
    const boundSummary = `SDS52 historical workflow trial. e18.specDigest:${loaded.specDigest} e18.runtimeDigest:${loaded.runtimeDigest}`;
    const { store, schema } = await openStore();
    const { server, baseUrl } = await listen(store, {
      config: {
        verifierMode: "reproduction",
        reproduction: {
          root: e18Root,
          specPath: path.join(e18Root, "fixtures/task.sds52-stale-outdir.json"),
          executable: path.join(e18Root, "bin/e18-repro.mjs"),
          timeoutMs: 15_000,
        },
      },
      app: { verifier: createReproductionDispatcher(loaded) },
    });
    try {
      async function reserved() {
        return createReservedTask(baseUrl, {
          title: "evidence intake",
          summary: boundSummary,
          terms: {
            summary: boundSummary,
            claimTtlSeconds: 3600,
            maxArtifactBytes: 4096,
            allowedMediaTypes: ["text/plain", "application/json"],
            slotLimit: 1,
          },
        });
      }

      async function claim(taskId: string, termsVersion: string, token: string, label: string) {
        const claimed = await json(baseUrl, `/v1/tasks/${taskId}/claims`, {
          method: "POST",
          token,
          idempotencyKey: key(label),
          body: JSON.stringify({ termsVersion }),
        });
        assert.equal(claimed.status, 201, JSON.stringify(claimed.body));
        return (claimed.body as { reservation: { id: string } }).reservation.id;
      }

      const golden = evidenceFrom(readFileSync(validPath));
      const missingTask = await reserved();
      const missingActor = await issueContributor(baseUrl);
      const missingRsv = await claim(missingTask.taskId, missingTask.termsVersion, missingActor.token, "miss-claim");
      const missing = await json(baseUrl, `/v1/tasks/${missingTask.taskId}/submissions`, {
        method: "POST",
        token: missingActor.token,
        idempotencyKey: key("miss-submit"),
        body: JSON.stringify({ reservationId: missingRsv, artifact: golden.artifact }),
      });
      assert.equal(missing.status, 400, JSON.stringify(missing.body));
      assert.equal((missing.body as { error: { code: string } }).error.code, "missing_evidence");

      const mismatchTask = await reserved();
      const mismatchActor = await issueContributor(baseUrl);
      const mismatchRsv = await claim(
        mismatchTask.taskId,
        mismatchTask.termsVersion,
        mismatchActor.token,
        "mis-claim",
      );
      const mismatch = await json(baseUrl, `/v1/tasks/${mismatchTask.taskId}/submissions`, {
        method: "POST",
        token: mismatchActor.token,
        idempotencyKey: key("mis-submit"),
        body: JSON.stringify({
          reservationId: mismatchRsv,
          artifact: golden.artifact,
          evidenceBase64: Buffer.from('{"id":"different-content"}\n').toString("base64"),
        }),
      });
      assert.equal(mismatch.status, 400, JSON.stringify(mismatch.body));
      assert.match((mismatch.body as { error: { message: string } }).error.message, /digest|length/);

      const lengthTask = await reserved();
      const lengthActor = await issueContributor(baseUrl);
      const lengthRsv = await claim(lengthTask.taskId, lengthTask.termsVersion, lengthActor.token, "len-claim");
      const length = await json(baseUrl, `/v1/tasks/${lengthTask.taskId}/submissions`, {
        method: "POST",
        token: lengthActor.token,
        idempotencyKey: key("len-submit"),
        body: JSON.stringify({
          reservationId: lengthRsv,
          artifact: { ...golden.artifact, bytes: golden.artifact.bytes + 1 },
          evidenceBase64: golden.evidenceBase64,
        }),
      });
      assert.equal(length.status, 400, JSON.stringify(length.body));

      const fresh = freshEvidence();
      const freshTask = await reserved();
      const freshActor = await issueContributor(baseUrl);
      const freshRsv = await claim(freshTask.taskId, freshTask.termsVersion, freshActor.token, "fresh-claim");
      const submitted = await json(baseUrl, `/v1/tasks/${freshTask.taskId}/submissions`, {
        method: "POST",
        token: freshActor.token,
        idempotencyKey: key("fresh-submit"),
        body: JSON.stringify({
          reservationId: freshRsv,
          artifact: fresh.artifact,
          evidenceBase64: fresh.evidenceBase64,
        }),
      });
      assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
      const ownerView = await json(baseUrl, `/v1/tasks/${freshTask.taskId}`, { token: OWNER_TOKEN });
      const submissionJson = JSON.stringify(ownerView.body);
      assert.equal(submissionJson.includes(fresh.evidenceBase64), false);

      const verdict = await json(baseUrl, `/v1/tasks/${freshTask.taskId}/verdicts`, {
        method: "POST",
        token: OWNER_TOKEN,
        idempotencyKey: key("fresh-verdict"),
        body: JSON.stringify({ reservationId: freshRsv }),
      });
      assert.equal(verdict.status, 201, JSON.stringify(verdict.body));
      assert.equal((verdict.body as { verdict: { outcome: string } }).verdict.outcome, "pass");
      assert.equal(
        (verdict.body as { verdict: { verifierVersion: string } }).verdict.verifierVersion,
        REPRODUCTION_VERIFIER_VERSION,
      );

      const mutatedTask = await reserved();
      const mutatedActor = await issueContributor(baseUrl);
      const mutatedRsv = await claim(mutatedTask.taskId, mutatedTask.termsVersion, mutatedActor.token, "mut-claim");
      const mutatedSubmit = await json(baseUrl, `/v1/tasks/${mutatedTask.taskId}/submissions`, {
        method: "POST",
        token: mutatedActor.token,
        idempotencyKey: key("mut-submit"),
        body: JSON.stringify({
          reservationId: mutatedRsv,
          artifact: fresh.artifact,
          evidenceBase64: fresh.evidenceBase64,
        }),
      });
      assert.equal(mutatedSubmit.status, 201, JSON.stringify(mutatedSubmit.body));
      const pgClient = new pg.Client({ connectionString: databaseUrl() });
      await pgClient.connect();
      try {
        await pgClient.query(`SET search_path TO ${quoteIdent(schema)}`);
        const tamper = await pgClient.query(
          `UPDATE earned_work_submissions SET evidence_bytes = $1 WHERE reservation_id = $2 RETURNING id`,
          [Buffer.alloc(fresh.artifact.bytes, 0x78), mutatedRsv],
        );
        assert.equal(tamper.rowCount, 1);
      } finally {
        await pgClient.end();
      }
      const mutatedVerdict = await json(baseUrl, `/v1/tasks/${mutatedTask.taskId}/verdicts`, {
        method: "POST",
        token: OWNER_TOKEN,
        idempotencyKey: key("mut-verdict"),
        body: JSON.stringify({ reservationId: mutatedRsv }),
      });
      assert.equal(mutatedVerdict.status, 201, JSON.stringify(mutatedVerdict.body));
      assert.equal((mutatedVerdict.body as { verdict: { outcome: string } }).verdict.outcome, "fail");
      assert.match(
        ((mutatedVerdict.body as { verdict: { reasons: string[] } }).verdict.reasons || []).join(" "),
        /does not match bound artifact/,
      );
    } finally {
      await closeServer(server);
      await store.close();
      await dropSchema(schema);
    }
  },
);
