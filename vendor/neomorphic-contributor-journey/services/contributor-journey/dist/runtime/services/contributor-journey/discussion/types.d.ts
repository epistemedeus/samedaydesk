/** All authority ports are server owned. Browser bodies never supply these values. */
export type AuthenticatedAccount = {
    accountId: string;
    sessionId: string;
    authTime: string;
    expiresAt: string;
};
export type TaskBinding = {
    taskId: string;
    projectId: string;
    canRead: boolean;
    canPost: boolean;
    canModerate: boolean;
    publicDiscussionEnabled: boolean;
};
export interface TaskDirectory {
    forAccount(taskId: string, account: AuthenticatedAccount): Promise<TaskBinding | null>;
    forPublic(taskId: string): Promise<Pick<TaskBinding, "taskId" | "projectId" | "publicDiscussionEnabled"> | null>;
}
export type PublicProfile = {
    profileId: string;
    displayName: string;
    visibilityConsentVersion: string;
    /** Optional installed exact accepted-work/summary/consent binding. */
    sourceBinding?: string;
};
export interface ProfileDirectory {
    /** Return null for private/revoked profiles. Never return email/wallet/contact. */
    publicProfile(accountId: string, taskId?: string): Promise<PublicProfile | null>;
}
export interface ContentPolicy {
    /** Required deployment-specific secret/privacy filter; fail closed on outages. */
    check(text: string, audience: "private" | "public", context?: {
        taskId: string;
        accountId: string;
    }): Promise<"allow" | "refuse">;
}
export type Consent = {
    confirmed: true;
    version: "discussion-public-v1";
};
export type ModerationReason = "privacy" | "spam" | "abuse" | "off_topic";
export type Command = {
    kind: "post";
    body: string;
    audience?: "private" | "public";
    consent?: Consent;
} | {
    kind: "edit";
    postId: string;
    expectedVersion: number;
    body: string;
} | {
    kind: "publish_excerpt";
    postId: string;
    expectedVersion: number;
    text: string;
    consent: Consent;
} | {
    kind: "withdraw" | "remove";
    postId: string;
    expectedVersion: number;
} | {
    kind: "moderate";
    postId: string;
    expectedVersion: number;
    decision: "approve" | "hide";
    reason?: ModerationReason;
} | {
    kind: "report";
    postId: string;
    expectedVersion: number;
    reason: ModerationReason;
};
export type ErrorCode = "disabled" | "unauthenticated" | "not_found" | "forbidden" | "invalid_input" | "invalid_cursor" | "conflict" | "refused" | "unavailable" | "storage_invalid" | "thread_capacity";
export type Result<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: {
        code: ErrorCode;
    };
};
export type ModerationState = "pending" | "approved" | "hidden";
export type PostView = {
    kind: "post";
    postId: string;
    taskId: string;
    body: string;
    author: {
        profileId: string;
        displayName: string;
    } | null;
    audience: "private" | "public";
    moderation: ModerationState;
    version: number;
    sequence: number;
    createdAt: string;
    updatedAt: string;
    isAuthor: boolean;
    contentTrust: "untrusted_user_text";
};
export type Tombstone = {
    kind: "withdrawn";
    postId: string;
    sequence: number;
};
export type DiscussionPage = {
    items: (PostView | Tombstone)[];
    cursor: string;
    hasMore: boolean;
    reset: boolean;
};
export type WriteReceipt = {
    postId: string;
    eventId: string;
    operationSequence: number;
    sequence: number;
    version: number;
    replayed: boolean;
    post: PostView | Tombstone;
};
export type ReportView = {
    reportId: string;
    postId: string;
    reason: ModerationReason;
    sequence: number;
    createdAt: string;
};
export type ReportPage = {
    items: ReportView[];
    cursor: string;
    hasMore: boolean;
};
export type JournalEntry = {
    schema: "contributor-discussion-v1";
    taskId: string;
    actorAccountId: string;
    operationId: string;
    requestDigest: string;
    command: Command;
    profile: PublicProfile | null;
};
export type StoredEntry = {
    eventId: string;
    sequence: number;
    createdAt: string;
    entry: JournalEntry;
};
export interface DiscussionJournal {
    /** Every writer for a dedicated project must participate in this cross-process lock. */
    exclusive<T>(projectId: string, action: () => Promise<T>): Promise<T>;
    read(projectId: string): Promise<StoredEntry[]>;
    append(projectId: string, entry: JournalEntry): Promise<StoredEntry>;
}
export type DiscussionPorts<Credential = unknown> = {
    enabled: boolean;
    authenticate(credential: Credential): Promise<AuthenticatedAccount | null>;
    tasks: TaskDirectory;
    profiles: ProfileDirectory;
    contentPolicy: ContentPolicy;
    journal: DiscussionJournal;
    /** Stable 32-byte server key, retained across restart; never bundled into the client. */
    cursorKey: Uint8Array;
    now?: () => number;
};
