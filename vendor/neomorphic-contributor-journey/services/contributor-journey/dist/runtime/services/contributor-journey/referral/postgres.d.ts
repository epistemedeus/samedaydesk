import type { PostgresStore } from '../../earned-work/src/store/postgres.js';
import type { ReferralRepository, SourceEventSink } from './types.js';
/** Tailored durable adapter for the received referral ports, in the composition schema. */
export declare function createPostgresReferralPorts(store: PostgresStore): {
    repository: ReferralRepository;
    events: SourceEventSink;
};
