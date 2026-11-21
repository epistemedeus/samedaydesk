import { VERDICT } from "./constants.mjs";

function normalizeDigest(value) {
  if (typeof value !== "string") return null;
  const digest = value.trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(digest) ? digest : null;
}

/**
 * Contribution evidence is the submitted artifact digest (I01 submission),
 * an explicit contribution digest if present, or a caller boundArtifact overlay.
 * Lifecycle labels are not contribution evidence.
 */
export function contributionDigest(task, bound) {
  const fromSubmission = task?.submission?.artifact?.digestSha256;
  const contribution = task?.contribution;
  const fromContribution =
    contribution && typeof contribution === "object"
      ? (contribution.artifact?.digestSha256 ?? contribution.digestSha256)
      : null;
  const fromBound = bound?.digestSha256;
  return (
    normalizeDigest(fromSubmission) ??
    normalizeDigest(fromContribution) ??
    normalizeDigest(fromBound) ??
    null
  );
}

export function verdictFromTask(task) {
  const verdict = task?.verdict;
  if (verdict == null || typeof verdict !== "object") return null;
  if (typeof verdict.outcome !== "string" || verdict.outcome.length === 0) return null;
  return verdict;
}

/** Known cross-record contradictions are unsafe even before a verdict exists. */
export function hasForeignIdentity(task) {
  const reservation = task?.reservation;
  const submission = task?.submission;
  const pairs = [
    [task?.id, reservation?.taskId], [task?.termsVersion, reservation?.termsVersion],
    [task?.id, submission?.taskId], [task?.termsVersion, submission?.termsVersion],
    [reservation?.id, submission?.reservationId],
  ];
  return pairs.some(([a, b]) => a != null && b != null && a !== b);
}

/** Bind every E01 verdict identity before interpreting any outcome. */
export function bindVerification(task, bound) {
  const verdict = verdictFromTask(task);
  if (!verdict) return { status: "missing" };
  const submission = task?.submission;
  const reservation = task?.reservation;
  const contribution = normalizeDigest(submission?.artifact?.digestSha256);
  const vDigest = normalizeDigest(verdict.artifactDigestSha256);
  const pairs = [
    [task?.id, verdict.taskId], [task?.id, submission?.taskId],
    [task?.id, reservation?.taskId],
    [reservation?.id, verdict.reservationId], [reservation?.id, submission?.reservationId],
    [submission?.id, verdict.submissionId],
    [task?.termsVersion, verdict.termsVersion], [task?.termsVersion, submission?.termsVersion],
    [task?.termsVersion, reservation?.termsVersion], [contribution, vDigest],
  ];
  if (pairs.some(([a, b]) => a != null && b != null && a !== b)) {
    return { status: "foreign", contributionDigest: contribution, verdictDigest: vDigest, outcome: verdict.outcome };
  }
  if (!verdict.id || !verdict.verifierVersion || !submission?.artifact ||
      pairs.some(([a, b]) => typeof a !== "string" || !a || typeof b !== "string" || !b)) {
    return { status: "missing" };
  }
  if (![VERDICT.PASS, VERDICT.FAIL, VERDICT.NEEDS_REVIEW].includes(verdict.outcome)) return { status: "missing" };
  return { status: verdict.outcome, digest: contribution };
}
