import type { DiscussionPage, DiscussionPorts, Result, WriteReceipt, ReportPage } from "./types.js";
export declare function createDiscussionService<Credential>(ports: DiscussionPorts<Credential>): {
    write(taskIdInput: unknown, credential: Credential, key: unknown, input: unknown): Promise<Result<WriteReceipt>>;
    /** Latest projections ordered by latest change, not raw immutable message history.
     * Consumers upsert by postId and remove tombstones. Poll from returned cursor. */
    list(taskIdInput: unknown, credential: Credential | null, input?: {
        cursor?: unknown;
        limit?: unknown;
    }): Promise<Result<DiscussionPage>>;
    reports(taskIdInput: unknown, credential: Credential, input?: {
        cursor?: unknown;
        limit?: unknown;
    }): Promise<Result<ReportPage>>;
};
export type DiscussionService<Credential = unknown> = ReturnType<typeof createDiscussionService<Credential>>;
