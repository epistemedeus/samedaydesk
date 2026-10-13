import { createHmac, timingSafeEqual } from 'node:crypto';
import { readCanonicalRoundTerms } from '../earned-work/src/opportunity/terms.js';
import { atomicToDecimal } from '../earned-work/src/opportunity/atomic.js';
import { hashRequest } from '../earned-work/src/crypto.js';
import { SubmissionError } from './submission/validation.js';
import { fail, sourceOf, same } from './review/validation.js';
/** Actual opportunity authority with common read DTOs for the received UI/services.
 * No earned_work_tasks/reservations/submissions/obligations are written here. */
export function createOpportunityJourneyAdapters(options) {
    const signed = (entry) => createHmac('sha256', options.integrityKey).update(hashRequest(entry)).digest('hex');
    const date = (value) => new Date(String(value)).toISOString();
    const load = async (reservationId, taskId) => {
        const found = await options.store.withOpportunityClient(client => client.query(`SELECT to_jsonb(c) AS claim, to_jsonb(r) AS round, to_jsonb(f) AS offer,
       to_jsonb(s) AS submission, to_jsonb(o) AS obligation
       FROM opportunity_claims c JOIN opportunity_rounds r ON r.id=c.round_id
       JOIN opportunity_offers f ON f.id=c.offer_id AND f.round_id=r.id
       LEFT JOIN opportunity_submissions s ON s.claim_id=c.id AND s.round_id=r.id
       LEFT JOIN opportunity_obligations o ON o.claim_id=c.id AND o.round_id=r.id
       WHERE c.id=$1`, [reservationId]), 'read');
        const row = found.rows[0];
        if (!row || !options.futureRounds.some(round => round.roundKey === row.round.round_key && round.provenance === row.round.provenance))
            return null;
        const document = readCanonicalRoundTerms(row.round.terms_document, row.round.terms_version);
        const id = `${row.round.round_key}:${row.offer.offer_key}`;
        if (taskId && taskId !== id)
            return null;
        if (row.claim.terms_version !== row.round.terms_version || row.submission && row.submission.terms_version !== row.claim.terms_version ||
            row.obligation && row.obligation.terms_version !== row.claim.terms_version)
            throw new Error('opportunity source terms invalid');
        const owner = await options.accountForPrincipal(row.claim.contributor_token_id);
        if (!owner)
            return null;
        const principal = await options.principal(owner, row.round.round_key, row.round.provenance);
        if (!principal || principal.id !== row.claim.contributor_token_id)
            return null;
        const record = await options.persistence.load(owner, reservationId);
        if (row.submission) {
            const frozen = record?.frozen;
            if (!frozen || frozen.taskFamily !== 'opportunity' || frozen.accountId !== owner || frozen.reservationId !== reservationId ||
                frozen.taskId !== id || frozen.termsVersion !== row.claim.terms_version ||
                frozen.artifact.ref !== row.submission.artifact_ref || frozen.artifact.digestSha256 !== row.submission.artifact_digest_sha256 ||
                frozen.artifact.bytes !== row.submission.artifact_bytes || frozen.artifact.mediaType !== row.submission.artifact_media_type ||
                hashRequest(JSON.parse(frozen.content)) !== hashRequest(row.submission.evidence))
                throw new Error('opportunity artifact readback invalid');
        }
        return { ...row, id, document, owner, principal, record };
    };
    const reservation = (row) => ({
        id: row.claim.id, taskId: row.id, termsVersion: row.claim.terms_version, contributorPublicId: row.principal.publicId,
        status: (row.claim.status === 'reserved' ? 'active' : row.claim.status === 'owed' || row.claim.status === 'accepted' ? 'completed' : row.claim.status),
        expiresAt: date(row.claim.expires_at), createdAt: date(row.claim.created_at),
    });
    const submission = (row) => row.submission ? ({
        id: row.submission.id, taskId: row.id, reservationId: row.claim.id, termsVersion: row.submission.terms_version,
        artifact: { ref: row.submission.artifact_ref, digestSha256: row.submission.artifact_digest_sha256,
            mediaType: row.submission.artifact_media_type, bytes: row.submission.artifact_bytes }, createdAt: date(row.submission.created_at),
    }) : null;
    const claims = { async lookup(accountId, reservationId) {
            const row = await load(reservationId);
            if (!row || row.owner !== accountId)
                return null;
            return { taskFamily: 'opportunity', accountId, taskId: row.id, reservationId, termsId: `opportunity:${row.round.provenance}:${row.round.round_key}`,
                termsVersion: row.claim.terms_version, currentTermsVersion: row.round.terms_version,
                expiresAt: date(row.claim.expires_at), status: reservation(row).status,
                maxArtifactBytes: row.document.maxEvidenceBytes, allowedMediaTypes: ['application/json'] };
        } };
    const history = async (bound) => {
        const projectId = await options.decisionProject(bound);
        const page = await options.correspondence.listEvents({ projectId, afterSequence: 0, limit: 100 });
        // The existing API supplies a cursor at its tail as well as on full pages.
        if (page.events.length >= 100)
            throw new Error('review decision capacity');
        return page.events.map((event, index) => {
            const parsed = JSON.parse(event.text ?? '{}');
            if (event.sequence !== index + 1 || event.kind !== 'reply' || event.projectId !== projectId || !same(parsed.entry?.source, bound) ||
                !/^[a-f0-9]{64}$/.test(parsed.signature) || !timingSafeEqual(Buffer.from(parsed.signature, 'hex'), Buffer.from(signed(parsed.entry), 'hex')) ||
                !['verdict', 'reject'].includes(parsed.entry.kind) || !/^[a-f0-9]{64}$/.test(parsed.entry.key) || !Number.isFinite(Date.parse(parsed.entry.at)))
                throw new Error('review decision integrity');
            return { event, entry: parsed.entry };
        });
    };
    const review = {
        async read(target) {
            const row = await load(target.reservationId, target.taskId), s = row && submission(row);
            if (!row || !s || !row.record?.frozen)
                return null;
            const bound = { taskId: row.id, reservationId: row.claim.id, submissionId: s.id,
                artifactId: row.record.frozen.artifactId, termsVersion: s.termsVersion, digestSha256: s.artifact.digestSha256,
                mediaType: s.artifact.mediaType, bytes: s.artifact.bytes };
            const events = await history(bound), latest = [...events].reverse().find(item => item.entry.kind === 'verdict');
            const verdict = latest ? { id: latest.event.id, taskId: row.id, reservationId: row.claim.id, submissionId: s.id,
                termsVersion: s.termsVersion, artifactDigestSha256: s.artifact.digestSha256, outcome: latest.entry.outcome,
                ordinal: latest.event.sequence, verifierVersion: 'contributor-opportunity-review/v1', reasons: ['authenticated requester verdict'], createdAt: latest.entry.at } : null;
            const rejected = [...events].reverse().find(item => item.entry.kind === 'reject');
            const reward = { amount: atomicToDecimal(BigInt(row.claim.reward_atomic), row.document.atomicScale), asset: row.document.asset, network: row.document.network };
            const isOwed = row.claim.status === 'owed';
            if (!!row.obligation !== isOwed || isOwed && (!row.obligation || !verdict || verdict.outcome !== 'pass' || row.obligation.paid !== false || row.obligation.transfer !== null ||
                String(row.obligation.reward_atomic) !== String(row.claim.reward_atomic) || row.obligation.settlement_key !== row.claim.settlement_key))
                throw new Error('opportunity obligation integrity');
            const lifecycle = isOwed ? 'accepted' : row.claim.status === 'released' ? 'rejected' : verdict ? 'verified' : 'submitted';
            return {
                authority: { family: 'opportunity', roundKey: row.round.round_key, offerKey: row.offer.offer_key, termsDocument: row.document },
                artifactId: bound.artifactId, rejection: row.claim.status === 'released' && rejected ? { reason: rejected.entry.reason, decidedAt: rejected.entry.at } : null,
                aggregate: {
                    task: { id: row.id, title: row.offer.title, summary: row.offer.summary, provenance: row.round.provenance,
                        lifecycle, fundingState: isOwed ? 'released' : 'reserved', payoutState: isOwed ? 'owed' : 'none',
                        currentTermsVersion: row.round.terms_version, termsRevision: 1, schemaVersion: 1, correctionMaxRevisions: 1,
                        budget: reward, createdAt: date(row.round.created_at), updatedAt: date(row.claim.updated_at) },
                    terms: { version: row.round.terms_version, schemaVersion: 1, termsRevision: 1, summary: row.offer.summary, reward,
                        claimTtlSeconds: row.document.claimTtlSeconds, maxArtifactBytes: row.document.maxEvidenceBytes,
                        allowedMediaTypes: ['application/json'], slotLimit: 1, createdAt: date(row.round.created_at) },
                    reservation: reservation(row), submission: s, submissionEvidenceBytes: Buffer.from(row.record.frozen.content, 'utf8'), verdict,
                    obligation: row.obligation ? { id: row.obligation.id, kind: 'owed_record', adapter: 'null_nonpaying_v0',
                        taskId: row.id, reservationId: row.claim.id, submissionId: s.id, contributorPublicId: row.principal.publicId,
                        payoutDestination: null, reward, payoutState: 'owed', termsVersion: row.obligation.terms_version,
                        idempotencyKey: '', verdictId: verdict.id, transfer: null, note: 'Original opportunity IOU; kernelObligationMinted:false', createdAt: date(row.obligation.created_at) } : null,
                },
            };
        },
        async verdict(bound, outcome, key) {
            const project = await options.decisionProject(bound);
            return options.lock.run(`opportunity-review:${project}`, async () => {
                const current = await review.read(bound);
                if (!current || !same(sourceOf(current, bound), bound))
                    fail(409, 'stale_source', 'Reload the submitted source.');
                if (current.aggregate.obligation || current.aggregate.reservation?.status !== 'submitted')
                    fail(409, 'conflict', 'This review is closed.');
                const events = await history(bound), prior = events.find(item => item.entry.key === key);
                if (prior) {
                    if (prior.entry.kind !== 'verdict' || prior.entry.outcome !== outcome)
                        fail(409, 'idempotency_conflict', 'This operation changed.');
                    return { verdictId: prior.event.id };
                }
                const entry = { source: bound, kind: 'verdict', outcome, key, at: options.store.now().toISOString() };
                const result = await options.correspondence.createEvent({ projectId: project, kind: 'reply', text: JSON.stringify({ entry, signature: signed(entry) }),
                    idempotencyKey: `opportunity-verdict:${key}`, requestHash: hashRequest(entry) });
                return { verdictId: result.event.id };
            });
        },
        async accept(bound, verdictId, key) {
            const project = await options.decisionProject(bound);
            await options.lock.run(`opportunity-review:${project}`, async () => {
                const current = await review.read(bound);
                if (!current || !same(sourceOf(current, bound), bound))
                    fail(409, 'stale_source', 'Reload the submitted source.');
                if (current.aggregate.verdict?.id !== verdictId || current.aggregate.verdict.outcome !== 'pass')
                    fail(409, 'verdict_required', 'The exact pass verdict is required.');
                const row = (await load(bound.reservationId, bound.taskId));
                await options.opportunity.accept(row.round.round_key, bound.reservationId, row.round.provenance, key, null, { submissionId: bound.submissionId, artifactDigestSha256: bound.digestSha256, termsVersion: bound.termsVersion });
            });
        },
        async reject(bound, reason, key) {
            const project = await options.decisionProject(bound);
            await options.lock.run(`opportunity-review:${project}`, async () => {
                const current = await review.read(bound);
                if (!current || !same(sourceOf(current, bound), bound))
                    fail(409, 'stale_source', 'Reload the submitted source.');
                const events = await history(bound), prior = events.find(item => item.entry.key === key);
                if (prior && (prior.entry.kind !== 'reject' || prior.entry.reason !== reason))
                    fail(409, 'idempotency_conflict', 'This rejection changed.');
                if (!prior) {
                    const entry = { source: bound, kind: 'reject', reason, key, at: options.store.now().toISOString() };
                    await options.correspondence.createEvent({ projectId: project, kind: 'reply', text: JSON.stringify({ entry, signature: signed(entry) }),
                        idempotencyKey: `opportunity-reject:${key}`, requestHash: hashRequest(entry) });
                }
                const row = (await load(bound.reservationId, bound.taskId));
                await options.opportunity.rejectSubmission(row.round.round_key, bound.reservationId, row.round.provenance, key, { submissionId: bound.submissionId, artifactDigestSha256: bound.digestSha256, termsVersion: bound.termsVersion }, reason);
            });
        },
    };
    const submissionPort = {
        async read(accountId, claim) {
            const row = await load(claim.reservationId, claim.taskId);
            if (!row || row.owner !== accountId)
                throw new SubmissionError('forbidden', 'This claim is private.');
            const s = submission(row), reviewed = s ? await review.read(claim) : null;
            return { submission: s, task: { id: row.id, reservation: reservation(row), submission: s,
                    verdict: reviewed?.aggregate.verdict ?? null, termsVersion: row.round.terms_version,
                    lifecycle: reviewed?.aggregate.task.lifecycle ?? 'claimed', payoutState: row.obligation ? 'owed' : 'none' } };
        },
        async submit(accountId, claim, delivery) {
            const row = await load(claim.reservationId, claim.taskId);
            if (!row || row.owner !== accountId || delivery.taskFamily !== 'opportunity' || delivery.accountId !== accountId ||
                delivery.reservationId !== claim.reservationId || delivery.termsVersion !== claim.termsVersion)
                throw new SubmissionError('forbidden', 'This claim is private.');
            const receipt = await options.opportunity.submit(row.round.round_key, claim.reservationId, { provenance: row.round.provenance, artifact: delivery.artifact, evidence: JSON.parse(delivery.content) }, row.principal, delivery.kernelIdempotencyKey);
            if (receipt.statusCode >= 400)
                throw new SubmissionError('kernel_refused', 'The opportunity authority refused delivery.');
        },
    };
    return { claims, submission: submissionPort, review, load };
}
//# sourceMappingURL=opportunity-adapters.js.map