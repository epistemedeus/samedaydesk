import { bindReceivedEvidence } from '../../earned-work/src/evidence.js';
import { hashRequest } from '../../earned-work/src/crypto.js';
import { refuse } from './validation.js';
export function kernelPayload(delivery) {
    return { reservationId: delivery.reservationId, artifact: delivery.artifact,
        evidenceBase64: Buffer.from(delivery.content, 'utf8').toString('base64') };
}
export function createPostgresReservationOwnerCheck(pool, schema) {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema))
        throw new Error('Invalid earned-work schema');
    return async (claim, contributor) => {
        const result = await pool.query(`SELECT task_id, terms_version, contributor_token_id FROM "${schema}".earned_work_reservations WHERE id = $1`, [claim.reservationId]);
        const row = result.rows[0];
        if (!row || row.task_id !== claim.taskId || row.terms_version !== claim.termsVersion || row.contributor_token_id !== contributor.id) {
            refuse('forbidden', 'Credential does not own this exact reservation.');
        }
    };
}
export function createEarnedWorkSubmissionPort(options) {
    async function principal(accountId, claim) {
        if (claim.accountId !== accountId)
            refuse('forbidden', 'Claim belongs to another account.');
        const contributor = await options.resolvePrincipal(accountId, claim.reservationId);
        if (contributor.expiresAt && Date.parse(contributor.expiresAt) <= options.store.now().getTime())
            refuse('unauthorized', 'Contributor credential expired.');
        if (contributor.taskScope && contributor.taskScope !== claim.taskId)
            refuse('forbidden', 'Contributor credential is scoped to another task.');
        await options.assertReservationOwner(claim, contributor);
        return contributor;
    }
    return {
        async read(accountId, claim) {
            const contributor = await principal(accountId, claim);
            // The kernel confirms a private credential owns a reservation, independent of public label.
            await options.store.getContributorObligationReadback(claim.taskId, contributor);
            const agg = await options.store.getTask(claim.taskId);
            if (!agg || agg.reservation?.id !== claim.reservationId)
                refuse('not_found', 'Kernel reservation is no longer the current claim.');
            const task = { id: agg.task.id, lifecycle: agg.task.lifecycle, payoutState: agg.task.payoutState,
                termsVersion: agg.task.currentTermsVersion, reservation: agg.reservation,
                submission: agg.submission, verdict: agg.verdict };
            return { submission: agg.submission, task };
        },
        async submit(accountId, claim, delivery) {
            const contributor = await principal(accountId, claim);
            const bytes = Buffer.from(delivery.content, 'utf8');
            bindReceivedEvidence(delivery.artifact, bytes);
            if (hashRequest(kernelPayload(delivery)) !== delivery.requestHash)
                refuse('storage_invalid', 'Stored kernel request hash does not match the evidence.');
            await options.store.submit({ taskId: claim.taskId, reservationId: claim.reservationId, contributor,
                artifact: delivery.artifact, evidenceBytes: bytes, idempotencyKey: delivery.kernelIdempotencyKey,
                requestHash: delivery.requestHash });
        },
    };
}
//# sourceMappingURL=kernel.js.map