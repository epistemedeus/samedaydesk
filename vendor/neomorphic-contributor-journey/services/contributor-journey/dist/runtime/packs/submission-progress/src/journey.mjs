import { createHash } from 'node:crypto';
import { createEarnedWorkSdk, hashTermsVersion, assertTermsVersion, requireIdempotencyKey } from '../../earned-work-sdk/src/index.mjs';
import { projectProgress } from './project.mjs';
import { bindArtifactDigest } from './artifact.mjs';
import { remainingFromOwnerTask } from '../../bounded-correction-ux/src/remaining.mjs';
import { projectExpiryDesk } from '../../expiry-experience/src/projector.mjs';
import { nextAction } from '../../in-task-next-action/src/next-action.mjs';

export class JourneyError extends Error {
  constructor(code, message, status = 0) { super(message); this.code = code; this.status = status; }
}
const reject = (code, message) => { throw new JourneyError(code, message); };
function result(response, field) {
  if (!response || response.status < 200 || response.status >= 300) {
    throw new JourneyError(response?.body?.error?.code ?? 'unknown_outcome', 'E01 request did not succeed; retain the original intent and idempotency keys', response?.status ?? 0);
  }
  if (!response.body || typeof response.body !== 'object' || !response.body[field] || typeof response.body[field] !== 'object') {
    reject('unknown_outcome', 'E01 success omitted the required object; replay the original request');
  }
  return response.body[field];
}
function validateIntent(intent) {
  if (!intent || typeof intent.taskId !== 'string' || !intent.taskId || typeof intent.contributorPublicId !== 'string' || !intent.contributorPublicId) reject('invalid_input', 'taskId and contributorPublicId are required');
  assertTermsVersion(intent.termsVersion);
  if (![0, 1].includes(intent.maxRevisions)) reject('correction_budget_unknown', 'Explicit maxRevisions 0 or 1 is required');
}
function validateTask(task, intent) {
  if (task.id !== intent.taskId) reject('identity_mismatch', 'E01 returned a different task');
  if (task.termsVersion !== intent.termsVersion) reject('terms_changed', 'Read and assent to current terms in a new intent before further work');
  const document = task.termsDocument;
  if (!document || document.taskId !== task.id || document.schema !== 'neomorphic.earned-work.terms.v1' || hashTermsVersion(document) !== task.termsVersion) reject('terms_body_mismatch', 'Current E01 terms bytes do not match the assented hash');
  const correction = remainingFromOwnerTask(task);
  if (correction.maxRevisions !== intent.maxRevisions) reject('correction_budget_mismatch', 'Current E01 correction allowance differs from the disclosed intent');
  return correction;
}
function validateReservation(reservation, intent) {
  if (!reservation?.id || reservation.taskId !== intent.taskId || reservation.termsVersion !== intent.termsVersion || reservation.contributorPublicId !== intent.contributorPublicId) reject('identity_mismatch', 'Reservation task, terms, or contributor does not match the intent');
}
function validateArtifact(intent, task) {
  const artifact = bindArtifactDigest(intent.artifact, {maxArtifactBytes: task.termsDocument.maxArtifactBytes});
  if (!task.termsDocument.allowedMediaTypes.includes(artifact.mediaType)) reject('artifact_mismatch', 'Artifact media type is outside the assented terms');
  if (intent.evidenceBase64 != null) {
    if (typeof intent.evidenceBase64 !== 'string' || intent.evidenceBase64.length > 21848 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(intent.evidenceBase64)) reject('evidence_mismatch', 'Invalid or oversized evidence encoding');
    const bytes = Buffer.from(intent.evidenceBase64, 'base64');
    if (!bytes.length || bytes.length > 16384 || bytes.length !== artifact.bytes || createHash('sha256').update(bytes).digest('hex') !== artifact.digestSha256 || artifact.mediaType !== 'application/json') reject('evidence_mismatch', 'Received bytes must match digest, length, and JSON media type');
  }
  return artifact;
}
function validateSubmission(submission, reservation, artifact, intent) {
  if (!submission?.id || submission.taskId !== intent.taskId || submission.reservationId !== reservation.id || submission.termsVersion !== intent.termsVersion) reject('identity_mismatch', 'Submission identity differs from the current reservation');
  if (!artifact || ['ref', 'digestSha256', 'mediaType', 'bytes'].some(k => submission.artifact?.[k] !== artifact[k])) reject('body_mismatch', 'Submission metadata differs from the original intent');
}

/** One stateless HTTP journey. Server idempotency records are the resume store.
 * The same intent is reused verbatim. No fixture fallback, token output, verifier
 * labels from the caller, local payment record, or inferred public reservation.
 */
