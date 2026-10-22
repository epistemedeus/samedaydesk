import { z } from 'zod';
import { hashRequest, newId } from '../../earned-work/src/crypto.js';
import { projectProgress as existingProgress } from '../../../packs/submission-progress/src/project.mjs';
const projectProgress = existingProgress;
import { kernelPayload } from './kernel.js';
import { boundedEvidence, keySchema, opaqueId, refuse, saveSchema, SubmissionError, submitSchema } from './validation.js';
const authSchema = z.object({ accountId: opaqueId, sessionId: opaqueId, authTime: z.string().datetime(), expiresAt: z.string().datetime() });
const claimSchema = z.object({ accountId: opaqueId, taskId: opaqueId, reservationId: opaqueId, termsId: opaqueId,
    taskFamily: z.enum(['kernel', 'opportunity']).optional(),
    termsVersion: z.string().regex(/^sha256:[0-9a-f]{64}$/), currentTermsVersion: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    expiresAt: z.string().datetime(), status: z.enum(['active', 'submitted', 'expired', 'released', 'completed']),
    maxArtifactBytes: z.number().int().positive(), allowedMediaTypes: z.array(z.string()).min(1) });
export class SubmissionService {
    ports;
    constructor(ports) {
        this.ports = ports;
    }
    now() { return this.ports.clock?.() ?? new Date(); }
    async result(work) {
        try {
            return { ok: true, value: await work() };
        }
        catch (error) {
            if (error instanceof SubmissionError)
                return { ok: false, error: { code: error.code, message: error.message } };
            return { ok: false, error: { code: 'temporarily_unavailable', message: 'Status could not be confirmed. Resume the same draft and read status.' } };
        }
    }
    authenticate(raw) {
        const parsed = authSchema.safeParse(raw);
        if (!parsed.success || Date.parse(parsed.data.expiresAt) <= this.now().getTime() || Date.parse(parsed.data.authTime) > this.now().getTime())
            refuse('unauthorized', 'Sign in again to continue.');
        return parsed.data;
    }
    async claim(account, reservationId) {
        this.authenticate(account);
        if (!opaqueId.safeParse(reservationId).success)
            refuse('invalid_input', 'A valid reservation is required.');
        const raw = await this.ports.claims.lookup(account.accountId, reservationId);
        if (!raw)
            refuse('not_found', 'Claim not found for this account.');
        const parsed = claimSchema.safeParse(raw);
        if (!parsed.success)
            refuse('foreign_evidence', 'Claim authority returned an invalid binding.');
        const claim = parsed.data;
        if (claim.accountId !== account.accountId || claim.reservationId !== reservationId)
            refuse('forbidden', 'Claim belongs to another account or reservation.');
        return claim;
    }
    open(claim) {
        if (claim.currentTermsVersion !== claim.termsVersion)
            refuse('terms_changed', 'This claim’s terms changed. Read the task before continuing.');
        if (claim.status !== 'active' || Date.parse(claim.expiresAt) <= this.now().getTime())
            refuse('late_submission', 'This reservation is no longer open for delivery.');
    }
    bind(record, claim) {
        if (!record)
            return;
        for (const field of ['accountId', 'taskId', 'reservationId', 'termsId', 'termsVersion', 'taskFamily']) {
            if (record.draft[field] !== claim[field])
                refuse('foreign_evidence', 'Stored draft does not match this claim.');
        }
    }
    async observe(claim, record) {
        const base = { taskId: claim.taskId, reservationId: claim.reservationId, termsId: claim.termsId,
            termsVersion: claim.termsVersion, draftRevision: record?.draft.revision ?? null, observedAt: this.now().toISOString() };
        let snapshot;
        try {
            snapshot = await this.ports.kernel.read(claim.accountId, claim);
        }
        catch (error) {
            if (error instanceof SubmissionError && ['forbidden', 'unauthorized', 'not_found', 'foreign_evidence'].includes(error.code))
                throw error;
            return { ...base, deliveryState: 'unknown', editable: false, authoritative: false,
                progress: 'unknown', nextAction: 'read_status', submission: null };
        }
        const { submission, task } = snapshot;
        if (task.id !== claim.taskId || task.reservation?.id !== claim.reservationId ||
            task.reservation?.taskId !== claim.taskId || task.reservation?.termsVersion !== claim.termsVersion ||
            hashRequest(task.submission) !== hashRequest(submission))
            refuse('foreign_evidence', 'Kernel readback does not match this claim.');
        if (submission) {
            if (submission.taskId !== claim.taskId || submission.reservationId !== claim.reservationId || submission.termsVersion !== claim.termsVersion)
                refuse('foreign_evidence', 'Kernel submission is bound to another claim.');
            const frozen = record?.frozen;
            if (frozen && (submission.artifact.ref !== frozen.artifact.ref || submission.artifact.digestSha256 !== frozen.artifact.digestSha256 || submission.artifact.bytes !== frozen.artifact.bytes || submission.artifact.mediaType !== frozen.artifact.mediaType))
                refuse('foreign_evidence', 'Kernel submission does not match the frozen evidence.');
        }
        // The existing progress model only interprets identity-bound verdicts.
        const progress = projectProgress(task, { now: this.now(), evidenceClass: 'kernel_readback' });
        if (progress.codes.length)
            refuse('foreign_evidence', 'Kernel progress contains unbound evidence.');
        if (!submission && ['submitted', 'verified', 'accepted'].includes(task.lifecycle))
            return {
                ...base, deliveryState: 'unknown', editable: false, authoritative: false, progress: 'unknown', nextAction: 'read_status', submission: null
            };
        const editable = !record?.frozen && !submission && claim.status === 'active' &&
            claim.currentTermsVersion === claim.termsVersion && Date.parse(claim.expiresAt) > this.now().getTime();
        return { ...base, deliveryState: submission ? 'submitted' : record?.frozen ? 'unknown' : 'draft',
            editable, authoritative: true, progress: progress.progress,
            nextAction: submission ? progress.nextAction : editable ? 'save_draft' : record?.frozen ? 'resume_delivery' : 'read_task',
            submission: submission ? { submissionId: submission.id,
                artifactId: record?.frozen?.artifactId ?? submission.artifact.ref,
                digest: submission.artifact.digestSha256, mediaType: submission.artifact.mediaType,
                bytes: submission.artifact.bytes, submittedAt: submission.createdAt, termsVersion: submission.termsVersion } : null };
    }
    read(account, reservationId) {
        return this.result(async () => {
            const claim = await this.claim(account, reservationId);
            const record = await this.ports.persistence.load(account.accountId, claim.reservationId);
            this.bind(record, claim);
            return { draft: record?.draft ?? null, status: await this.observe(claim, record) };
        });
    }
    save(account, raw, idempotencyKey) {
        return this.result(async () => {
            const body = saveSchema.safeParse(raw);
            if (!body.success || !keySchema.safeParse(idempotencyKey).success)
                refuse('invalid_input', 'Provide a valid draft, revision and save key.');
            const input = body.data;
            const claim = await this.claim(account, input.reservationId);
            if (input.termsVersion !== claim.termsVersion)
                refuse('terms_changed', 'Draft terms do not match the reservation.');
            this.open(claim);
            boundedEvidence(input.evidence, claim);
            const saved = await this.ports.persistence.save({ accountId: account.accountId, taskId: claim.taskId,
                ...(claim.taskFamily ? { taskFamily: claim.taskFamily } : {}),
                reservationId: claim.reservationId, termsId: claim.termsId, termsVersion: claim.termsVersion,
                evidence: input.evidence, revision: input.expectedRevision + 1, updatedAt: this.now().toISOString() }, input.expectedRevision, idempotencyKey, hashRequest(input));
            this.bind(saved.record, claim);
            return { draft: saved.record.draft, savedRevision: saved.savedRevision, replayed: saved.replayed };
        });
    }
    submit(account, raw) {
        return this.result(async () => {
            const body = submitSchema.safeParse(raw);
            if (!body.success)
                refuse('invalid_input', 'Deliver an exact saved draft revision.');
            const claim = await this.claim(account, body.data.reservationId);
            let record = await this.ports.persistence.load(account.accountId, claim.reservationId);
            this.bind(record, claim);
            if (!record)
                refuse('not_found', 'Save a draft before delivery.');
            if (record.draft.revision !== body.data.expectedRevision)
                refuse('revision_conflict', 'Resume the latest draft before delivery.');
            const before = await this.observe(claim, record);
            if (before.deliveryState === 'submitted')
                return before;
            if (!before.authoritative)
                return before;
            this.open(claim);
            record = await this.ports.persistence.freeze(account.accountId, claim.reservationId, body.data.expectedRevision, draft => {
                const encoded = boundedEvidence(draft.evidence, claim);
                const artifactId = newId('evidence');
                const artifact = { ref: `journey-artifact:${artifactId}`, digestSha256: encoded.digest, mediaType: encoded.mediaType, bytes: encoded.bytes };
                const delivery = { artifactId, artifact, content: encoded.content, sourceReferences: encoded.sources,
                    ...(draft.taskFamily ? { taskFamily: draft.taskFamily } : {}),
                    accountId: account.accountId, taskId: claim.taskId, reservationId: claim.reservationId,
                    termsId: claim.termsId, termsVersion: claim.termsVersion, revision: draft.revision,
                    kernelIdempotencyKey: `journey-submit:${artifactId}`, requestHash: '', frozenAt: this.now().toISOString() };
                delivery.requestHash = hashRequest(kernelPayload(delivery));
                return delivery;
            });
            this.bind(record, claim);
            let submitError;
            try {
                await this.ports.kernel.submit(account.accountId, claim, record.frozen);
            }
            catch (error) {
                submitError = error;
            }
            const after = await this.observe(claim, record);
            if (after.deliveryState === 'submitted' || !after.authoritative)
                return after;
            if (submitError) {
                const code = submitError.code;
                if (['late_submission', 'terms_changed', 'forbidden', 'unauthorized', 'oversize', 'invalid_input', 'duplicate_submission'].includes(String(code))) {
                    const mapped = { late_submission: 'late_submission', terms_changed: 'terms_changed', forbidden: 'forbidden', unauthorized: 'unauthorized', oversize: 'oversize', invalid_input: 'invalid_input', duplicate_submission: 'foreign_evidence' };
                    refuse(mapped[code], 'The kernel refused delivery. Read the claim and submission status.');
                }
                // Even a currently empty read cannot disprove an in-flight commit after timeout.
                return { ...after, deliveryState: 'unknown', authoritative: false, progress: 'unknown', nextAction: 'read_status' };
            }
            return { ...after, deliveryState: 'unknown', authoritative: false, progress: 'unknown', nextAction: 'read_status' };
        });
    }
}
//# sourceMappingURL=service.js.map