import { ApiError } from "./errors.js";
import { tokensEqual } from "./crypto.js";
export const DEFAULT_CORS_ORIGIN = "https://neomorphic.io";
export const PG_SCHEMA_RE = /^[a-z][a-z0-9_]{0,62}$/;
export const DEFAULT_PG_SCHEMA = "public";
export const MOUNTED_PG_SCHEMA = "pilot_correspondence";
export function quoteIdent(name) {
    if (!PG_SCHEMA_RE.test(name)) {
        throw new Error("Postgres identifier must match [a-z][a-z0-9_]{0,62}");
    }
    return `"${name}"`;
}
const RESERVED_PG_SCHEMAS = new Set(["pg_catalog", "information_schema", "pg_toast"]);
export function parsePgSchema(raw, fallback = DEFAULT_PG_SCHEMA) {
    const value = raw == null || raw.trim() === "" ? fallback : raw.trim();
    if (!PG_SCHEMA_RE.test(value) || RESERVED_PG_SCHEMAS.has(value)) {
        throw new Error("CORRESPONDENCE_PG_SCHEMA must match [a-z][a-z0-9_]{0,62} and not be a system schema");
    }
    return value;
}
export function parseMountedDatabaseUrl(raw) {
    let url;
    try {
        url = new URL(raw);
    }
    catch {
        throw new Error("CORRESPONDENCE_DATABASE_URL must be a Postgres URL");
    }
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname.length < 2 || url.hash) {
        throw new Error("CORRESPONDENCE_DATABASE_URL must name a Postgres host and database");
    }
    return raw;
}
export function parseMountedPgSchema(raw) {
    const schema = parsePgSchema(raw, MOUNTED_PG_SCHEMA);
    if (schema !== MOUNTED_PG_SCHEMA)
        throw new Error("shared host requires schema pilot_correspondence");
    return schema;
}
export function parsePoolMax(raw, fallback = 4) {
    if (raw == null || raw.trim() === "")
        return fallback;
    const value = Number(raw.trim());
    if (!Number.isInteger(value) || value < 1 || value > 4) {
        throw new Error("CORRESPONDENCE_POOL_MAX must be an integer from 1 to 4");
    }
    return value;
}
export function parseTrustProxyHops(raw) {
    if (raw == null || raw.trim() === "" || raw.trim().toLowerCase() === "false")
        return 0;
    const trimmed = raw.trim().toLowerCase();
    if (trimmed === "true") {
        throw new Error("CORRESPONDENCE_TRUST_PROXY must be an integer hop count (0 or >=1), not boolean true");
    }
    const value = Number(trimmed);
    if (!Number.isInteger(value) || value < 0 || value > 5) {
        throw new Error("CORRESPONDENCE_TRUST_PROXY must be an integer from 0 to 5");
    }
    return value;
}
export function loadConfig(env = process.env) {
    const storeEnv = (env.CORRESPONDENCE_STORE ?? "postgres").toLowerCase();
    const nodeEnv = env.NODE_ENV ?? "production";
    if (storeEnv === "memory" && nodeEnv !== "test") {
        throw new Error("CORRESPONDENCE_STORE=memory is allowed only when NODE_ENV=test");
    }
    const store = storeEnv === "memory" ? "memory" : "postgres";
    const adminToken = env.CORRESPONDENCE_ADMIN_TOKEN ?? "";
    if (!adminToken || adminToken.length < 24) {
        throw new Error("CORRESPONDENCE_ADMIN_TOKEN must be set to a high-entropy secret (>= 24 chars)");
    }
    const databaseUrl = env.CORRESPONDENCE_DATABASE_URL != null
        ? parseMountedDatabaseUrl(env.CORRESPONDENCE_DATABASE_URL)
        : env.DATABASE_URL ?? null;
    if (store === "postgres" && !databaseUrl) {
        throw new Error("DATABASE_URL is required for the postgres store");
    }
    return {
        port: Number(env.PORT ?? 8787),
        adminToken,
        databaseUrl,
        store,
        bodyLimitBytes: 32 * 1024,
        rateLimitWindowMs: Number(env.CORRESPONDENCE_RATE_LIMIT_WINDOW_MS ?? 60_000),
        rateLimitMax: Number(env.CORRESPONDENCE_RATE_LIMIT_MAX ?? 120),
        corsOrigins: parseCorsOrigins(env.CORRESPONDENCE_CORS_ORIGINS),
        trustProxyHops: parseTrustProxyHops(env.CORRESPONDENCE_TRUST_PROXY),
        pgSchema: env.CORRESPONDENCE_DATABASE_URL != null
            ? parseMountedPgSchema(env.CORRESPONDENCE_PG_SCHEMA)
            : parsePgSchema(env.CORRESPONDENCE_PG_SCHEMA),
        poolMax: parsePoolMax(env.CORRESPONDENCE_POOL_MAX),
    };
}
export function canonicalizeCorsOrigin(raw) {
    const value = String(raw ?? "").trim();
    if (!value || value === "null") {
        throw new Error("CORS origin must be a canonical http(s) origin");
    }
    let url;
    try {
        url = new URL(value);
    }
    catch {
        throw new Error("CORS origin must be a canonical http(s) origin");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new Error("CORS origin protocol must be http or https");
    }
    if (url.username || url.password) {
        throw new Error("CORS origin must not contain userinfo");
    }
    if (url.search || url.hash) {
        throw new Error("CORS origin must not contain a query or fragment");
    }
    if (url.pathname && url.pathname !== "/") {
        throw new Error("CORS origin must not contain a path");
    }
    return url.origin;
}
export function parseCorsOrigins(raw) {
    if (raw === "")
        return [];
    if (raw == null)
        return [DEFAULT_CORS_ORIGIN];
    const seen = new Set();
    for (const item of raw.split(",")) {
        const trimmed = item.trim();
        if (!trimmed)
            continue;
        seen.add(canonicalizeCorsOrigin(trimmed));
    }
    return [...seen];
}
export function allowCorsOrigin(origin, allowed) {
    if (!origin)
        return null;
    try {
        const canonical = canonicalizeCorsOrigin(origin);
        if (allowed.includes(canonical))
            return canonical;
    }
    catch {
        return null;
    }
    return null;
}
export function assertAdmin(token, adminToken) {
    if (!token || !tokensEqual(token, adminToken)) {
        throw new ApiError(401, "unauthorized", "invalid grant");
    }
}
//# sourceMappingURL=config.js.map