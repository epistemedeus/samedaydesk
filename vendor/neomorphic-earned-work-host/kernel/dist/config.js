import path from "node:path";
import { ApiError } from "./errors.js";
import { hashToken, tokensEqual } from "./crypto.js";
export const DEFAULT_CORS_ORIGIN = "https://neomorphic.io";
export const PG_SCHEMA_RE = /^[a-z][a-z0-9_]{0,62}$/;
export const DEFAULT_PG_SCHEMA = "public";
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
        throw new Error("EARNED_WORK_PG_SCHEMA must match [a-z][a-z0-9_]{0,62} and not be a system schema");
    }
    return value;
}
export function parseDatabaseUrl(raw) {
    let url;
    try {
        url = new URL(raw);
    }
    catch {
        throw new Error("EARNED_WORK_DATABASE_URL must be a Postgres URL");
    }
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname.length < 2 || url.hash) {
        throw new Error("EARNED_WORK_DATABASE_URL must name a Postgres host and database");
    }
    return raw;
}
export function parsePoolMax(raw, fallback = 4) {
    if (raw == null || raw.trim() === "")
        return fallback;
    const value = Number(raw.trim());
    if (!Number.isInteger(value) || value < 1 || value > 4) {
        throw new Error("EARNED_WORK_POOL_MAX must be an integer from 1 to 4");
    }
    return value;
}
const ALLOWED_LISTEN_HOSTS = new Set(["127.0.0.1", "0.0.0.0", "::1"]);
/** Default loopback. Hostinger (or any public bind) must set 0.0.0.0 explicitly. */
export function parseListenHost(raw) {
    const value = (raw ?? "").trim();
    if (value === "")
        return "127.0.0.1";
    if (ALLOWED_LISTEN_HOSTS.has(value))
        return value;
    throw new Error("EARNED_WORK_LISTEN_HOST must be 127.0.0.1, 0.0.0.0, or ::1");
}
export function listenHostFromEnv(env) {
    const dedicated = env.EARNED_WORK_LISTEN_HOST;
    if (dedicated != null && dedicated.trim() !== "")
        return parseListenHost(dedicated);
    const host = (env.HOST ?? "").trim();
    if (ALLOWED_LISTEN_HOSTS.has(host))
        return host;
    return "127.0.0.1";
}
export function parseShutdownTimeoutMs(raw, fallback = 8_000) {
    if (raw == null || raw.trim() === "")
        return fallback;
    const value = Number(raw.trim());
    if (!Number.isInteger(value) || value < 100 || value > 60_000) {
        throw new Error("EARNED_WORK_SHUTDOWN_TIMEOUT_MS must be an integer from 100 to 60000");
    }
    return value;
}
export function parseTrustProxyHops(raw) {
    if (raw == null || raw.trim() === "" || raw.trim().toLowerCase() === "false")
        return 0;
    const trimmed = raw.trim().toLowerCase();
    if (trimmed === "true") {
        throw new Error("EARNED_WORK_TRUST_PROXY must be an integer hop count (0 or >=1), not boolean true");
    }
    const value = Number(trimmed);
    if (!Number.isInteger(value) || value < 0 || value > 5) {
        throw new Error("EARNED_WORK_TRUST_PROXY must be an integer from 0 to 5");
    }
    return value;
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
export function parseVerifierMode(raw) {
    const value = (raw ?? "default").trim().toLowerCase();
    if (value === "" || value === "default")
        return "default";
    if (value === "reproduction")
        return "reproduction";
    throw new Error("EARNED_WORK_VERIFIER must be default or reproduction");
}
export function parseReproductionTimeoutMs(raw, fallback = 15_000) {
    if (raw == null || raw.trim() === "")
        return fallback;
    const value = Number(raw.trim());
    if (!Number.isInteger(value) || value < 1_000 || value > 60_000) {
        throw new Error("EARNED_WORK_REPRODUCTION_TIMEOUT_MS must be an integer from 1000 to 60000");
    }
    return value;
}
export function parseReproductionConfig(env, mode) {
    if (mode !== "reproduction")
        return null;
    const root = (env.EARNED_WORK_REPRODUCTION_ROOT ?? "").trim();
    if (!root) {
        throw new Error("EARNED_WORK_REPRODUCTION_ROOT is required when EARNED_WORK_VERIFIER=reproduction");
    }
    const executable = (env.EARNED_WORK_REPRODUCTION_EXECUTABLE ?? "").trim() || path.join(root, "bin/e18-repro.mjs");
    const specPath = (env.EARNED_WORK_REPRODUCTION_SPEC ?? "").trim() ||
        path.join(root, "fixtures/task.sds52-stale-outdir.json");
    return {
        root,
        specPath,
        executable,
        timeoutMs: parseReproductionTimeoutMs(env.EARNED_WORK_REPRODUCTION_TIMEOUT_MS),
    };
}
export function loadConfig(env = process.env) {
    const ownerToken = env.EARNED_WORK_OWNER_TOKEN ?? "";
    if (!ownerToken || ownerToken.length < 8) {
        throw new Error("EARNED_WORK_OWNER_TOKEN must be set (>= 8 chars) for the local owner bearer");
    }
    const rawUrl = env.EARNED_WORK_DATABASE_URL ?? env.DATABASE_URL;
    if (!rawUrl) {
        throw new Error("EARNED_WORK_DATABASE_URL is required for the postgres store");
    }
    const verifierMode = parseVerifierMode(env.EARNED_WORK_VERIFIER);
    return {
        port: Number(env.PORT ?? 8791),
        listenHost: listenHostFromEnv(env),
        shutdownTimeoutMs: parseShutdownTimeoutMs(env.EARNED_WORK_SHUTDOWN_TIMEOUT_MS),
        ownerToken,
        ownerTokenHash: hashToken(ownerToken),
        databaseUrl: parseDatabaseUrl(rawUrl),
        bodyLimitBytes: 32 * 1024,
        rateLimitWindowMs: Number(env.EARNED_WORK_RATE_LIMIT_WINDOW_MS ?? 60_000),
        rateLimitMax: Number(env.EARNED_WORK_RATE_LIMIT_MAX ?? 120),
        corsOrigins: parseCorsOrigins(env.EARNED_WORK_CORS_ORIGINS),
        trustProxyHops: parseTrustProxyHops(env.EARNED_WORK_TRUST_PROXY),
        pgSchema: parsePgSchema(env.EARNED_WORK_PG_SCHEMA),
        poolMax: parsePoolMax(env.EARNED_WORK_POOL_MAX),
        verifierMode,
        reproduction: parseReproductionConfig(env, verifierMode),
    };
}
export function assertOwner(token, config) {
    if (!token) {
        throw new ApiError(401, "unauthorized", "invalid grant");
    }
    const presented = hashToken(token);
    if (!tokensEqual(presented, config.ownerTokenHash)) {
        throw new ApiError(401, "unauthorized", "invalid grant");
    }
}
//# sourceMappingURL=config.js.map