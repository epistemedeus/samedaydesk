import { EXECUTION_CONTRACT_VERSION } from "./pins.mjs";
import { digestFromSubmitted } from "./encode-inputs.mjs";
import { digestNamedBytes, projectNamedMeta, resultIdentityHash } from "./digest-named.mjs";
import { resultsPathFor } from "./origin.mjs";

const TERMS_PROOF_LIMIT = {
  verifiedWhenPresent: [
    "contract",
    "executionId",
    "retrieval id/path",
    "jobId",
    "ticket inputsDigest vs receipt.inputsDigest",
    "per-input staged sha256 and original byte counts",
    "expected output names and output metadata digest",
    "sold is not true",
    "purchaseAuthority is not true",
    "pinned POST identity when a successful POST body was observed",
  ],
  notVerifiedFromGet: [
    "caller payment.accepted object",
    "payTo/amount/network as remote cryptographic proof",
    "server frozen request hash",
    "host output path readability",
  ],
  note: "GET /results/:id does not echo all caller payment/accepted terms or the server frozen request hash. Matching hashes on a substituted GET body are not proof of caller identity; ticket-bound inputs and a pinned POST identity are.",
};

function addFailure(failures, code, message, detail) {
  failures.push({ code, message, detail: detail || null });
}

function metaList(list) {
  return (Array.isArray(list) ? list : []).map(projectNamedMeta).filter(Boolean);
}

