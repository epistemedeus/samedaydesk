import type { OpportunityService } from '../../earned-work/src/opportunity/service.js';
import type { ContributorPrincipal, Provenance } from '../../earned-work/src/types.js';
import type { OfferTerms, RoundTermsInput } from '../../earned-work/src/opportunity/terms.js';
export type AuthenticatedAccount = {
    accountId: string;
    sessionId: string;
    authTime: string;
    expiresAt: string;
};
export type AuthenticatedAccountResolver<Context> = (context: Context) => Promise<AuthenticatedAccount | null>;
export type PrivatePrincipalResolver = (accountId: string, roundKey: string, provenance: Provenance) => Promise<ContributorPrincipal | null>;
export type OpportunityClaimsPort = Pick<OpportunityService, 'readRound' | 'claim' | 'readClaim' | 'readOwnClaims' | 'readClaimOperation' | 'joinWaitlist' | 'readWaitlist'>;
export type FutureRound = {
    roundKey: string;
    provenance: Provenance;
};
export type ClaimsErrorCode = 'disabled' | 'unauthorized' | 'invalid_input' | 'not_found' | 'forbidden' | 'terms_changed' | 'idempotency_conflict' | 'invalid_storage' | 'unavailable' | 'outcome_unknown';
export type Result<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: {
        code: ClaimsErrorCode;
        status: number;
    };
};
export type TaskView = {
    taskId: string;
    roundKey: string;
    offerKey: string;
    title: string;
    summary: string;
    termsId: string;
    termsVersion: string;
    rewardAtomic: string;
    asset: string;
    network: string;
    maxEffortSeconds: number;
    acceptance: string;
    evidenceKind: OfferTerms['evidenceKind'];
    availableSlots: number;
    availability: 'available' | 'full' | 'closed' | 'owner_assigned';
    submissionDeadline: string;
    rewardReserved: false;
};
export type ExactTerms = {
    task: TaskView;
    termsId: string;
    termsVersion: string;
    document: ReturnType<typeof import('../../earned-work/src/opportunity/terms.js').canonicalRoundTerms>;
};
export type ClaimStatus = 'reserved' | 'submitted' | 'accepted' | 'owed' | 'released' | 'expired';
/** Private account DTO; never a public profile or raw token/destination. */
export type ClaimView = {
    accountId: string;
    taskId: string;
    roundKey: string;
    reservationId: string;
    termsId: string;
    termsVersion: string;
    status: ClaimStatus;
    expiresAt: string;
    canStart: boolean;
    nextAction: 'deliver' | 'await_review' | 'await_fulfillment' | 'discover_tasks';
};
export type WaitlistView = {
    roundKey: string;
    waitlistId: string | null;
    joinedAt: string | null;
    reason: string | null;
    fundedReservation: false;
    nextAction: 'check_tasks';
    availableTasks: TaskView[];
    alternatives: {
        alternativeKey: string;
        title: string;
        summary: string;
        funded: false;
    }[];
};
export type ClaimOutcome = {
    kind: 'claimed';
    replayed: boolean;
    claim: ClaimView;
} | {
    kind: 'continuation';
    replayed: boolean;
    reason: string;
    waitlist: WaitlistView;
};
export type OperationReadback = {
    state: 'not_found';
} | {
    state: 'recorded';
    action: 'claim';
    outcome: ClaimOutcome;
} | {
    state: 'recorded';
    action: 'waitlist';
    waitlist: WaitlistView;
};
export type ClaimsOptions<Context> = {
    /** Public use stays off unless the integration owner explicitly enables it. */
    enabled?: boolean;
    futureRounds: readonly FutureRound[];
    resolveAccount: AuthenticatedAccountResolver<Context>;
    resolvePrincipal: PrivatePrincipalResolver;
    opportunity: OpportunityClaimsPort;
    now?: () => Date;
};
export type ClaimInput = {
    taskId: string;
    termsId: string;
    termsVersion: string;
    acceptTerms: true;
};
export type WaitlistInput = {
    roundKey: string;
    reason: 'full_round' | 'later_round' | 'no_matching_task';
};
export type { RoundTermsInput };
