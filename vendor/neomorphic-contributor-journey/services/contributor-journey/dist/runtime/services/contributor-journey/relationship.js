import { z } from 'zod';
import { hashRequest } from '../earned-work/src/crypto.js';
import { acceptedWorkValid } from './showcase/work-source.js';
const seconds = z.number().int().min(0).max(604800).nullable();
const inputSchema = z.object({ expectedRevision: z.number().int().min(0).max(9999),
    useful: z.enum(['useful', 'not_useful', 'unknown']).optional(), effortSeconds: seconds.optional() }).strict();
/** Private statements, not acceptance/payment/publication authority. Only exact
 * authenticated counterparties may report, and every revision retains its source. */
export function createRelationshipService(options) {
    const source = (work) => {
        const { workId, taskId, reservationId, submissionId, verdictId, obligationId, termsVersion, artifactDigestSha256, accountId, contributorPrincipalId } = work.binding;
        return hashRequest({ workId, taskId, reservationId, submissionId, verdictId, obligationId, termsVersion, artifactDigestSha256, accountId, contributorPrincipalId });
    };
    async function authority(account, workId, role) {
        const active = await options.kernel.withOpportunityClient(async (client) => (await client.query('SELECT id FROM journey_account_sessions WHERE id=$1 AND account_id=$2 AND revoked_at IS NULL AND auth_time<=CURRENT_TIMESTAMP AND expires_at>CURRENT_TIMESTAMP', [account.sessionId, account.accountId])).rows.length === 1, 'read');
        if (!active)
            return null;
        const work = await options.works.read(workId);
        if (!work || !acceptedWorkValid(work, workId))
            return null;
        const requester = await options.requester(work.binding.taskId);
        if (!requester || account.accountId !== (role === 'requester' ? requester : work.binding.accountId))
            return null;
        return work;
    }
    return { source,
        async report(account, workId, role, raw, key) {
            const input = inputSchema.parse(raw);
            if (!/^[A-Za-z0-9_:-]{8,128}$/.test(key) || (!Object.hasOwn(input, 'useful') && !Object.hasOwn(input, 'effortSeconds')) ||
                (role === 'contributor' && input.useful !== undefined))
                return { ok: false, code: 'invalid_input' };
            const initial = await authority(account, workId, role);
            if (!initial)
                return { ok: false, code: 'not_found' };
            return options.kernel.withOpportunityClient(async (client) => {
                await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,230100))', [`relationship:${workId}:${role}`]);
                const work = await authority(account, workId, role);
                if (!work || source(work) !== source(initial))
                    return { ok: false, code: 'source_changed' };
                const requestHash = hashRequest({ workId, role, input });
                const old = (await client.query('SELECT request_hash,record FROM journey_relationship_observations WHERE account_id=$1 AND operation_key=$2', [account.accountId, key])).rows[0];
                if (old)
                    return old.request_hash === requestHash ? { ok: true, value: old.record, replayed: true } : { ok: false, code: 'idempotency_conflict' };
                const prior = (await client.query('SELECT record FROM journey_relationship_observations WHERE work_id=$1 AND role=$2 ORDER BY revision DESC LIMIT 1', [workId, role])).rows[0]?.record;
                if ((prior?.revision ?? 0) !== input.expectedRevision)
                    return { ok: false, code: 'conflict' };
                // One bounded private observation journal; no raw text, evidence, contact or amount.
                await client.query("SELECT pg_advisory_xact_lock(hashtextextended('journey-relationship-capacity',230100))");
                if (Number((await client.query('SELECT count(*) AS n FROM journey_relationship_observations')).rows[0].n) >= 5000)
                    return { ok: false, code: 'capacity' };
                const record = { eventId: 'rel_' + hashRequest({ workId, role, accountId: account.accountId, key }),
                    workId, role, accountId: account.accountId, revision: input.expectedRevision + 1, supersedes: prior?.eventId ?? null,
                    sourceDigest: source(work), useful: input.useful ?? prior?.useful ?? null,
                    effortSeconds: input.effortSeconds === undefined ? prior?.effortSeconds ?? null : input.effortSeconds,
                    reportedAt: new Date().toISOString(), evidence: 'self_report' };
                await client.query('INSERT INTO journey_relationship_observations(event_id,work_id,role,account_id,revision,operation_key,request_hash,record) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [record.eventId, workId, role, account.accountId, record.revision, key, requestHash, record]);
                return { ok: true, value: record, replayed: false };
            }, 'idempotent');
        },
        async read(account, workId) {
            if (!await authority(account, workId, 'requester') && !await authority(account, workId, 'contributor'))
                return { ok: false, code: 'not_found' };
            const rows = await options.kernel.withOpportunityClient(client => client.query('SELECT DISTINCT ON(role) record FROM journey_relationship_observations WHERE work_id=$1 ORDER BY role,revision DESC', [workId]), 'read');
            return { ok: true, value: rows.rows.map(row => row.record) };
        },
        async current(work) {
            const requester = await options.requester(work.binding.taskId);
            const rows = await options.kernel.withOpportunityClient(client => client.query('SELECT record FROM journey_relationship_observations WHERE work_id=$1 ORDER BY role,revision', [work.binding.workId]), 'read');
            return rows.rows.map(row => row.record).filter(row => row.sourceDigest === source(work) &&
                row.accountId === (row.role === 'requester' ? requester : work.binding.accountId));
        } };
}
//# sourceMappingURL=relationship.js.map