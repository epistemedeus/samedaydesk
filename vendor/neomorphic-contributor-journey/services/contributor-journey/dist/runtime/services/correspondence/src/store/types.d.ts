import type { ActiveGrant, CreateEventInput, CreateGrantInput, CreateProjectInput, EventRecord, GrantRecord, ListEventsInput, Project } from "../types.js";
export type CreateProjectResult = {
    project: Project;
    ownerToken: string;
    replayed: boolean;
    statusCode: number;
};
export type CreateEventResult = {
    event: EventRecord;
    project: Project;
    replayed: boolean;
    statusCode: number;
};
export type ListEventsResult = {
    events: EventRecord[];
    nextCursor: string | null;
};
/** Stored project-create intent. Absent only when no idempotency row exists. */
export type ProjectCreateRecord = {
    requestHash: string;
    createdAt: string;
    projectId: string;
    title: string;
    summary: string;
    ownerTokenHash: string;
};
export interface CorrespondenceStore {
    readonly kind: "memory" | "postgres";
    checkReady?(): Promise<void>;
    close(): Promise<void>;
    findActiveGrantByTokenHash(tokenHash: string): Promise<ActiveGrant | null>;
    getProject(projectId: string): Promise<Project | null>;
    readProjectCreate(idempotencyKey: string): Promise<ProjectCreateRecord | null>;
    createProject(input: CreateProjectInput): Promise<CreateProjectResult>;
    createGrant(input: CreateGrantInput): Promise<{
        grant: GrantRecord;
        tokenIssuedAt: string;
    }>;
    revokeGrant(projectId: string, grantId: string): Promise<"revoked" | "already_revoked">;
    createEvent(input: CreateEventInput): Promise<CreateEventResult>;
    listEvents(input: ListEventsInput): Promise<ListEventsResult>;
}
