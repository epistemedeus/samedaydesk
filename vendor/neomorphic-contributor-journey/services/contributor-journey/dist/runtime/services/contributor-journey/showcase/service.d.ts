import type { ApprovedSummaryPort, ConsentReadback, ConsentedSummaryStore, OwnerPreview, ProfilePublicationPort, PublicWorkView, QualifiedSettlementPort, Result, WorkEvidencePort, WriteReadback } from "./types.js";
export type ShowcaseService = ReturnType<typeof createShowcaseService>;
export declare function createShowcaseService(deps: {
    works: WorkEvidencePort;
    summaries: ApprovedSummaryPort;
    profiles: ProfilePublicationPort;
    settlements: QualifiedSettlementPort;
    consents: ConsentedSummaryStore;
    mode?: "staging" | "production";
    publicEnabled?: boolean;
    /** Closed installed staging only. Never a production release flag. */
    stagingReadEnabled?: boolean;
    clock?: () => Date;
}): {
    preview(account: unknown, workId: unknown): Promise<Result<OwnerPreview>>;
    publish(account: unknown, workId: unknown, input: unknown, idempotencyKey: unknown): Promise<Result<WriteReadback>>;
    withdraw(account: unknown, workId: unknown, input: unknown, idempotencyKey: unknown): Promise<Result<WriteReadback>>;
    readWriteOutcome(account: unknown, workId: unknown, idempotencyKey: unknown): Promise<Result<WriteReadback>>;
    readConsent(account: unknown, workId: unknown): Promise<Result<ConsentReadback>>;
    readPublished: (workId: unknown) => Promise<Result<PublicWorkView>>;
    listPublished(limit?: unknown): Promise<Result<PublicWorkView[]>>;
};
