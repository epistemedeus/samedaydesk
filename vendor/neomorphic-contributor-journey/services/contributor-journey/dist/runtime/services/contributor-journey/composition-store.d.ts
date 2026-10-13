import type { PostgresStore } from '../earned-work/src/store/postgres.js';
import type { CorrespondenceStore } from '../correspondence/src/store/types.js';
import type { SourceBinding } from './review/types.js';
import type { ProfilePublication } from './showcase/types.js';
import type { JourneyAdmission } from './profile.js';
export declare class CompositionStore {
    readonly kernel: PostgresStore;
    private readonly correspondence;
    readonly integrityKey: string;
    private readonly admission?;
    constructor(kernel: PostgresStore, correspondence: CorrespondenceStore, integrityKey: string, admission?: JourneyAdmission | undefined);
    migrate(): Promise<void>;
    accountForPrincipal(principalId: string): Promise<string | null>;
    round(roundKey: string): Promise<any>;
    task(taskId: string): Promise<any>;
    /** Controller-only references to an existing round, offer and requester. Creates no inventory or account. */
    enrollTask(taskId: string, requesterAccountId: string): Promise<any>;
    project(source: SourceBinding, kind: 'clarification' | 'decision'): Promise<string>;
    workId(taskId: string, reservationId: string, accountId: string): Promise<string>;
    work(workId: string): Promise<any>;
    profile(profileId: string): Promise<ProfilePublication | null>;
    profileForAccount(accountId: string): Promise<{
        profileId: string;
        publication: ProfilePublication | null;
    } | null>;
    publishProfile(accountId: string, raw: unknown, key: string): Promise<ProfilePublication>;
}
