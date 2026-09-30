import type { ActiveGrant, CreateEventInput, CreateGrantInput, CreateProjectInput, GrantRecord, ListEventsInput, Project } from "../types.js";
import type { CorrespondenceStore, CreateEventResult, CreateProjectResult, ListEventsResult } from "./types.js";
export declare class MemoryStore implements CorrespondenceStore {
    readonly kind: "memory";
    private readonly state;
    close(): Promise<void>;
    findActiveGrantByTokenHash(tokenHash: string): Promise<ActiveGrant | null>;
    getProject(projectId: string): Promise<Project | null>;
    createProject(input: CreateProjectInput): Promise<CreateProjectResult>;
    createGrant(input: CreateGrantInput): Promise<{
        grant: GrantRecord;
        tokenIssuedAt: string;
    }>;
    revokeGrant(projectId: string, grantId: string): Promise<"revoked" | "already_revoked">;
    createEvent(input: CreateEventInput): Promise<CreateEventResult>;
    listEvents(input: ListEventsInput): Promise<ListEventsResult>;
}
