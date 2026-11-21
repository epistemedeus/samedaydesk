import type { ConsentedSummaryStore } from "./types.js";
/** Structural subset of the existing pg pool; caller owns its connection configuration and lifetime. */
export interface ShowcaseSqlConnection {
    query(text: string, values?: unknown[]): Promise<{
        rows: Record<string, unknown>[];
    }>;
    release(): void;
}
export interface ShowcaseSqlPool {
    query(text: string, values?: unknown[]): Promise<{
        rows: Record<string, unknown>[];
    }>;
    connect(): Promise<ShowcaseSqlConnection>;
}
export declare function migrateShowcase(pool: ShowcaseSqlPool): Promise<void>;
/** A module-specific consent table and operation readback, not a replacement work or payment store. */
export declare function createPostgresConsentedSummaryStore(pool: ShowcaseSqlPool): ConsentedSummaryStore;
