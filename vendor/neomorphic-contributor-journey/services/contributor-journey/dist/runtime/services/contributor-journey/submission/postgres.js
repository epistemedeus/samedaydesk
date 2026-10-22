import { readFile } from 'node:fs/promises';
import { parseRecord, refuse } from './validation.js';
/** Submission-specific drafts/intents only. Kernel records remain in earned-work. */
export class PostgresSubmissionPersistence {
    pool;
    schemaIdent;
    constructor(pool, schema) {
        this.pool = pool;
        if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema))
            throw new Error('Invalid submission schema');
        this.schemaIdent = `"${schema}"`;
    }
    /** Explicit staging migration, called by integration owner before enabling routes. */
    async migrate() {
        const sql = await readFile(new URL('./migrations/001_submission_drafts.sql', import.meta.url), 'utf8');
        await this.tx(async (client) => { await client.query(sql); });
    }
    async tx(work) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(`SET LOCAL search_path TO ${this.schemaIdent}`);
            const result = await work(client);
            await client.query('COMMIT');
            return result;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async lock(client, reservationId) {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 227300))", [reservationId]);
    }
    async row(client, accountId, reservationId) {
        const result = await client.query('SELECT record FROM journey_submission_drafts WHERE account_id = $1 AND reservation_id = $2', [accountId, reservationId]);
        return result.rows[0] ? parseRecord(result.rows[0].record) : null;
    }
    async load(accountId, reservationId) {
        return this.tx(client => this.row(client, accountId, reservationId));
    }
    async save(draft, expectedRevision, key, hash) {
        return this.tx(async (client) => {
            await this.lock(client, draft.reservationId);
            const existing = await this.row(client, draft.accountId, draft.reservationId);
            const replay = await client.query('SELECT request_hash, saved_revision FROM journey_submission_draft_saves WHERE account_id=$1 AND reservation_id=$2 AND operation_key=$3', [draft.accountId, draft.reservationId, key]);
            if (replay.rows[0]) {
                if (replay.rows[0].request_hash !== hash)
                    refuse('idempotency_conflict', 'This save key was already used for different evidence.');
                if (!existing)
                    refuse('storage_invalid', 'Saved draft is missing.');
                return { record: existing, savedRevision: replay.rows[0].saved_revision, replayed: true };
            }
            if (existing?.frozen)
                refuse('immutable_submission', 'Delivery has been frozen. Read submission status before taking another action.');
            if ((existing?.draft.revision ?? 0) !== expectedRevision)
                refuse('revision_conflict', 'A newer draft exists. Resume it before saving.');
            if (existing && ['accountId', 'taskId', 'reservationId', 'termsId', 'termsVersion'].some(field => existing.draft[field] !== draft[field]))
                refuse('terms_changed', 'Draft is bound to different claim terms.');
            const record = parseRecord({ draft, frozen: null });
            await client.query('INSERT INTO journey_submission_drafts(account_id,reservation_id,record) VALUES($1,$2,$3::jsonb) ON CONFLICT(account_id,reservation_id) DO UPDATE SET record=EXCLUDED.record', [draft.accountId, draft.reservationId, JSON.stringify(record)]);
            await client.query('INSERT INTO journey_submission_draft_saves(account_id,reservation_id,operation_key,request_hash,saved_revision) VALUES($1,$2,$3,$4,$5)', [draft.accountId, draft.reservationId, key, hash, draft.revision]);
            return { record, savedRevision: draft.revision, replayed: false };
        });
    }
    async freeze(accountId, reservationId, expectedRevision, build) {
        return this.tx(async (client) => {
            await this.lock(client, reservationId);
            const existing = await this.row(client, accountId, reservationId);
            if (!existing)
                refuse('not_found', 'Save a draft before delivery.');
            if (existing.draft.revision !== expectedRevision)
                refuse('revision_conflict', 'Resume the latest draft before delivery.');
            if (existing.frozen)
                return existing;
            const record = parseRecord({ draft: existing.draft, frozen: build(existing.draft) });
            await client.query('UPDATE journey_submission_drafts SET record=$3::jsonb WHERE account_id=$1 AND reservation_id=$2', [accountId, reservationId, JSON.stringify(record)]);
            return record;
        });
    }
}
//# sourceMappingURL=postgres.js.map