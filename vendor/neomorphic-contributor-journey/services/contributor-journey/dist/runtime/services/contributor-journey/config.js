export const JOURNEY_MOUNT_PATH = "/api/neomorphic-contributor-journey";
export const PRODUCT_SOURCE_PIN = "ff6c03653f6c268d89502986a5062d36044f6cd0";
export const SDS_SOURCE_PIN = "d8cea059213e06d2f263be67f82e498f8052a50f";
function canonicalizeCorsOrigin(raw) {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
        url.search || url.hash || url.pathname !== "/" || raw === "null")
        throw new Error("invalid journey CORS origin");
    return url.origin;
}
function integer(value, fallback, min, max, field) {
    if (value == null || value === "")
        return fallback;
    if (!/^\d+$/.test(value))
        throw new Error(`${field} must be an integer`);
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < min || number > max)
        throw new Error(`${field} out of range`);
    return number;
}
/** Dedicated, synthetic database only. No inherited DATABASE_URL or old round schema. */
export function loadJourneyConfig(env = process.env) {
    const mode = env.CONTRIBUTOR_JOURNEY_MODE ?? "disabled";
    if (mode !== "disabled" && mode !== "staging")
        throw new Error("CONTRIBUTOR_JOURNEY_MODE must be disabled or staging");
    const listenHost = env.CONTRIBUTOR_JOURNEY_LISTEN_HOST ?? "127.0.0.1";
    if (listenHost !== "127.0.0.1" && listenHost !== "::1")
        throw new Error("journey staging listener must be loopback");
    const corsOrigins = (env.CONTRIBUTOR_JOURNEY_CORS_ORIGINS ?? "http://127.0.0.1:4321,http://localhost:4321")
        .split(",").filter(Boolean).map(canonicalizeCorsOrigin);
    const base = {
        mode,
        listenHost,
        port: integer(env.CONTRIBUTOR_JOURNEY_PORT, 8793, 0, 65535, "port"),
        mountPath: JOURNEY_MOUNT_PATH,
        corsOrigins: [...new Set(corsOrigins)],
        bodyLimitBytes: 32 * 1024,
        rateLimitMax: integer(env.CONTRIBUTOR_JOURNEY_RATE_LIMIT_MAX, 120, 1, 10000, "rate limit"),
        rateLimitWindowMs: integer(env.CONTRIBUTOR_JOURNEY_RATE_LIMIT_WINDOW_MS, 60000, 100, 3600000, "rate window"),
        trustProxyHops: integer(env.CONTRIBUTOR_JOURNEY_TRUST_PROXY, 0, 0, 5, "proxy hops"),
        storage: null,
    };
    if (mode === "disabled")
        return base;
    const raw = env.CONTRIBUTOR_JOURNEY_DATABASE_URL ?? "";
    let url;
    try {
        url = new URL(raw);
    }
    catch {
        throw new Error("dedicated staging database URL is required");
    }
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.hash ||
        !/^\/contributor_journey_staging(?:_[a-z0-9_]+)?$/.test(url.pathname) ||
        [...url.searchParams.keys()].some(key => !["sslmode", "sslrootcert", "application_name"].includes(key))) {
        throw new Error("database must name contributor_journey_staging; connection overrides are refused");
    }
    if (raw === env.DATABASE_URL || raw === env.EARNED_WORK_DATABASE_URL || raw === env.NEOMORPHIC_OPPORTUNITY_DATABASE_URL) {
        throw new Error("journey must use a dedicated staging database");
    }
    const ownerToken = env.CONTRIBUTOR_JOURNEY_OWNER_TOKEN ?? "";
    const correspondenceAdminToken = env.CONTRIBUTOR_JOURNEY_CORRESPONDENCE_ADMIN_TOKEN ?? "";
    if (ownerToken.length < 24 || correspondenceAdminToken.length < 24 || ownerToken === correspondenceAdminToken ||
        [env.EARNED_WORK_OWNER_TOKEN, env.NEOMORPHIC_OPPORTUNITY_OWNER_TOKEN, env.CORRESPONDENCE_ADMIN_TOKEN]
            .some(token => token && (token === ownerToken || token === correspondenceAdminToken))) {
        throw new Error("distinct dedicated staging service tokens (>=24 characters) are required");
    }
    base.storage = {
        databaseUrl: raw,
        earnedWorkSchema: "cj227_earned_work",
        correspondenceSchema: "cj227_correspondence",
        poolMax: integer(env.CONTRIBUTOR_JOURNEY_POOL_MAX, 2, 1, 2, "pool max"),
        ownerToken,
        correspondenceAdminToken,
    };
    if (env.CONTRIBUTOR_JOURNEY_INSTALLED === '1') {
        const origin = env.CONTRIBUTOR_JOURNEY_PREVIEW_ORIGIN ?? '';
        const parsed = new URL(origin);
        if (parsed.protocol !== 'https:' || parsed.origin !== origin || parsed.username || parsed.password)
            throw new Error('canonical same-origin HTTPS preview required');
        const replayKey = env.CONTRIBUTOR_JOURNEY_REPLAY_KEY ?? '';
        const integrityKey = env.CONTRIBUTOR_JOURNEY_INTEGRITY_KEY ?? '';
        const cursorKey = env.CONTRIBUTOR_JOURNEY_CURSOR_KEY ?? '';
        if ([replayKey, integrityKey, cursorKey].some(key => !/^[a-f0-9]{64}$/.test(key)) || new Set([replayKey, integrityKey, cursorKey]).size !== 3)
            throw new Error('distinct32-byte stable installed staging keys required');
        const rounds = JSON.parse(env.CONTRIBUTOR_JOURNEY_FUTURE_ROUNDS ?? '[]');
        if (!Array.isArray(rounds) || rounds.length > 16 || rounds.some(round => !round || Object.keys(round).sort().join() !== 'provenance,roundKey' ||
            !/^[a-z0-9][a-z0-9_-]{2,79}$/.test(round.roundKey) || !['test', 'fixture'].includes(round.provenance) ||
            ['agent-opportunity-221400-v1', 'contributor-reuse-trial-100198'].includes(round.roundKey)))
            throw new Error('explicit bounded synthetic future-round allowlist required');
        base.installed = { origin, replayKey, integrityKey, cursorKey, futureRounds: rounds };
        base.corsOrigins = [origin];
    }
    return base;
}
//# sourceMappingURL=config.js.map