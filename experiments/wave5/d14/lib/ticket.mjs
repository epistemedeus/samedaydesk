import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ConsumerRefuse } from "./errors.mjs";
import { EXECUTION_CONTRACT_VERSION, JOB_EXPECTED_OUTPUTS } from "./pins.mjs";
import { assertExecutionId, parseHttpOrigin, resultsPathFor } from "./origin.mjs";
import { digestFromSubmitted } from "./encode-inputs.mjs";
import { resultIdentityHash } from "./digest-named.mjs";

const REJECTED_HTTP_CODES = new Set([
  "invalid-json",
  "invalid-execution-id",
  "invalid-request",
  "execution-id-conflict",
  "input-body-too-large",
  "execution-cache-full",
]);

function summarizePayment(payment) {
  if (!payment || typeof payment !== "object") return null;
  return {
    fixture: payment.fixture === true,
    purchaseAuthority: Object.prototype.hasOwnProperty.call(payment, "purchaseAuthority")
      ? payment.purchaseAuthority
      : null,
    live: Object.prototype.hasOwnProperty.call(payment, "live") ? payment.live : null,
    acceptedPayTo: payment.accepted?.payTo || null,
    acceptedAmount: payment.accepted?.amount || null,
    acceptedNetwork: payment.accepted?.network || null,
  };
}

export function commitStatusFromPosted(posted) {
  const classify = posted?.classify || {};
  const status = posted?.status;
  const code = classify.code;
  if (status === 200) return "accepted";
  if (status === 400 || status === 409 || status === 413 || status === 503) return "rejected";
  if (REJECTED_HTTP_CODES.has(code)) return "rejected";
  if (classify.kind === "http-transport-failure" && code === "connection-refused") return "not-sent";
  if (classify.kind === "http-transport-failure" && (code === "invalid-origin" || code === "foreign-origin")) {
    return "not-sent";
  }
  return "uncertain";
}

export function createTicket({
  origin,
  request,
  submitted = {},
  frozen = null,
  expectedOutputs,
}) {
  if (!request || typeof request !== "object") {
    throw new ConsumerRefuse("missing-request", "ticket requires a frozen request object");
  }
  const executionId = assertExecutionId(request.executionId);
  const parsed = parseHttpOrigin(origin);
  const outputs = expectedOutputs || JOB_EXPECTED_OUTPUTS[request.jobId] || [];
  return {
    contract: EXECUTION_CONTRACT_VERSION,
    origin: parsed.origin,
    jobId: request.jobId,
    executionId,
    retrieval: { id: executionId, path: resultsPathFor(executionId) },
    request,
    submitted,
    inputsDigest: digestFromSubmitted(submitted),
    frozenRequest: frozen,
    expectedOutputs: [...outputs],
    declaredTerms: {
      fundingIntent: request.fundingIntent || null,
      example: request.example === true,
      payment: summarizePayment(request.payment || null),
      note: "GET /results/:id does not echo caller payment/accepted terms or the server frozen request hash. Local declaredTerms are not remote cryptographic proof.",
    },
    commitStatus: "unsent",
    classify: null,
    httpStatus: null,
    postIdentity: null,
    durableExactlyOnce: false,
    cacheNote: "Server result cache is process-local and is not durable across restart. Same-ID replay is not exactly-once recovery.",
  };
}

export function updateTicketAfterPost(ticket, posted) {
  const executionId = ticket.executionId;
  const next = {
    ...ticket,
    executionId,
    retrieval: { id: executionId, path: resultsPathFor(executionId) },
    httpStatus: posted?.status ?? 0,
    classify: posted?.classify || null,
    commitStatus: commitStatusFromPosted(posted),
    durableExactlyOnce: false,
  };
  if (posted?.status === 200 && posted.body && typeof posted.body === "object") {
    next.postIdentity = {
      httpStatus: posted.status,
      bodySha256: posted.bodySha256 || resultIdentityHash(posted.body),
      executionId: posted.body.executionId || null,
    };
    if (posted.body.executionId && posted.body.executionId !== executionId) {
      next.serverIdentityMismatch = posted.body.executionId;
    }
  }
  return next;
}

export function ticketFromSubmit({ origin, request, submitted, posted, frozen, expectedOutputs }) {
  const ticket = createTicket({ origin, request, submitted, frozen, expectedOutputs });
  if (posted) return updateTicketAfterPost(ticket, posted);
  return ticket;
}

export function writeTicketAtomic(filePath, ticket) {
  const abs = resolve(filePath);
  mkdirSync(dirname(abs), { recursive: true });
  const tmp = `${abs}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(ticket, null, 2)}\n`);
  renameSync(tmp, abs);
}

export function readTicket(filePath) {
  const abs = resolve(filePath);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(abs, "utf8"));
  } catch (err) {
    throw new ConsumerRefuse("invalid-ticket", `ticket is not valid JSON: ${err.message}`, { path: abs });
  }
  if (!parsed || typeof parsed !== "object") {
    throw new ConsumerRefuse("invalid-ticket", "ticket must be an object", { path: abs });
  }
  if (!parsed.executionId) {
    throw new ConsumerRefuse("missing-execution-id", "ticket.executionId is required for retrieval");
  }
  assertExecutionId(parsed.executionId);
  if (!parsed.origin) {
    throw new ConsumerRefuse("missing-base", "ticket.origin is required");
  }
  parseHttpOrigin(parsed.origin);
  return parsed;
}
