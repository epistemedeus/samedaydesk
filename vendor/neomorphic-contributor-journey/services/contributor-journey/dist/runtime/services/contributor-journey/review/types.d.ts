import type { TaskAggregate, VerdictOutcome } from "../../earned-work/src/types.js";
import type { RoundTermsInput } from "../../earned-work/src/opportunity/terms.js";
export type Account = {
    accountId: string;
    sessionId: string;
    authTime: string;
    expiresAt: string;
};
export type Target = {
    taskId: string;
    reservationId: string;
};
/** Resolved from private account/credential/claim records, never from an alias. */
export type AccessBinding = {
    requesterAccountId: string;
    contributorAccountId: string | null;
    contributorPrincipalId: string;
    receiving?: "root_mediated_external_report_v1";
};
export type SourceBinding = Target & {
    termsVersion: string;
    submissionId: string;
    artifactId: string;
    digestSha256: string;
    mediaType: string;
    bytes: number;
};
export type SubmittedArtifact = SourceBinding & {
    state: "submitted";
};
export type ReviewSource = {
    /** Common read projection only. No reservation or obligation is copied to another engine. */
    aggregate: TaskAggregate;
    authority?: {
        family: 'opportunity';
        roundKey: string;
        offerKey: string;
        termsDocument: RoundTermsInput;
    };
    artifactId: string;
    rejection: {
        reason: string;
        decidedAt: string;
    } | null;
};
export type Handoff = Target & {
    workId: string;
    obligationId: string;
    termsVersion: string;
    verdictId: string;
};
/** Only a server-side adapter to the existing qualified settlement join supplies this. */
export type Fulfillment = Handoff & {
    state: "not_observed" | "pending" | "verified_paid" | "failed" | "unknown";
    verifierVersion: string;
    transactionHash?: string;
    logIndex?: number | null;
    proofKind?: "native_value_transfer";
    rewardAsset?: unknown;
    receiptId?: string;
};
export type ClarificationEntry = {
    schema: "neomorphic.review-clarification.v1";
    source: SourceBinding;
    ordinal: number;
    accountId: string;
    kind: "request" | "reply" | "refuse";
    questionId: string;
    text: string;
    createdAt: string;
    deadline: string;
    clientKey: string;
    commandHash: string;
};
/** append must atomically fence an ordinal and replay the same command hash. */
export interface ClarificationPort {
    read(source: SourceBinding): Promise<ClarificationEntry[]>;
    append(entry: ClarificationEntry): Promise<void>;
}
export interface KernelReviewPort {
    read(target: Target): Promise<ReviewSource | null>;
    verdict(source: SourceBinding, outcome: VerdictOutcome, key: string, reviewEvidenceRef?: string): Promise<{
        verdictId: string;
    }>;
    accept(source: SourceBinding, verdictId: string, key: string): Promise<void>;
    reject(source: SourceBinding, reason: string, key: string): Promise<void>;
}
export type ReviewPorts<Context> = {
    authenticate(context: Context): Promise<Account | null>;
    binding(account: Account, target: Target): Promise<AccessBinding | null>;
    kernel: KernelReviewPort;
    clarification: ClarificationPort;
    fulfillment(handoff: Handoff): Promise<Fulfillment>;
    clock?: () => Date;
    policy?: {
        maxRounds: number;
        responseWindowSeconds: number;
    };
};
export type ReviewView = {
    source: SourceBinding;
    viewer: "requester" | "contributor";
    state: "awaiting_review" | "clarification_requested" | "clarification_answered" | "clarification_refused" | "clarification_expired" | "rejected" | "accepted";
    verdict: {
        id: string;
        outcome: VerdictOutcome;
    } | null;
    decision: {
        outcome: "accept" | "reject";
        reason: string | null;
        decidedAt: string;
    } | null;
    clarification: {
        roundsUsed: number;
        maxRounds: number;
        question: {
            id: string;
            text: string;
            deadline: string;
        } | null;
        response: {
            kind: "reply" | "refuse";
            text: string;
        } | null;
        canRequest: boolean;
        canRespond: boolean;
    };
    fulfillment: {
        state: Fulfillment["state"] | "none";
        paid: boolean;
        transactionHash?: string;
        logIndex?: number | null;
        proofKind?: "native_value_transfer";
        rewardAsset?: unknown;
        receiptId?: string;
    };
    handoff: Handoff | null;
    nextAction: "requester_review" | "answer_clarification" | "await_requester" | "view_fulfillment" | "choose_task";
};
export type Failure = {
    ok: false;
    status: number;
    code: string;
    message: string;
};
export type Result<T> = {
    ok: true;
    value: T;
} | Failure;
export type MutationView = {
    outcome: "recorded" | "accepted" | "already_accepted" | "already_rejected" | "rejected" | "recovered";
    view: ReviewView;
};
