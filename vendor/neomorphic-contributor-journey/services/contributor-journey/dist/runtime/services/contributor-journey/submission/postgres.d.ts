import type { Pool } from 'pg';
import type { Draft, DraftRecord, FrozenDelivery, SubmissionPersistence } from './types.js';
/** Submission-specific drafts/intents only. Kernel records remain in earned-work. */
export declare class PostgresSubmissionPersistence implements SubmissionPersistence {
    private readonly pool;
    private readonly schemaIdent;
    constructor(pool: Pool, schema: string);
    /** Explicit staging migration, called by integration owner before enabling routes. */
    migrate(): Promise<void>;
    private tx;
    private lock;
    private row;
    load(accountId: string, reservationId: string): Promise<DraftRecord | null>;
    save(draft: Draft, expectedRevision: number, key: string, hash: string): Promise<{
        record: DraftRecord;
        savedRevision: number;
        replayed: boolean;
    }>;
    freeze(accountId: string, reservationId: string, expectedRevision: number, build: (draft: Draft) => FrozenDelivery): Promise<DraftRecord>;
}
