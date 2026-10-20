import { shareRecord, eventRecord, hash } from './validation.js';
/** Tailored durable adapter for the received referral ports, in the composition schema. */
export function createPostgresReferralPorts(store) {
    const decode = (raw) => {
        if (raw == null)
            return null;
        if (!shareRecord(raw))
            throw new Error('invalid referral storage');
        return raw;
    };
    const repository = {
        async readShare(ref) {
            return store.withOpportunityClient(async (client) => decode((await client.query('SELECT record FROM journey_referral_shares WHERE share_ref=$1', [ref])).rows[0]?.record), 'read');
        },
        async readOperation(accountId, key) {
            return store.withOpportunityClient(async (client) => {
                const row = (await client.query('SELECT record FROM journey_referral_operations WHERE account_id=$1 AND operation_key=$2', [accountId, key])).rows[0];
                if (!row)
                    return null;
                const record = row.record;
                if (record.accountId !== accountId || record.operationKey !== key || !/^[a-f0-9]{64}$/.test(record.bodyDigest))
                    throw new Error('invalid referral operation');
                return record;
            }, 'read');
        },
        async commitShare(input) {
            if (!shareRecord(input.record) || input.operation.accountId !== input.record.ownerAccountId || input.operation.shareRef !== input.record.shareRef || input.operation.revision !== input.record.revision)
                throw new Error('invalid share write');
            return store.withOpportunityClient(async (client) => {
                await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,227700))', [input.record.shareRef]);
                await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,227701))', [`${input.operation.accountId}:${input.operation.operationKey}`]);
                const prior = (await client.query('SELECT record FROM journey_referral_operations WHERE account_id=$1 AND operation_key=$2', [input.operation.accountId, input.operation.operationKey])).rows[0]?.record;
                if (prior)
                    return hash(prior) === hash(input.operation) ? 'committed' : 'idempotency_conflict';
                const current = decode((await client.query('SELECT record FROM journey_referral_shares WHERE share_ref=$1 FOR UPDATE', [input.record.shareRef])).rows[0]?.record);
                if ((current?.revision ?? null) !== input.expectedRevision || current && (current.ownerAccountId !== input.record.ownerAccountId || current.state === 'withdrawn'))
                    return 'conflict';
                await client.query('INSERT INTO journey_referral_shares(share_ref,account_id,record) VALUES($1,$2,$3) ON CONFLICT(share_ref) DO UPDATE SET record=EXCLUDED.record', [input.record.shareRef, input.record.ownerAccountId, input.record]);
                await client.query('INSERT INTO journey_referral_operations(account_id,operation_key,body_digest,share_ref,record) VALUES($1,$2,$3,$4,$5)', [input.operation.accountId, input.operation.operationKey, input.operation.bodyDigest, input.record.shareRef, input.operation]);
                return 'committed';
            }, 'idempotent');
        },
    };
    const events = {
        async read(id) {
            return store.withOpportunityClient(async (client) => {
                const record = (await client.query('SELECT record FROM journey_source_events WHERE event_id=$1', [id])).rows[0]?.record;
                if (!record)
                    return null;
                if (!eventRecord(record) || record.eventId !== id)
                    throw new Error('invalid source event');
                return record;
            }, 'read');
        },
        async append(event) {
            if (!eventRecord(event))
                throw new Error('invalid source event');
            return store.withOpportunityClient(async (client) => {
                await client.query("SELECT pg_advisory_xact_lock(hashtextextended('journey-source-event-capacity',227700))");
                const prior = (await client.query('SELECT record FROM journey_source_events WHERE event_id=$1', [event.eventId])).rows[0]?.record;
                if (prior)
                    return hash(prior) === hash(event) ? 'duplicate' : 'conflict';
                if (Number((await client.query('SELECT count(*) AS n FROM journey_source_events')).rows[0].n) >= 5000)
                    return 'capacity';
                await client.query('INSERT INTO journey_source_events(event_id,body_digest,record) VALUES($1,$2,$3)', [event.eventId, event.bodyDigest, event]);
                return 'stored';
            }, 'idempotent');
        },
    };
    return { repository, events };
}
//# sourceMappingURL=postgres.js.map