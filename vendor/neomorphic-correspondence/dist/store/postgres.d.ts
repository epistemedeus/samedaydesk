import type { ActiveGrant, CreateEventInput, CreateGrantInput, CreateProjectInput, GrantRecord, ListEventsInput, Project } from "../types.js";
import type { CorrespondenceStore, CreateEventResult, CreateProjectResult, ListEventsResult } from "./types.js";
export type PostgresStoreOptions = {
    schema?: string;
    poolMax?: number;
};
export declare class PostgresStore implements CorrespondenceStore {
    readonly kind: "postgres";
    readonly schema: string;
    private readonly schemaIdent;
    private readonly pool;
    constructor(databaseUrl: string, options?: PostgresStoreOptions);
    private connectScoped;
    private query;
    migrate(): Promise<void>;
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
export declare function createPostgresStore(databaseUrl: string, options?: PostgresStoreOptions): Promise<PostgresStore>;
