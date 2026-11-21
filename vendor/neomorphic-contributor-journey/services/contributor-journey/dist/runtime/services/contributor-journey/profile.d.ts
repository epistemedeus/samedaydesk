import type { PostgresStore } from '../earned-work/src/store/postgres.js';
import type { JourneyConfig } from './types.js';
/** One durable deployment binding in the existing account schema, never an identity/task/money ledger. */
export declare class JourneyAdmission {
    readonly config: JourneyConfig;
    readonly kernel: PostgresStore;
    constructor(config: JourneyConfig, kernel: PostgresStore);
    migrate(): Promise<void>;
    private fingerprint;
    /** Explicit controller enrollment; never a serving-time production fallback. */
    enroll(): Promise<void>;
    assertProfile(): Promise<void>;
    round(roundKey: string): Promise<any>;
    taskSource(taskId: string): Promise<{
        round: any;
        offer: any;
        configured: {
            offerKey: string;
            requesterAccountId: string;
            publicDiscussion: boolean;
        } | undefined;
    }>;
    task(taskId: string): Promise<any>;
    checkReady(): Promise<void>;
}
