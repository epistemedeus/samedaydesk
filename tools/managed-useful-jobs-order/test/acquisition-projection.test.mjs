import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  digestNamedOutputs,
  hashFrozenRequestV1,
  hashHttpRequestAcquisitionV1,
  hashPublicationIdentityV1,
  materializeHttpJsonText,
  publicationIdentityV1,
} from "../lib/acquisition-identity.mjs";
import { FROZEN_REQUEST_HASH_VERSION } from "../lib/acquisition-constants.mjs";
import { encodeExecuteRequest } from "../../../experiments/wave5/d14/lib/encode-inputs.mjs";
import { createTicket, requestHashFromSubmitted, updateTicketAfterPost } from "../../../experiments/wave5/d14/lib/ticket.mjs";
import { resultIdentityHash } from "../../../experiments/wave5/d14/lib/digest-named.mjs";
import { verifyTicketBoundResult } from "../../../experiments/wave5/d14/lib/verify.mjs";

const JOBS = ["lockfile-pin-delta", "vendor-budget-impact"];
const MULTIBYTE = '{"label":"before","note":"café 日本語 🎵","rows":[{"field":"x","value":1,"unit":"USD"}]}';

describe("H32 materialized-input and publicationIdentityV1", () => {
  it("no-newline and multibyte source hashes differ from materialized; D14 ticket binds only materialized", () => {
    const dir = mkdtempSync(join(process.env.TMPDIR || tmpdir(), "h32-proj-"));
    for (const jobId of JOBS) {
      for (const newline of [false, true]) {
        const source = newline ? `${MULTIBYTE}\n` : MULTIBYTE;
        const before = join(dir, `${jobId}-${newline ? "nl" : "nonl"}-before.json`);
        const afterSrc = source.replace("before", "after");
        const after = join(dir, `${jobId}-${newline ? "nl" : "nonl"}-after.json`);
        writeFileSync(before, source);
        writeFileSync(after, afterSrc);
        const encoded = encodeExecuteRequest({
          jobId,
          files: { before, after },
          executionId: `exec-${jobId}-${newline ? "nl" : "nonl"}`,
        });
        const ticket = createTicket({
          origin: "http://127.0.0.1:9",
          request: encoded.request,
          submitted: encoded.submitted,
        });
        const writerHash = hashHttpRequestAcquisitionV1(jobId, encoded.request.inputs);
        const fromSubmitted = requestHashFromSubmitted(jobId, encoded.submitted);
        assert.equal(ticket.requestHash, writerHash);
        assert.equal(fromSubmitted, writerHash);
        const proj = materializeHttpJsonText(source);
        if (!newline) {
          assert.notEqual(proj.sourceSha256, proj.materializedSha256);
          assert.equal(proj.materializedBytes, proj.sourceBytes + 1);
          assert.notEqual(encoded.submitted.before.sha256, encoded.submitted.before.materializedSha256);
        } else {
          assert.equal(proj.sourceSha256, proj.materializedSha256);
        }
        const rawHash = hashFrozenRequestV1({
          jobId,
          inputs: Object.entries(encoded.submitted).map(([key, row]) => ({
            flag: `--${key}`,
            sha256: row.sha256,
            bytes: row.bytes,
          })),
        });
        if (!newline) assert.notEqual(rawHash, writerHash);
        else assert.equal(rawHash, writerHash);
      }
    }
  });

  it("POST envelope hash is not the HA2 GET identity; publicationIdentityV1 matches across both", () => {
    const outputs = [
      { name: "budget-impact.json", kind: "file", bytes: 4, sha256: "a".repeat(64) },
      { name: "budget-impact.md", kind: "file", bytes: 4, sha256: "b".repeat(64) },
    ];
    const requestHash = "c".repeat(64);
    const receiptSha256 = "d".repeat(64);
    const publication = publicationIdentityV1({
      executionId: "exec-env",
      jobId: "vendor-budget-impact",
      requestHash,
      requestHashVersion: FROZEN_REQUEST_HASH_VERSION,
      receiptSha256,
      outputs,
    });
    const publicationSha = hashPublicationIdentityV1(publication);
    const postBody = {
      ok: true,
      jobId: "vendor-budget-impact",
      executionId: "exec-env",
      contract: "samedaydesk.paid-useful-jobs.execution.v1",
      purchaseAuthority: false,
      sold: false,
      analysis: { status: "ok" },
      delivery: { complete: true },
      engine: { ok: true },
      receipt: { schema: "samedaydesk.paid-useful-jobs.receipt.v1", jobId: "vendor-budget-impact", outputs },
      outputs,
      requestHash,
      requestHashVersion: FROZEN_REQUEST_HASH_VERSION,
      receiptSha256,
      outputsDigest: publication.outputsDigest,
      publicationIdentitySha256: publicationSha,
      publication,
    };
    const getBody = {
      ok: true,
      state: "available",
      contract: "samedaydesk.paid-useful-jobs.execution.v1",
      executionId: "exec-env",
      jobId: "vendor-budget-impact",
      requestHash,
      requestHashVersion: FROZEN_REQUEST_HASH_VERSION,
      receiptSha256,
      outputsDigest: publication.outputsDigest,
      outputs,
      publicationIdentitySha256: publicationSha,
      purchaseAuthority: false,
      sold: false,
      retrieval: { id: "exec-env", path: "/results/exec-env" },
    };
    assert.notEqual(resultIdentityHash(postBody), resultIdentityHash(getBody));
    assert.equal(hashPublicationIdentityV1(postBody), hashPublicationIdentityV1(getBody));
    const ticket = createTicket({
      origin: "http://127.0.0.1:9",
      request: { jobId: "vendor-budget-impact", executionId: "exec-env" },
      submitted: {},
    });
    ticket.requestHash = requestHash;
    ticket.requestHashVersion = FROZEN_REQUEST_HASH_VERSION;
    ticket.postIdentity = {
      httpStatus: 200,
      bodySha256: resultIdentityHash(postBody),
      executionId: "exec-env",
      publicationIdentitySha256: publicationSha,
    };
    const verified = verifyTicketBoundResult(ticket, getBody, {
      retrieval: { id: "exec-env", path: "/results/exec-env" },
    });
    assert.equal(verified.ok, true, JSON.stringify(verified.failures));

    const mutatedOutputs = [
      { name: "budget-impact.json", kind: "file", bytes: 9, sha256: "e".repeat(64) },
      { name: "budget-impact.md", kind: "file", bytes: 9, sha256: "f".repeat(64) },
    ];
    const mutated = {
      ...getBody,
      outputs: mutatedOutputs,
      outputsDigest: digestNamedOutputs(mutatedOutputs),
      publicationIdentitySha256: publicationSha,
    };
    const pinned = updateTicketAfterPost(ticket, { status: 200, body: postBody, bodySha256: resultIdentityHash(postBody) });
    assert.equal(pinned.publicationIdentitySha256, publicationSha);
    const claimedMismatch = updateTicketAfterPost(ticket, {
      status: 200,
      body: { ...postBody, ...mutated, publicationIdentitySha256: publicationSha },
      bodySha256: "aa".repeat(32),
    });
    assert.notEqual(claimedMismatch.publicationIdentitySha256, publicationSha);
    assert.equal(claimedMismatch.claimedPublicationIdentityMismatch.claimed, publicationSha);

    const failed = verifyTicketBoundResult(pinned, mutated, {
      retrieval: { id: "exec-env", path: "/results/exec-env" },
    });
    assert.equal(failed.ok, false);
    assert.ok(
      failed.failures.some((row) => row.code === "publication-identity-mismatch"),
      JSON.stringify(failed.failures),
    );
  });
});
