import pg from "pg";
import { z } from "zod";
import { createApp as createEarnedWorkApp } from "../earned-work/src/app.js";
import { createPostgresStore as createEarnedWorkStore } from "../earned-work/src/store/postgres.js";
import { loadConfig as loadEarnedWorkConfig } from "../earned-work/src/config.js";
import { createApp as createCorrespondenceApp } from "../correspondence/src/app.js";
import { createPostgresStore as createCorrespondenceStore } from "../correspondence/src/store/postgres.js";
import { loadConfig as loadCorrespondenceConfig } from "../correspondence/src/config.js";
import { createJourneyApp } from "./app.js";
import { loadJourneyConfig, validateJourneyConfig } from "./config.js";
import { migrateJourneyStores } from "./storage.js";
import { createInstalledComposition } from './installed.js';
const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const termsVersion = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const privateReadbackSchema = z.object({
    taskId: identifier,
    reservation: z.object({
        id: identifier, termsVersion,
        status: z.enum(["active", "submitted", "expired", "released", "completed"]),
        expiresAt: z.string().datetime({ offset: true }),
    }).strict(),
    submission: z.object({
        artifactId: identifier, reservationId: identifier, termsVersion,
        artifact: z.object({
            ref: z.string().min(1).max(2048), digestSha256: z.string().regex(/^[0-9a-f]{64}$/i),
            mediaType: z.string().min(1).max(200), bytes: z.number().int().min(1).max(1000000),
        }).strict(),
        submittedAt: z.string().datetime({ offset: true }),
    }).strict().nullable(),
    obligation: z.object({ obligationId: identifier, workId: identifier, payoutState: z.literal("owed") }).strict().nullable(),
}).strict();
/** A read-only projection of the existing kernel, not another store or migration. */
function canonicalPrivateReadback(pool, schema) {
    return async (taskId, principalId) => {
        identifier.parse(taskId);
        identifier.parse(principalId);
        const result = await pool.query(`
      SELECT json_build_object(
        'taskId', r.task_id,
        'reservation', json_build_object('id', r.id, 'termsVersion', r.terms_version,
          'status', CASE WHEN r.status = 'active' AND r.expires_at <= CURRENT_TIMESTAMP THEN 'expired' ELSE r.status END,
          'expiresAt', to_char(r.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
        'submission', CASE WHEN s.id IS NULL THEN NULL ELSE json_build_object(
          'artifactId', s.id, 'reservationId', s.reservation_id, 'termsVersion', s.terms_version,
          'artifact', json_build_object('ref', s.artifact_ref, 'digestSha256', s.artifact_digest_sha256,
            'mediaType', s.artifact_media_type, 'bytes', s.artifact_bytes),
          'submittedAt', to_char(s.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) END,
        'obligation', CASE WHEN o.id IS NULL THEN NULL ELSE json_build_object(
          'obligationId', o.id, 'workId', o.submission_id, 'payoutState', o.payout_state) END
      ) AS work
      FROM "${schema}".earned_work_reservations r
      JOIN "${schema}".earned_work_tasks t ON t.id = r.task_id AND t.provenance IN ('test', 'fixture')
      JOIN "${schema}".earned_work_contributor_tokens c ON c.id = r.contributor_token_id
        AND c.revoked_at IS NULL AND (c.expires_at IS NULL OR c.expires_at > CURRENT_TIMESTAMP)
      LEFT JOIN "${schema}".earned_work_submissions s ON s.reservation_id = r.id AND s.task_id = r.task_id AND s.terms_version = r.terms_version
      LEFT JOIN "${schema}".earned_work_obligations o ON o.reservation_id = r.id AND o.submission_id = s.id AND o.task_id = r.task_id AND o.terms_version = r.terms_version
      WHERE r.task_id = $1 AND r.contributor_token_id = $2
      ORDER BY r.created_at DESC, r.id DESC LIMIT 1`, [taskId, principalId]);
        if (!result.rows[0])
            return null;
        const checked = privateReadbackSchema.safeParse(result.rows[0].work);
        if (!checked.success)
            throw new Error('invalid authoritative private readback');
        return checked.data;
    };
}
async function openJourneyResources(config) {
    const storage = config.storage;
    const earnedConfig = loadEarnedWorkConfig({
        EARNED_WORK_DATABASE_URL: storage.databaseUrl, EARNED_WORK_OWNER_TOKEN: storage.ownerToken,
        EARNED_WORK_PG_SCHEMA: storage.earnedWorkSchema, EARNED_WORK_POOL_MAX: String(storage.poolMax),
        EARNED_WORK_CORS_ORIGINS: config.corsOrigins.join(","), EARNED_WORK_TRUST_PROXY: String(config.trustProxyHops),
        EARNED_WORK_RATE_LIMIT_MAX: String(config.rateLimitMax), EARNED_WORK_RATE_LIMIT_WINDOW_MS: String(config.rateLimitWindowMs),
    });
    const correspondenceConfig = loadCorrespondenceConfig({
        DATABASE_URL: storage.databaseUrl, CORRESPONDENCE_ADMIN_TOKEN: storage.correspondenceAdminToken,
        CORRESPONDENCE_PG_SCHEMA: storage.correspondenceSchema, CORRESPONDENCE_POOL_MAX: String(storage.poolMax),
        CORRESPONDENCE_CORS_ORIGINS: config.corsOrigins.join(","), CORRESPONDENCE_TRUST_PROXY: String(config.trustProxyHops),
        CORRESPONDENCE_RATE_LIMIT_MAX: String(config.rateLimitMax), CORRESPONDENCE_RATE_LIMIT_WINDOW_MS: String(config.rateLimitWindowMs),
    });
    const owned = [];
    const close = async () => {
        const outcomes = await Promise.allSettled(owned.splice(0).map(resource => resource.close()));
        if (outcomes.some(outcome => outcome.status === "rejected"))
            throw new Error("journey shutdown incomplete");
    };
    try {
        const earnedStore = await createEarnedWorkStore(storage.databaseUrl, { schema: storage.earnedWorkSchema, poolMax: storage.poolMax });
        owned.push(earnedStore);
        const correspondenceStore = await createCorrespondenceStore(storage.databaseUrl, { schema: storage.correspondenceSchema, poolMax: storage.poolMax });
        owned.push(correspondenceStore);
        const readPool = new pg.Pool({
            connectionString: storage.databaseUrl, max: 1, connectionTimeoutMillis: 5000,
            statement_timeout: 5000, query_timeout: 6000, idleTimeoutMillis: 1000,
            options: "-c default_transaction_read_only=on", allowExitOnIdle: true,
        });
        readPool.on("error", () => { });
        owned.push({ close: () => readPool.end() });
        const services = {
            earnedWork: {
                store: earnedStore, config: earnedConfig, app: createEarnedWorkApp(earnedStore, earnedConfig),
                readContributorWork: canonicalPrivateReadback(readPool, storage.earnedWorkSchema),
            },
            correspondence: { store: correspondenceStore, config: correspondenceConfig, app: createCorrespondenceApp(correspondenceStore, correspondenceConfig) },
        };
        if (config.installed) {
            const common = { connectionString: storage.databaseUrl, connectionTimeoutMillis: 5000, statement_timeout: 5000, query_timeout: 6000,
                idleTimeoutMillis: 1000, allowExitOnIdle: true, options: `-c search_path=${storage.earnedWorkSchema}` };
            const pool = new pg.Pool({ ...common, max: 2 });
            pool.on('error', () => { });
            owned.push({ close: () => pool.end() });
            const lockPool = new pg.Pool({ ...common, max: 1 });
            lockPool.on('error', () => { });
            owned.push({ close: () => lockPool.end() });
            return { services, pool, lockPool, close };
        }
        return { services, pool: null, lockPool: null, close };
    }
    catch (error) {
        await close().catch(() => { });
        throw error;
    }
}
export async function createJourneyRuntime(options = {}) {
    const config = validateJourneyConfig(options.config ?? loadJourneyConfig(options.env));
    if (config.mode === 'disabled')
        return { app: createJourneyApp({ config }), services: null, config, close: async () => { } };
    if (config.mode === 'live' && (options.ports || options.modules))
        throw new Error('live profile requires actual installed adapters');
    const resources = await openJourneyResources(config);
    try {
        const { services, pool, lockPool, close } = resources;
        if (config.installed) {
            const installed = await createInstalledComposition({ config, services, pool: pool, lockPool: lockPool });
            return { app: createJourneyApp({ config, services, ports: installed.ports, modules: installed.modules, middleware: installed.middleware, extra: installed.extra }),
                installed, services, config, close };
        }
        return { app: createJourneyApp({ config, services, ports: options.ports, modules: options.modules }), services, config, close };
    }
    catch (error) {
        await resources.close().catch(() => { });
        throw error;
    }
}
/** Controller-only preparation. Creates references, never accounts, rounds, grants to recipients or payments. */
export async function prepareJourneyDeployment(options = {}) {
    const config = validateJourneyConfig(options.config ?? loadJourneyConfig(options.env));
    if (config.mode === 'disabled' || !config.installed)
        throw new Error('explicit installed staging/live profile required for preparation');
    const resources = await openJourneyResources(config);
    try {
        const { services, pool } = resources;
        const { admission, db } = await migrateJourneyStores(config, services.earnedWork.store, services.correspondence.store, pool);
        // Validate selected sources before recording enrollment. An absent production source stays absent.
        for (const pin of config.installed.futureRounds)
            await admission.round(pin.roundKey);
        if (options.enroll) {
            await admission.enroll();
            for (const pin of config.installed.futureRounds) {
                if (pin.provenance === 'production')
                    for (const task of pin.tasks)
                        await db.enrollTask(`${pin.roundKey}:${task.offerKey}`, task.requesterAccountId);
            }
            await admission.checkReady();
        }
        return { schema: 'neomorphic.contributor-journey.preparation.v1', profile: config.mode, migrated: true, enrolled: options.enroll === true,
            configuredRounds: config.installed.futureRounds.length,
            configuredTasks: config.installed.futureRounds.reduce((sum, pin) => sum + (pin.provenance === 'production' ? pin.tasks.length : 0), 0),
            createsAccounts: false, createsRounds: false, createsPayments: false, releaseAccepted: false, publicEnabled: false, settlement: 'not_configured' };
    }
    finally {
        await resources.close();
    }
}
//# sourceMappingURL=runtime.js.map