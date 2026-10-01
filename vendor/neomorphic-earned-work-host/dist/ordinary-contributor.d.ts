export declare const RECEIVED_EVIDENCE_REF = "fixture:received-evidence-not-fetched";
export declare const RECEIVED_EVIDENCE_MEDIA_TYPE = "application/json";
export declare const FORBIDDEN_CONTRIBUTOR_ENV: readonly ["DATABASE_URL", "EARNED_WORK_DATABASE_URL", "EARNED_WORK_OWNER_TOKEN", "EARNED_WORK_PAYOUT_KEY", "EARNED_WORK_PG_SCHEMA"];
export type OrdinaryMode = "qualify" | "submit" | "read";
export type OrdinaryReceipt = {
    ok: boolean;
    httpStatus: number;
    code: string | null;
    submitted: boolean;
    reservationId: string | null;
    submissionId: string | null;
    termsVersion: string | null;
    paid: false;
    settled: false;
    transfer: null;
    readback: "owed" | "none" | null;
};
export declare function assertContributorEnv(env: NodeJS.ProcessEnv): void;
export declare function evidenceArtifact(evidence: Buffer): {
    ref: string;
    digestSha256: string;
    mediaType: string;
    bytes: number;
};
export declare function evidenceSubmissionBody(reservationId: string, evidence: Buffer): string;
type FetchImpl = typeof fetch;
export declare function runOrdinaryContributor(input: {
    baseUrl: string;
    token: string;
    taskId: string;
    mode: OrdinaryMode;
    evidence?: Buffer;
    claimIdempotencyKey?: string;
    submitIdempotencyKey?: string;
    fetchImpl?: FetchImpl;
}): Promise<OrdinaryReceipt>;
export {};
