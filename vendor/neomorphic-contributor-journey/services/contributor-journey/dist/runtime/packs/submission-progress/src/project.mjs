import { bindArtifactDigest, maxBytesFromTask } from "./artifact.mjs";
import {
  ERROR_CODES,
  NEXT_ACTION,
  NULL_PAYOUT,
  SCHEMA,
  SCHEMA_VERSION,
  TERMS_VERSION_RE,
  VERDICT,
} from "./constants.mjs";
import { ProgressError } from "./errors.mjs";
import { assertNoExecute, assertNotPaidOrSettled, forceNonpaying, freezeHonesty } from "./honesty.mjs";
import { assertFetchRefForbidden } from "./http.mjs";
import { bindVerification, contributionDigest, verdictFromTask, hasForeignIdentity } from "./verification.mjs";

export function unwrapTask(taskJson) {
  if (taskJson == null || typeof taskJson !== "object") {
    throw new ProgressError(ERROR_CODES.INVALID_INPUT, "taskJson must be an object");
  }
  if (taskJson.task && typeof taskJson.task === "object") return taskJson.task;
  return taskJson;
}

function parseTermsVersion(value) {
  if (value == null) return null;
  if (typeof value === "number" || (typeof value === "string" && /^-?\d+$/.test(value.trim()))) {
    throw new ProgressError(
      ERROR_CODES.INTEGER_TERMS_VERSION,
      "integer termsVersion is rejected; use the sha256 content hash (I01 / F17, no dual public key)",
    );
  }
  if (typeof value !== "string" || !TERMS_VERSION_RE.test(value)) {
    throw new ProgressError(
      ERROR_CODES.INVALID_INPUT,
      "termsVersion must be sha256: followed by 64 lowercase hex characters",
    );
  }
  return value;
}

function artifactFromTask(task, boundArtifact) {
  if (task.submission && typeof task.submission === "object" && task.submission.artifact) {
    return task.submission.artifact;
  }
  if (boundArtifact) return boundArtifact;
  return null;
}

function digestFrom(task, bound) {
  return contributionDigest(task, bound);
}

function buildSteps(task, bound) {
  const steps = [];
  const reservation = task.reservation;
  if (reservation && typeof reservation === "object") {
    steps.push({
      kind: "claimed",
      at: reservation.createdAt ?? null,
      reservationId: reservation.id ?? null,
    });
  } else if (task.lifecycle === "claimed" || task.lifecycle === "submitted" || task.lifecycle === "verified" || task.lifecycle === "accepted") {
    steps.push({
      kind: "claimed",
      at: task.updatedAt ?? null,
      reservationId: null,
    });
  }

  const submission = task.submission;
  const digest = digestFrom(task, bound);
  if (submission && typeof submission === "object") {
    steps.push({
      kind: "submitted",
      at: submission.createdAt ?? null,
      reservationId: submission.reservationId ?? reservation?.id ?? null,
      submissionId: submission.id ?? null,
      artifactDigestSha256: (submission.artifact?.digestSha256 ?? digest)?.toLowerCase?.() ?? digest,
    });
  } else if (task.lifecycle === "submitted" || task.lifecycle === "verified" || task.lifecycle === "accepted") {
    steps.push({
      kind: "submitted",
      at: task.updatedAt ?? null,
      reservationId: reservation?.id ?? null,
      submissionId: null,
      artifactDigestSha256: digest,
    });
  }

  const binding = bindVerification(task, bound);
  const verdict = verdictFromTask(task);
  if (binding.status === "pass" && verdict) {
    steps.push({
      kind: "verified",
      at: verdict.createdAt ?? null,
      outcome: VERDICT.PASS,
      artifactDigestSha256: binding.digest,
    });
  } else if (binding.status === "fail" && verdict) {
    steps.push({
      kind: "failed",
      at: verdict.createdAt ?? null,
      outcome: VERDICT.FAIL,
      artifactDigestSha256: binding.digest,
    });
  } else if (binding.status === "needs_review" && verdict) {
    steps.push({
      kind: "needs_review",
      at: verdict.createdAt ?? null,
      outcome: VERDICT.NEEDS_REVIEW,
      artifactDigestSha256: binding.digest,
    });
  }
  return steps;
}

function applyAttempt(steps, attempt, task) {
  if (!attempt || typeof attempt !== "object") return steps;
  if (attempt.kind !== "submit") return steps;
  const existing = steps.filter((step) => step.kind === "submitted");
  const last = existing.at(-1);
  const boundDigest = bindArtifactDigest(attempt.artifact, { maxArtifactBytes: maxBytesFromTask(task) });
  const reservationId = attempt.reservationId ?? task.reservation?.id ?? null;
  if (last) {
    if (last.artifactDigestSha256 === boundDigest.digestSha256 && last.reservationId === reservationId) {
      return steps;
    }
    throw new ProgressError(
      ERROR_CODES.DUPLICATE_SUBMISSION,
      "duplicate_submission is not a new progress step",
      { document: null },
    );
  }
  return [
    ...steps,
    {
      kind: "submitted",
      at: attempt.at ?? null,
      reservationId,
      submissionId: null,
      artifactDigestSha256: boundDigest.digestSha256,
    },
  ];
}

