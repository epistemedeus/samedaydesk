import type { PostgresStore } from '../earned-work/src/store/postgres.js';
import type { WorkEvidence } from './showcase/types.js';
import type { AuthenticatedAccount } from './types.js';
export type RelationshipObservation = {
    eventId: string;
    workId: string;
    role: 'requester' | 'contributor';
    accountId: string;
    revision: number;
    supersedes: string | null;
    sourceDigest: string;
    useful: 'useful' | 'not_useful' | 'unknown' | null;
    effortSeconds: number | null;
    reportedAt: string;
    evidence: 'self_report';
};
/** Private statements, not acceptance/payment/publication authority. Only exact
 * authenticated counterparties may report, and every revision retains its source. */
export declare function createRelationshipService(options: {
    kernel: PostgresStore;
    works: {
        read(id: string): Promise<WorkEvidence | null>;
    };
    requester(taskId: string): Promise<string | null>;
}): {
    source: (work: WorkEvidence) => string;
    report(account: AuthenticatedAccount, workId: string, role: "requester" | "contributor", raw: unknown, key: string): Promise<{
        ok: boolean;
        value: any;
        replayed: boolean;
        code?: undefined;
    } | {
        ok: boolean;
        code: string;
    }>;
    read(account: AuthenticatedAccount, workId: string): Promise<{
        ok: boolean;
        code: string;
        value?: undefined;
    } | {
        ok: boolean;
        value: RelationshipObservation[];
        code?: undefined;
    }>;
    current(work: WorkEvidence): Promise<RelationshipObservation[]>;
};
