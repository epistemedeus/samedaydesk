import { z } from 'zod';
import { parsePgSchema } from '../earned-work/src/config.js';
import { isDeepStrictEqual } from 'node:util';
export const JOURNEY_MOUNT_PATH = "/api/neomorphic-contributor-journey";
export const PRODUCT_SOURCE_PIN = "ff6c03653f6c268d89502986a5062d36044f6cd0";
export const SDS_SOURCE_PIN = "d8cea059213e06d2f263be67f82e498f8052a50f";
export const LIVE_PROFILE_PRODUCT_BASE = '2a0cbd71b0c14c124d592ed6b6b66f7f35cbacd4';
export const LIVE_PROFILE_SDS_BASE = 'f864cadceaa7d2ee80077058992e95102ef361ae';
export const LEGACY_ROUNDS = new Set(['agent-opportunity-221400-v1', 'contributor-reuse-trial-100198']);
const roundKey = z.string().regex(/^[a-z0-9][a-z0-9_-]{2,79}$/).refine(key => !LEGACY_ROUNDS.has(key));
const stagingRounds = z.array(z.object({ roundKey, provenance: z.enum(['test', 'fixture']) }).strict()).max(16);
const liveRounds = z.array(z.object({ roundKey, provenance: z.literal('production'),
    roundId: z.string().regex(/^rnd_[A-Za-z0-9_-]{16}$/), termsVersion: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    tasks: z.array(z.object({ offerKey: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/),
        requesterAccountId: z.string().regex(/^acc_[A-Za-z0-9_-]{16}$/), publicDiscussion: z.boolean() }).strict()).min(1).max(64)
        .refine(tasks => new Set(tasks.map(task => task.offerKey)).size === tasks.length),
}).strict()).max(16);
function liveSchema(raw) {
    if (!raw)
        throw new Error('explicit durable schema binding required');
    const schema = parsePgSchema(raw);
    if (schema === 'public' || schema.startsWith('pg_') || schema.startsWith('cj227_') ||
        /(?:staging|fixture|test)/.test(schema) || schema === 'neo_opportunity_221400')
        throw new Error('durable schema cannot be synthetic, historical or shared public');
    return schema;
}
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
/** Explicit store binding only. Live admission never changes a source's provenance. */
export function loadJourneyConfig(env = process.env) {
    const mode = env.CONTRIBUTOR_JOURNEY_MODE ?? "disabled";
    if (!['disabled', 'staging', 'live'].includes(mode))
        throw new Error("CONTRIBUTOR_JOURNEY_MODE must be disabled, staging or live");
    const listenHost = env.CONTRIBUTOR_JOURNEY_LISTEN_HOST ?? "127.0.0.1";
    if (listenHost !== "127.0.0.1" && listenHost !== "::1")
        throw new Error("journey listener must be loopback");
    const corsOrigins = (env.CONTRIBUTOR_JOURNEY_CORS_ORIGINS ?? "http://127.0.0.1:4321,http://localhost:4321")
        .split(",").filter(Boolean).map(canonicalizeCorsOrigin);
    const base = {
        mode: mode,
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
        throw new Error("explicit journey database URL is required");
    }
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.hash ||
        (mode === 'staging' ? !/^\/contributor_journey_staging(?:_[a-z0-9_]+)?$/.test(url.pathname) :
            !/^\/[a-z][a-z0-9_]{0,62}$/.test(url.pathname) || /(?:staging|fixture|test|221400)/.test(url.pathname)) ||
        [...url.searchParams.keys()].some(key => !["sslmode", "sslrootcert", "application_name"].includes(key))) {
        throw new Error("database must match the selected profile; connection overrides are refused");
    }
    if (mode === 'staging' && (raw === env.DATABASE_URL || raw === env.EARNED_WORK_DATABASE_URL || raw === env.NEOMORPHIC_OPPORTUNITY_DATABASE_URL)) {
        throw new Error("journey must use a dedicated staging database");
    }
    const ownerToken = env.CONTRIBUTOR_JOURNEY_OWNER_TOKEN ?? "";
    const correspondenceAdminToken = env.CONTRIBUTOR_JOURNEY_CORRESPONDENCE_ADMIN_TOKEN ?? "";
    if (ownerToken.length < 24 || correspondenceAdminToken.length < 24 || ownerToken === correspondenceAdminToken ||
        [env.EARNED_WORK_OWNER_TOKEN, env.NEOMORPHIC_OPPORTUNITY_OWNER_TOKEN, env.CORRESPONDENCE_ADMIN_TOKEN]
            .some(token => token && (token === ownerToken || token === correspondenceAdminToken))) {
        throw new Error("distinct dedicated service tokens (>=24 characters) are required");
    }
    base.storage = {
        databaseUrl: raw,
        earnedWorkSchema: mode === 'live' ? liveSchema(env.CONTRIBUTOR_JOURNEY_EARNED_WORK_SCHEMA) : 'cj227_earned_work',
        correspondenceSchema: mode === 'live' ? liveSchema(env.CONTRIBUTOR_JOURNEY_CORRESPONDENCE_SCHEMA) : 'cj227_correspondence',
        poolMax: integer(env.CONTRIBUTOR_JOURNEY_POOL_MAX, 2, 1, 2, "pool max"),
        ownerToken,
        correspondenceAdminToken,
    };
    if (base.storage.earnedWorkSchema === base.storage.correspondenceSchema)
        throw new Error('distinct canonical service schemas required');
    if (mode === 'live' && env.CONTRIBUTOR_JOURNEY_INSTALLED !== '1')
        throw new Error('live profile requires the installed composition');
    if (env.CONTRIBUTOR_JOURNEY_INSTALLED === '1') {
        const origin = (mode === 'live' ? env.CONTRIBUTOR_JOURNEY_ORIGIN : env.CONTRIBUTOR_JOURNEY_PREVIEW_ORIGIN) ?? '';
        const parsed = new URL(origin);
        if (parsed.protocol !== 'https:' || parsed.origin !== origin || parsed.username || parsed.password)
            throw new Error('canonical same-origin HTTPS preview required');
        const replayKey = env.CONTRIBUTOR_JOURNEY_REPLAY_KEY ?? '';
        const integrityKey = env.CONTRIBUTOR_JOURNEY_INTEGRITY_KEY ?? '';
        const cursorKey = env.CONTRIBUTOR_JOURNEY_CURSOR_KEY ?? '';
        if ([replayKey, integrityKey, cursorKey].some(key => !/^[a-f0-9]{64}$/.test(key)) || new Set([replayKey, integrityKey, cursorKey]).size !== 3)
            throw new Error('distinct32-byte stable installed keys required');
        const parsedRounds = (mode === 'live' ? liveRounds : stagingRounds).safeParse(JSON.parse(env.CONTRIBUTOR_JOURNEY_FUTURE_ROUNDS ?? '[]'));
        if (!parsedRounds.success || new Set(parsedRounds.data.map(round => round.roundKey)).size !== parsedRounds.data.length)
            throw new Error('explicit unique profile-matched round bindings required');
        const storeId = mode === 'live' ? env.CONTRIBUTOR_JOURNEY_STORE_ID : undefined;
        if (mode === 'live' && (!storeId || !/^[a-z][a-z0-9_-]{2,79}$/.test(storeId)))
            throw new Error('stable durable store ID required');
        if (mode === 'live' && !['0', '1'].includes(env.CONTRIBUTOR_JOURNEY_PUBLIC_READS ?? '0'))
            throw new Error('public reads must be explicitly 0 or 1');
        base.installed = { origin, replayKey, integrityKey, cursorKey, futureRounds: parsedRounds.data,
            ...(storeId ? { storeId, publicReads: env.CONTRIBUTOR_JOURNEY_PUBLIC_READS === '1' } : {}) };
        base.corsOrigins = [origin];
    }
    return base;
}
/** Reconstruct every option at the factory boundary, including direct object callers. */
export function validateJourneyConfig(config) {
    const { storage, installed } = config;
    const checked = loadJourneyConfig({ CONTRIBUTOR_JOURNEY_MODE: config.mode,
        CONTRIBUTOR_JOURNEY_LISTEN_HOST: config.listenHost, CONTRIBUTOR_JOURNEY_PORT: String(config.port),
        CONTRIBUTOR_JOURNEY_CORS_ORIGINS: config.corsOrigins.join(','), CONTRIBUTOR_JOURNEY_RATE_LIMIT_MAX: String(config.rateLimitMax),
        CONTRIBUTOR_JOURNEY_RATE_LIMIT_WINDOW_MS: String(config.rateLimitWindowMs), CONTRIBUTOR_JOURNEY_TRUST_PROXY: String(config.trustProxyHops),
        ...(storage ? { CONTRIBUTOR_JOURNEY_DATABASE_URL: storage.databaseUrl, CONTRIBUTOR_JOURNEY_OWNER_TOKEN: storage.ownerToken,
            CONTRIBUTOR_JOURNEY_CORRESPONDENCE_ADMIN_TOKEN: storage.correspondenceAdminToken, CONTRIBUTOR_JOURNEY_POOL_MAX: String(storage.poolMax),
            CONTRIBUTOR_JOURNEY_EARNED_WORK_SCHEMA: storage.earnedWorkSchema, CONTRIBUTOR_JOURNEY_CORRESPONDENCE_SCHEMA: storage.correspondenceSchema } : {}),
        ...(installed ? { CONTRIBUTOR_JOURNEY_INSTALLED: '1', CONTRIBUTOR_JOURNEY_PREVIEW_ORIGIN: installed.origin, CONTRIBUTOR_JOURNEY_ORIGIN: installed.origin,
            CONTRIBUTOR_JOURNEY_REPLAY_KEY: installed.replayKey, CONTRIBUTOR_JOURNEY_INTEGRITY_KEY: installed.integrityKey,
            CONTRIBUTOR_JOURNEY_CURSOR_KEY: installed.cursorKey, CONTRIBUTOR_JOURNEY_STORE_ID: installed.storeId,
            CONTRIBUTOR_JOURNEY_PUBLIC_READS: installed.publicReads ? '1' : '0',
            CONTRIBUTOR_JOURNEY_FUTURE_ROUNDS: JSON.stringify(installed.futureRounds) } : {}) });
    if (!isDeepStrictEqual(config, checked))
        throw new Error('journey configuration differs from the validated profile');
    return checked;
}
//# sourceMappingURL=config.js.map