function mapProgress({ task, steps, inFlight, binding, now }) {
  if (binding.status === "fail") {
    return {
      progress: "failed",
      nextAction: NEXT_ACTION.APPEAL,
      verdictOutcome: VERDICT.FAIL,
    };
  }
  if (binding.status === "needs_review") {
    return {
      progress: "needs_review",
      nextAction: NEXT_ACTION.WAIT_REQUESTER_ACCEPT,
      verdictOutcome: VERDICT.NEEDS_REVIEW,
    };
  }
  if (binding.status === "pass") {
    return {
      progress: "verified",
      nextAction:
        task.lifecycle === "accepted" || task.payoutState === "owed"
          ? NEXT_ACTION.WAIT_OWED
          : NEXT_ACTION.WAIT_REQUESTER_ACCEPT,
      verdictOutcome: VERDICT.PASS,
    };
  }
  if (task.lifecycle === "rejected") {
    return {
      progress: "rejected",
      nextAction: NEXT_ACTION.DO_NOT_START_WORK,
      verdictOutcome: null,
    };
  }
  if (steps.some((step) => step.kind === "submitted") || task.lifecycle === "submitted") {
    return {
      progress: "submitted",
      nextAction: NEXT_ACTION.WAIT_VERDICT,
      verdictOutcome: null,
    };
  }
  if (inFlight === "submitting") {
    return {
      progress: "submitting",
      nextAction: NEXT_ACTION.SUBMIT_ARTIFACT_METADATA,
      verdictOutcome: null,
    };
  }
  if (task.lifecycle === "claimed" || (task.reservation && task.reservation.status === "active")) {
    return {
      progress: "claimed",
      nextAction: task.reservation?.status === "active" && Number.isFinite(Date.parse(task.reservation.expiresAt)) && Date.parse(task.reservation.expiresAt) > new Date(now).getTime()
        ? NEXT_ACTION.SUBMIT_ARTIFACT_METADATA : NEXT_ACTION.DO_NOT_START_WORK,
      verdictOutcome: null,
    };
  }
  return {
    progress: "open",
    nextAction: task.claimable === false || task.reservation !== null || task.fundingState !== "reserved"
      ? NEXT_ACTION.DO_NOT_START_WORK : NEXT_ACTION.CLAIM,
    verdictOutcome: null,
  };
}

/**
 * Map F01/I01 task JSON (GET /v1/tasks/{id} envelope or task object) into a
 * resume-friendly CX progress document. Does not execute artifacts, fetch refs,
 * or invent a verifier.
 *
 * @param {object} taskJson
 * @param {{
 *   boundArtifact?: object,
 *   inFlight?: "submitting",
 *   attempt?: { kind: "submit", artifact: object, reservationId?: string },
 *   previous?: object,
 *   fetchRef?: boolean,
 *   execute?: boolean,
 *   paid?: boolean,
 *   settled?: boolean,
 *   evidenceClass?: string,
 * }} [options]
 */
export function projectProgress(taskJson, options = {}) {
  assertFetchRefForbidden(options);
  assertNoExecute(options);
  assertNotPaidOrSettled(options);
  const task = unwrapTask(taskJson);
  assertNotPaidOrSettled(task);
  if (task.payout && typeof task.payout === "object") assertNotPaidOrSettled(task.payout);

  const termsVersion = parseTermsVersion(task.termsVersion ?? task.terms?.version ?? null);
  const maxArtifactBytes = maxBytesFromTask(task);

  let bound = null;
  if (options.boundArtifact) {
    bound = bindArtifactDigest(options.boundArtifact, { maxArtifactBytes });
  }
  const rawArtifact = artifactFromTask(task, bound);
  if (rawArtifact) {
    bound = bindArtifactDigest(rawArtifact, { maxArtifactBytes });
  }

  const binding = bindVerification(task, bound);
  let steps = buildSteps(task, bound);
  try {
    steps = applyAttempt(steps, options.attempt, task);
  } catch (error) {
    if (error instanceof ProgressError && error.code === ERROR_CODES.DUPLICATE_SUBMISSION) {
      const document = finishDocument({
        task,
        termsVersion,
        steps,
        bound,
        binding,
        inFlight: undefined,
        now: options.now,
        evidenceClass: options.evidenceClass,
        codes: [ERROR_CODES.DUPLICATE_SUBMISSION],
      });
      throw new ProgressError(ERROR_CODES.DUPLICATE_SUBMISSION, error.message, { document });
    }
    throw error;
  }

  if (options.previous && Array.isArray(options.previous.steps)) {
    const prevSubmitted = options.previous.steps.filter((step) => step.kind === "submitted");
    const nowSubmitted = steps.filter((step) => step.kind === "submitted");
    if (prevSubmitted.length && nowSubmitted.length > prevSubmitted.length) {
      throw new ProgressError(
        ERROR_CODES.DUPLICATE_SUBMISSION,
        "duplicate_submission is not a new progress step",
        { document: options.previous },
      );
    }
    if (
      prevSubmitted.length &&
      nowSubmitted.length &&
      prevSubmitted[0].artifactDigestSha256 &&
      nowSubmitted[0].artifactDigestSha256 &&
      prevSubmitted[0].artifactDigestSha256 !== nowSubmitted[0].artifactDigestSha256 &&
      (prevSubmitted[0].reservationId ?? null) === (nowSubmitted[0].reservationId ?? null)
    ) {
      throw new ProgressError(
        ERROR_CODES.DUPLICATE_SUBMISSION,
        "duplicate_submission is not a new progress step",
        { document: options.previous },
      );
    }
  }

  return finishDocument({
    task,
    termsVersion,
    steps,
    bound,
    binding,
    inFlight: options.inFlight,
    now: options.now,
    evidenceClass: options.evidenceClass,
    codes: [],
  });
}