export function verifyTicketBoundResult(ticket, body, { retrieval, httpStatus } = {}) {
  const failures = [];
  if (!ticket || typeof ticket !== "object") {
    addFailure(failures, "missing-ticket", "ticket is required");
    return { ok: false, failures, termsProof: TERMS_PROOF_LIMIT, identityHash: null, postIdentityMatch: null };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    addFailure(failures, "non-json-body", "result body is not an object");
    return { ok: false, failures, termsProof: TERMS_PROOF_LIMIT, identityHash: null, postIdentityMatch: null };
  }

  const contract = body.contract || body.receipt?.contract;
  if (contract !== (ticket.contract || EXECUTION_CONTRACT_VERSION)) {
    addFailure(failures, "contract-mismatch", "result contract does not match ticket", {
      expected: ticket.contract,
      actual: contract,
    });
  }
  if (body.executionId !== ticket.executionId) {
    addFailure(failures, "execution-id-mismatch", "result executionId does not match ticket", {
      expected: ticket.executionId,
      actual: body.executionId,
    });
  }
  const expectedPath = resultsPathFor(ticket.executionId);
  if (retrieval) {
    if (retrieval.id && retrieval.id !== ticket.executionId) {
      addFailure(failures, "retrieval-id-mismatch", "retrieval id does not match ticket", retrieval);
    }
    if (retrieval.path && retrieval.path !== expectedPath) {
      addFailure(failures, "retrieval-path-mismatch", "retrieval path does not match ticket", retrieval);
    }
  }
  if (body.retrieval?.id && body.retrieval.id !== ticket.executionId) {
    addFailure(failures, "retrieval-id-mismatch", "body.retrieval.id does not match ticket", body.retrieval);
  }
  if (body.jobId && ticket.jobId && body.jobId !== ticket.jobId) {
    addFailure(failures, "job-mismatch", "result jobId does not match ticket", {
      expected: ticket.jobId,
      actual: body.jobId,
    });
  }
  if (body.receipt?.jobId && ticket.jobId && body.receipt.jobId !== ticket.jobId) {
    addFailure(failures, "job-mismatch", "receipt.jobId does not match ticket", {
      expected: ticket.jobId,
      actual: body.receipt.jobId,
    });
  }

  const submitted = ticket.submitted || {};
  const receiptInputs = Array.isArray(body.receipt?.inputs) ? body.receipt.inputs : [];
  if (Object.keys(submitted).length) {
    for (const [name, row] of Object.entries(submitted)) {
      const found = receiptInputs.find((entry) => entry && entry.name === name);
      if (!found) {
        addFailure(failures, "input-missing", `receipt is missing ticket input ${name}`, { name });
        continue;
      }
      if (found.bytes !== row.bytes) {
        addFailure(failures, "input-bytes-mismatch", `input ${name} byte count does not match ticket`, {
          name,
          expected: row.bytes,
          actual: found.bytes,
        });
      }
      if (found.sha256 !== row.stagedSha256) {
        addFailure(failures, "input-digest-mismatch", `input ${name} staged sha256 does not match ticket`, {
          name,
          expected: row.stagedSha256,
          actual: found.sha256,
        });
      }
    }
    const ticketDigest = ticket.inputsDigest || digestFromSubmitted(submitted);
    if (body.receipt?.inputsDigest && body.receipt.inputsDigest !== ticketDigest) {
      addFailure(failures, "inputs-digest-mismatch", "receipt.inputsDigest does not match ticket-bound digest", {
        expected: ticketDigest,
        actual: body.receipt.inputsDigest,
      });
    }
    if (receiptInputs.length) {
      const recomputed = digestNamedBytes(metaList(receiptInputs));
      if (body.receipt?.inputsDigest && recomputed !== body.receipt.inputsDigest) {
        addFailure(failures, "inputs-digest-inconsistent", "receipt.inputsDigest does not match receipt.inputs", {
          recomputed,
          actual: body.receipt.inputsDigest,
        });
      }
      if (recomputed === body.receipt?.inputsDigest && body.receipt.inputsDigest !== ticketDigest) {
        addFailure(
          failures,
          "substituted-inputs-internally-consistent",
          "recomputed hashes on a substituted response are not proof of caller identity",
          { ticketDigest, responseDigest: body.receipt.inputsDigest },
        );
      }
    }
  }

  const expectedNames = ticket.expectedOutputs || [];
  const outputs = Array.isArray(body.outputs) ? body.outputs : [];
  const receiptOutputs = Array.isArray(body.receipt?.outputs) ? body.receipt.outputs : outputs;
  const deliveryComplete = body.delivery?.complete;
  if (deliveryComplete === true || (body.ok === true && deliveryComplete !== false)) {
    for (const name of expectedNames) {
      if (!outputs.some((row) => row && row.name === name) && !receiptOutputs.some((row) => row && row.name === name)) {
        addFailure(failures, "output-missing", `expected output ${name} is missing from result metadata`, { name });
      }
    }
    const projected = metaList(outputs.length ? outputs : receiptOutputs);
    if (projected.length) {
      const recomputed = digestNamedBytes(projected);
      const claimed = body.receipt?.outputsDigest || body.outputsDigest;
      if (claimed && claimed !== recomputed) {
        addFailure(failures, "outputs-digest-mismatch", "outputsDigest does not match output metadata", {
          claimed,
          recomputed,
        });
      }
    }
  }

  if (body.receipt) {
    if (body.ok === true && body.receipt.ok === false) {
      addFailure(failures, "body-receipt-inconsistent", "body.ok true but receipt.ok false");
    }
    if (body.transport && body.receipt.transport && body.transport !== body.receipt.transport) {
      addFailure(failures, "body-receipt-inconsistent", "body.transport does not match receipt.transport", {
        body: body.transport,
        receipt: body.receipt.transport,
      });
    }
  }

  if (body.sold === true) {
    addFailure(failures, "unexpected-sold", "result claims sold=true; this envelope is non-settling");
  }
  if (body.purchaseAuthority === true || body.receipt?.purchaseAuthority === true) {
    addFailure(failures, "unexpected-purchase-authority", "result claims purchaseAuthority");
  }
  if (ticket.jobId && body.fundingState && ticket.declaredTerms?.fundingIntent === "reserved-fixture") {
    if (body.fundingState !== "reserved-fixture" && body.fundingState !== "rejected") {
      addFailure(failures, "funding-mismatch", "fundingState does not match declared reserved-fixture intent", {
        actual: body.fundingState,
      });
    }
  }

  const identityHash = resultIdentityHash(body);
  let postIdentityMatch = null;
  if (ticket.postIdentity?.bodySha256) {
    postIdentityMatch = identityHash === ticket.postIdentity.bodySha256;
    if (!postIdentityMatch) {
      addFailure(
        failures,
        "post-identity-mismatch",
        "GET body identity does not match the pinned successful POST body; recomputed response hashes are not caller proof",
        { expected: ticket.postIdentity.bodySha256, actual: identityHash },
      );
    }
  }

  void httpStatus;
  return {
    ok: failures.length === 0,
    failures,
    termsProof: TERMS_PROOF_LIMIT,
    identityHash,
    postIdentityMatch,
  };
}
