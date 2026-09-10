export declare const DEFAULT_CORS_ORIGIN = "https://neomorphic.io";
export type ServiceConfig = {
    port: number;
    adminToken: string;
    databaseUrl: string | null;
    store: "postgres" | "memory";
    bodyLimitBytes: number;
    rateLimitWindowMs: number;
    rateLimitMax: number;
    corsOrigins: string[];
    /**
     * Reverse-proxy hop count for Express `trust proxy`.
     * Default 0 (do not trust X-Forwarded-*). Set to 1 only behind a known TLS proxy.
     */
    trustProxyHops: number;
    /** Namespaced Postgres schema. Standalone default is `public`. */
    pgSchema: string;
    /** Bounded pg.Pool size. Default 4, allowed 1–4. */
    poolMax: number;
};
export declare const PG_SCHEMA_RE: RegExp;
export declare const DEFAULT_PG_SCHEMA = "public";
export declare const MOUNTED_PG_SCHEMA = "pilot_correspondence";
export declare function quoteIdent(name: string): string;
export declare function parsePgSchema(raw: string | undefined, fallback?: string): string;
export declare function parseMountedDatabaseUrl(raw: string): string;
export declare function parseMountedPgSchema(raw: string | undefined): string;
export declare function parsePoolMax(raw: string | undefined, fallback?: number): number;
export declare function parseTrustProxyHops(raw: string | undefined): number;
export declare function loadConfig(env?: NodeJS.ProcessEnv): ServiceConfig;
export declare function canonicalizeCorsOrigin(raw: string): string;
export declare function parseCorsOrigins(raw: string | undefined): string[];
export declare function allowCorsOrigin(origin: string | undefined, allowed: string[]): string | null;
export declare function assertAdmin(token: string | undefined, adminToken: string): void;