export async function contributorJourney({command = 'observe', intent, baseUrl, contributorToken, ownerToken, fetch: fetchImpl, now = new Date()} = {}) {
  if (!['observe', 'resume'].includes(command)) reject('invalid_input', 'Use observe or resume');
  validateIntent(intent);
  const url = new URL(baseUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) reject('invalid_input', 'Use an HTTP base URL without credentials, query, or fragment');
  if (command === 'resume') {
    if (!contributorToken) reject('missing_token', 'Resume requires a contributor bearer');
    requireIdempotencyKey(intent.claimKey);
    if (intent.artifact) requireIdempotencyKey(intent.submissionKey);
  }
  // Supply an explicit HTTP transport via the SDK; never consult ambient owner credentials.
  const sdk = createEarnedWorkSdk({baseUrl, contributorToken, ownerToken, fetch: (url, init) => (fetchImpl ?? globalThis.fetch)(url, {...init, redirect:"manual", signal:AbortSignal.timeout(15000)}), env: {}}).earnedWork;
  let task = result(await sdk.getTask({taskId: intent.taskId}), 'task');
  let correction = validateTask(task, intent);
  let reservation = task.reservation;
  let submission = task.submission;
  const artifact = intent.artifact ? validateArtifact(intent, task) : null;
  if (command === 'observe') {
    if (reservation) validateReservation(reservation, intent);
    if (submission) validateSubmission(submission, reservation, artifact, intent);
  }
  if (command === 'resume') {
    reservation = result(await sdk.createClaim({taskId: intent.taskId, idempotencyKey: intent.claimKey, body: {termsVersion: intent.termsVersion}}), 'reservation');
    validateReservation(reservation, intent);
    // Replayed claim responses retain their original status; wall-clock expiry
    // blocks new work, but a submitted operation may still need exact replay.
    const expired = !Number.isFinite(Date.parse(reservation.expiresAt)) || Date.parse(reservation.expiresAt) <= now.getTime();
    if (artifact) {
      if (expired && task.lifecycle === 'claimed') reject('reservation_expired', 'Reservation expired; do not start or continue work');
      const body = {reservationId: reservation.id, artifact, ...(intent.evidenceBase64 == null ? {} : {evidenceBase64: intent.evidenceBase64})};
      submission = result(await sdk.createSubmission({taskId: intent.taskId, idempotencyKey: intent.submissionKey, body}), 'submission');
      validateSubmission(submission, reservation, artifact, intent);
    }
    task = result(await sdk.getTask({taskId: intent.taskId}), 'task');
    correction = validateTask(task, intent);
    // Owner readback wins over replay snapshots. Compare before joining.
    if (task.reservation) { validateReservation(task.reservation, intent); if (task.reservation.id !== reservation.id) reject('identity_mismatch', 'Current reservation differs from the replayed claim'); }
    if (task.submission) validateSubmission(task.submission, reservation, artifact, intent);
    task = {...task, reservation: task.reservation ?? {...reservation, ...(submission ? {status:'submitted'} : {})}, ...(task.submission ? {} : submission ? {submission} : {})};
  }
  const progress = projectProgress(task, {evidenceClass:'http', now});
  const options = {now, actor: 'contributor', contributorPublicId: intent.contributorPublicId, ...(task.reservation ? {reservationId:task.reservation.id} : {})};
  const expiry = projectExpiryDesk({task, now, actor:'contributor', contributorPublicId:intent.contributorPublicId, reservationId:task.reservation?.id});
  const action = nextAction(task, undefined, options);
  const blocked = progress.codes.includes('foreign_evidence') || expiry.reservationExpired;
  const verificationUnknown = ['verified', 'accepted'].includes(task.lifecycle) && progress.verdictOutcome == null;
  return {
    schema:'neomorphic.contributor-progress.v1', ok:!blocked && !verificationUnknown,
    taskId:task.id, termsVersion:task.termsVersion,
    progress:progress.progress, nextAction:blocked ? 'do_not_start_work' : verificationUnknown ? 'wait_verdict' : action.nextAction,
    reservationId:task.reservation?.id ?? null, submissionId:task.submission?.id ?? null,
    artifactDigestSha256:progress.artifactDigestSha256, verdictId:progress.verdictOutcome ? task.verdict.id : null,
    verdictOutcome:progress.verdictOutcome, verifierVersion:progress.verdictOutcome ? task.verdict.verifierVersion : null,
    verification:blocked ? 'invalid' : verificationUnknown ? 'unknown' : progress.verdictOutcome ?? 'pending',
    correction, expiry, codes:progress.codes, evidence:'http',
    readback:task.verdict ? 'owner' : 'public_or_mutation_receipt',
    paid:false, settled:false, transfer:null,
  };
}
