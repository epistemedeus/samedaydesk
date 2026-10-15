export declare const EVENT_KINDS: readonly ["request", "reply", "artifact", "correction", "needs_human", "resolved", "reopened"];
export type EventKind = (typeof EVENT_KINDS)[number];
export type ProjectStatus = "open" | "needs_human" | "resolved";
export type GrantRole = "owner" | "reader" | "writer";
export type NextActionKind = "reply" | "human_review";
export type NextAction = {
    kind: NextActionKind;
    url?: string;
} | null;
export type Project = {
    id: string;
    title: string;
    summary: string;
    status: ProjectStatus;
    version: number;
    nextAction: NextAction;
    createdAt: string;
    updatedAt: string;
};
export type ArtifactRef = {
    url: string;
    label?: string;
};
export type EventRecord = {
    id: string;
    projectId: string;
    sequence: number;
    kind: EventKind;
    text?: string;
    artifact?: ArtifactRef;
    createdAt: string;
};
export type GrantRecord = {
    id: string;
    projectId: string;
    role: GrantRole;
    tokenHash: string;
    expiresAt: string | null;
    revokedAt: string | null;
    createdAt: string;
};
export type ActiveGrant = {
    id: string;
    projectId: string;
    role: GrantRole;
    expiresAt: string | null;
};
export type IdempotencyRecord = {
    scope: string;
    projectId: string;
    key: string;
    requestHash: string;
    statusCode: number;
    responseJson: unknown;
    createdAt: string;
};
export type CreateProjectInput = {
    title: string;
    summary: string;
    ownerTokenHash: string;
    ownerTokenPlainForReplay: string;
    idempotencyKey: string;
    requestHash: string;
};
export type CreateGrantInput = {
    projectId: string;
    role: Exclude<GrantRole, "owner">;
    tokenHash: string;
    expiresAt: string | null;
};
export type CreateEventInput = {
    projectId: string;
    kind: EventKind;
    text?: string;
    artifact?: ArtifactRef;
    expectedVersion?: number;
    idempotencyKey: string;
    requestHash: string;
};
export type ListEventsInput = {
    projectId: string;
    afterSequence: number;
    limit: number;
};
