import { readFile } from 'node:fs/promises';
import { createHmac, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { hashRequest } from '../earned-work/src/crypto.js';
import { reviewProjectSummary } from './review/adapters.js';
import { publicationText } from './showcase/validation.js';
const profile = z.object({ profileId: z.string(), accountId: z.string(), displayName: z.string().min(1).max(80),
    visible: z.boolean(), consentVersion: z.number().int().positive() }).strict();
export class CompositionStore {
    kernel;
    correspondence;
    integrityKey;
    constructor(kernel, correspondence, integrityKey) {
        this.kernel = kernel;
        this.correspondence = correspondence;
        this.integrityKey = integrityKey;
    }
    async migrate() {
        const sql = await readFile(new URL('./migrations/001_composition.sql', import.meta.url), 'utf8');
        await this.kernel.withOpportunityClient(async (client) => { await client.query("SELECT pg_advisory_xact_lock(hashtextextended('journey-composition-migrate',227800))"); await client.query(sql); }, 'idempotent');
    }
    async accountForPrincipal(principalId) {
        return this.kernel.withOpportunityClient(async (client) => (await client.query('SELECT account_id FROM journey_account_kernel_bindings WHERE principal_id=$1', [principalId])).rows[0]?.account_id ?? null, 'read');
    }
    async round(roundKey) {
        return this.kernel.withOpportunityClient(async (client) => (await client.query('SELECT id, provenance FROM opportunity_rounds WHERE round_key=$1', [roundKey])).rows[0] ?? null, 'read');
    }
    async task(taskId) {
        return this.kernel.withOpportunityClient(async (client) => (await client.query('SELECT * FROM journey_task_links WHERE task_id=$1', [taskId])).rows[0] ?? null, 'read');
    }
    /** Controller-only enrollment after a synthetic round is created. No HTTP inventory route. */
    async enrollTask(taskId, requesterAccountId) {
        const roundKey = taskId.split(':')[0];
        if (['agent-opportunity-221400-v1', 'contributor-reuse-trial-100198'].includes(roundKey))
            throw new Error('historical rounds are not future inventory');
        const round = await this.round(roundKey);
        if (!round || !['test', 'fixture'].includes(round.provenance))
            throw new Error('only existing synthetic rounds may be enrolled');
        const marker = `discussion:${hashRequest({ taskId })}`;
        const project = await this.correspondence.createProject({ title: 'Task discussion', summary: marker,
            ownerTokenHash: hashRequest({ marker, secret: this.integrityKey }), ownerTokenPlainForReplay: '',
            idempotencyKey: marker, requestHash: hashRequest({ taskId, requesterAccountId }) });
        return this.kernel.withOpportunityClient(async (client) => {
            await client.query('INSERT INTO journey_task_links(task_id,round_key,requester_account_id,discussion_project_id,public_discussion) VALUES($1,$2,$3,$4,TRUE) ON CONFLICT(task_id) DO NOTHING', [taskId, roundKey, requesterAccountId, project.project.id]);
            const stored = (await client.query('SELECT * FROM journey_task_links WHERE task_id=$1', [taskId])).rows[0];
            if (stored.requester_account_id !== requesterAccountId || stored.discussion_project_id !== project.project.id)
                throw new Error('task authority already enrolled');
            return stored;
        }, 'idempotent');
    }
    async project(source, kind) {
        const sourceHash = hashRequest(source);
        const summary = kind === 'clarification' ? reviewProjectSummary(source) : `opportunity-decision:${sourceHash}`;
        // Existing correspondence bootstrap/readback is idempotent; the raw owner
        // grant is never exposed and no participant can bypass the module journal.
        const project = await this.correspondence.createProject({ title: 'Private requester review', summary,
            ownerTokenHash: createHmac('sha256', this.integrityKey).update(summary).digest('hex'), ownerTokenPlainForReplay: '',
            idempotencyKey: `journey-${kind}-${sourceHash}`, requestHash: hashRequest({ source, kind }) });
        return this.kernel.withOpportunityClient(async (client) => {
            await client.query('INSERT INTO journey_review_links(source_hash,kind,project_id) VALUES($1,$2,$3) ON CONFLICT(source_hash,kind) DO NOTHING', [sourceHash, kind, project.project.id]);
            const id = (await client.query('SELECT project_id FROM journey_review_links WHERE source_hash=$1 AND kind=$2', [sourceHash, kind])).rows[0].project_id;
            if (id !== project.project.id)
                throw new Error('review project mapping conflict');
            return id;
        }, 'idempotent');
    }
    async workId(taskId, reservationId, accountId) {
        return this.kernel.withOpportunityClient(async (client) => {
            await client.query('INSERT INTO journey_work_links(work_id,task_id,reservation_id,account_id) VALUES($1,$2,$3,$4) ON CONFLICT(reservation_id) DO NOTHING', [`work_${randomBytes(18).toString('hex')}`, taskId, reservationId, accountId]);
            const row = (await client.query('SELECT * FROM journey_work_links WHERE reservation_id=$1', [reservationId])).rows[0];
            if (row.task_id !== taskId || row.account_id !== accountId)
                throw new Error('work mapping conflict');
            return row.work_id;
        }, 'idempotent');
    }
    async work(workId) {
        return this.kernel.withOpportunityClient(async (client) => (await client.query('SELECT * FROM journey_work_links WHERE work_id=$1', [workId])).rows[0] ?? null, 'read');
    }
    async profile(profileId) {
        return this.kernel.withOpportunityClient(async (client) => {
            const row = (await client.query('SELECT record FROM journey_profile_publications WHERE profile_id=$1', [profileId])).rows[0];
            return row ? profile.parse(row.record) : null;
        }, 'read');
    }
    async profileForAccount(accountId) {
        const row = await this.kernel.withOpportunityClient(async (client) => {
            const row = (await client.query('SELECT public_profile_id FROM journey_accounts WHERE id=$1', [accountId])).rows[0];
            return row ?? null;
        }, 'read');
        return row ? { profileId: row.public_profile_id, publication: await this.profile(row.public_profile_id) } : null;
    }
    async publishProfile(accountId, raw, key) {
        const parsed = z.object({ expectedVersion: z.number().int().nonnegative(), displayName: z.string().min(1).max(80).refine(value => publicationText(value, 80) && !/\b(?:acc|ses|ctr|tok|clm|sub|obl|acs|acr)_[a-zA-Z0-9_-]{8,}/.test(value)), visibilityConsent: z.boolean() }).strict().parse(raw);
        if (!/^[a-zA-Z0-9_:-]{8,128}$/.test(key))
            throw new Error('profile key required');
        return this.kernel.withOpportunityClient(async (client) => {
            await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,227800))', [`profile:${accountId}`]);
            const actor = (await client.query('SELECT public_profile_id FROM journey_accounts WHERE id=$1', [accountId])).rows[0];
            if (!actor)
                throw new Error('account not found');
            const prior = (await client.query('SELECT * FROM journey_profile_operations WHERE account_id=$1 AND operation_key=$2', [accountId, key])).rows[0];
            const current = (await client.query('SELECT record FROM journey_profile_publications WHERE account_id=$1', [accountId])).rows[0]?.record;
            if (prior) {
                if (prior.request_hash !== hashRequest(parsed))
                    throw new Error('idempotency_conflict');
                return profile.parse(current);
            }
            if ((current?.consentVersion ?? 0) !== parsed.expectedVersion)
                throw new Error('profile version conflict');
            const record = { profileId: actor.public_profile_id, accountId, displayName: parsed.displayName,
                visible: parsed.visibilityConsent, consentVersion: parsed.expectedVersion + 1 };
            await client.query('INSERT INTO journey_profile_publications(profile_id,account_id,record) VALUES($1,$2,$3) ON CONFLICT(profile_id) DO UPDATE SET record=EXCLUDED.record', [record.profileId, accountId, record]);
            await client.query('INSERT INTO journey_profile_operations(account_id,operation_key,request_hash,result_version) VALUES($1,$2,$3,$4)', [accountId, key, hashRequest(parsed), record.consentVersion]);
            return record;
        }, 'idempotent');
    }
}
//# sourceMappingURL=composition-store.js.map