function verificationCodes(task, binding) {
  if (binding.status === "foreign") return [ERROR_CODES.FOREIGN_EVIDENCE];
  if (
    binding.status === "missing" &&
    (task.lifecycle === "verified" || task.lifecycle === "accepted")
  ) {
    return [ERROR_CODES.MISSING_VERIFICATION];
  }
  return [];
}

function finishDocument({ task, termsVersion, steps, bound, binding, inFlight, evidenceClass, codes, now = new Date() }) {
  const resolvedBinding = binding ?? bindVerification(task, bound);
  const mapped = mapProgress({ task, steps, inFlight, binding: resolvedBinding, now });
  const artifactDigestSha256 = digestFrom(task, bound);
  const allCodes = [...new Set([...codes, ...verificationCodes(task, resolvedBinding), ...(hasForeignIdentity(task) ? [ERROR_CODES.FOREIGN_EVIDENCE] : [])])];
  const document = forceNonpaying({
    schema: SCHEMA,
    schemaVersion: SCHEMA_VERSION,
    ok: allCodes.length === 0,
    taskId: task.id ?? null,
    termsVersion,
    progress: mapped.progress,
    lifecycle: task.lifecycle ?? null,
    nextAction: allCodes.includes(ERROR_CODES.FOREIGN_EVIDENCE) ? NEXT_ACTION.DO_NOT_START_WORK : mapped.nextAction,
    artifactDigestSha256,
    verdictOutcome: mapped.verdictOutcome,
    reservationId: task.reservation?.id ?? steps.find((s) => s.reservationId)?.reservationId ?? null,
    submissionId: task.submission?.id ?? null,
    payoutState: typeof task.payoutState === "string" ? task.payoutState : "none",
    paid: false,
    settled: false,
    transfer: null,
    payoutAdapter: NULL_PAYOUT.adapter,
    steps,
    codes: allCodes,
    honesty: freezeHonesty({
      evidenceClass: evidenceClass ?? "fixture",
      fetchRef: false,
    }),
    provenance: task.provenance ?? null,
  });

  if (document.paid === true || document.settled === true) {
    throw new ProgressError(
      ERROR_CODES.PROGRESS_PAID_OR_SETTLED,
      "internal projector refused a paid or settled progress document",
    );
  }
  return document;
}

/**
 * Apply a kernel HTTP error without treating it as a new progress step.
 * @param {object | null} document
 * @param {{ code: string, message?: string, status?: number }} error
 */
export function applyKernelError(document, error) {
  const code = error.code;
  if (code === "duplicate_submission") {
    return forceNonpaying({
      ...(document ?? {}),
      ok: false,
      codes: [ERROR_CODES.DUPLICATE_SUBMISSION],
      lastError: { code: ERROR_CODES.DUPLICATE_SUBMISSION, message: error.message ?? "duplicate_submission" },
    });
  }
  if (code === "oversize" || code === "payload_too_large") {
    throw new ProgressError(ERROR_CODES.OVERSIZE, error.message ?? "oversize artifact rejected", {
      document,
      status: error.status ?? 400,
    });
  }
  if (code === "invalid_input") {
    throw new ProgressError(ERROR_CODES.MALFORMED_ARTIFACT, error.message ?? "malformed artifact rejected", {
      document,
      status: error.status ?? 400,
    });
  }
  throw new ProgressError(code || ERROR_CODES.HTTP_ERROR, error.message ?? "kernel error", {
    document,
    status: error.status ?? null,
  });
}
