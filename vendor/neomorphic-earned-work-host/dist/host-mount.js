/**
 * Optional mount for a host that already listens (SameDayDesk Node).
 * Unconfigured or EARNED_WORK_MOUNT=0: disabled health only. No schema drop.
 * Imports the public @neomorphic/earned-work package. It does not import kernel source.
 */
import express from "express";
import { createApp, createPostgresStore, loadConfig, parsePoolMax } from "@neomorphic/earned-work";
/** Same URL bound as the kernel. parseDatabaseUrl is not a package export. */
function parseMountDatabaseUrl(raw) {
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
}
/** Same hop bound as the kernel. parseTrustProxyHops is not a package export. */
function parseMountTrustProxy(raw) {
    if (raw == null || raw.trim() === "" || raw.trim().toLowerCase() === "false")
        return;
    const trimmed = raw.trim().toLowerCase();
    if (trimmed === "true") {
        throw new Error("EARNED_WORK_TRUST_PROXY must be an integer hop count (0 or >=1), not boolean true");
    }
    const value = Number(trimmed);
    if (!Number.isInteger(value) || value < 0 || value > 5) {
        throw new Error("EARNED_WORK_TRUST_PROXY must be an integer from 0 to 5");
    }
}
export const MOUNT_PREFIX = "/api/earned-work";
export const MOUNTED_PG_SCHEMA = "pilot_earned_work";
const COOLDOWN_MS = 5_000;
function mountArmed(raw) {
    const value = String(raw ?? "").trim().toLowerCase();
    if (value === "")
        return "absent";
    if (value === "0" || value === "false" || value === "off" || value === "disabled")
        return "off";
    if (value === "1" || value === "true" || value === "on")
        return "on";
    return "off";
}
/**
 * Generic DATABASE_URL does not enable the mount. The host may already use it.
 * Shared mode accepts only schema pilot_earned_work so public host tables stay put.
 */
export function inspectEarnedWorkMountEnv(env = process.env) {
    const armed = mountArmed(env.EARNED_WORK_MOUNT);
    const url = String(env.EARNED_WORK_DATABASE_URL ?? "").trim();
    const token = String(env.EARNED_WORK_OWNER_TOKEN ?? "").trim();
    if (armed === "off" || (armed === "absent" && !url && !token)) {
        return { kind: "unconfigured" };
    }
    if (armed !== "on") {
        return { kind: "invalid_config", detail: "EARNED_WORK_MOUNT=1 is required to enable the host mount" };
    }
    if (!url || !token) {
        return {
            kind: "invalid_config",
            detail: "EARNED_WORK_DATABASE_URL and EARNED_WORK_OWNER_TOKEN are required together",
        };
    }
    if (token.length < 8) {
        return { kind: "invalid_config", detail: "owner token is too short" };
    }
    try {
        parseMountDatabaseUrl(url);
    }
    catch {
        return { kind: "invalid_config", detail: "database URL must name a Postgres host and database" };
    }
    const schemaRaw = env.EARNED_WORK_PG_SCHEMA;
    const schema = schemaRaw == null || schemaRaw.trim() === "" ? MOUNTED_PG_SCHEMA : schemaRaw.trim();
    if (schema !== MOUNTED_PG_SCHEMA) {
        return { kind: "invalid_config", detail: "shared host requires schema pilot_earned_work" };
    }
    let poolMax;
    try {
        poolMax = parsePoolMax(env.EARNED_WORK_POOL_MAX);
        parseMountTrustProxy(env.EARNED_WORK_TRUST_PROXY);
    }
    catch {
        return { kind: "invalid_config", detail: "invalid pool or trust proxy" };
    }
    return { kind: "configured", url, token, schema: MOUNTED_PG_SCHEMA, poolMax };
}
function readinessBody(reason) {
    if (reason === "ready")
        return { ok: true, enabled: true, store: "postgres" };
    return { ok: false, enabled: false, reason };
}
function disabledRouter(state) {
    const router = express.Router();
    router.get("/healthz", (_req, res) => {
        res.status(200).json(readinessBody(state.reason));
    });
    router.use((_req, res) => {
        const code = state.reason === "unconfigured" ||
            state.reason === "invalid_config" ||
            state.reason === "store_unavailable" ||
            state.reason === "disabled"
            ? state.reason
            : "store_unavailable";
        res.status(503).json({ error: { code, message: "earned-work mount is not enabled" } });
    });
    return router;
}
export function mountEarnedWork(parent, options = {}) {
    const env = options.env ?? process.env;
    const prefix = options.prefix ?? MOUNT_PREFIX;
    const now = options.now ?? Date.now;
    const state = {
        status: "starting",
        reason: "unconfigured",
        app: null,
        store: null,
        lastAttempt: 0,
        inFlight: null,
        retried: false,
        closed: false,
    };
    const disabled = disabledRouter(state);
    async function tryEnable() {
        if (state.closed)
            return;
        const inspected = inspectEarnedWorkMountEnv(env);
        if (inspected.kind === "unconfigured") {
            state.status = "disabled";
            state.reason = "unconfigured";
            return;
        }
        if (inspected.kind === "invalid_config") {
            state.status = "disabled";
            state.reason = "invalid_config";
            return;
        }
        state.lastAttempt = now();
        try {
            const configEnv = {
                ...env,
                EARNED_WORK_DATABASE_URL: inspected.url,
                EARNED_WORK_OWNER_TOKEN: inspected.token,
                EARNED_WORK_PG_SCHEMA: inspected.schema,
                EARNED_WORK_POOL_MAX: String(inspected.poolMax),
            };
            delete configEnv.DATABASE_URL;
            const config = loadConfig(configEnv);
            const store = await createPostgresStore(config.databaseUrl, {
                schema: config.pgSchema,
                poolMax: config.poolMax,
            });
            state.store = store;
            if (state.closed) {
                await store.close();
                state.store = null;
                return;
            }
            state.app = createApp(store, config);
            state.status = "ready";
            state.reason = "ready";
        }
        catch (error) {
            if (state.store)
                await state.store.close().catch(() => { });
            state.store = null;
            state.app = null;
            state.status = "disabled";
            const message = error instanceof Error ? error.message : "";
            const invalid = /must be|required|invalid/i.test(message);
            state.reason = invalid ? "invalid_config" : "store_unavailable";
            if (!invalid) {
                console.error("earned_work_store_unavailable", {
                    name: error instanceof Error ? error.name : "unknown",
                });
            }
        }
    }
    function dispatch(req, res, next) {
        const proceed = () => {
            if (state.app)
                return state.app(req, res, next);
            return disabled(req, res, next);
        };
        if (state.inFlight) {
            return Promise.resolve(state.inFlight).then(proceed, next);
        }
        if (!state.closed &&
            !state.retried &&
            state.reason === "store_unavailable" &&
            now() - state.lastAttempt >= COOLDOWN_MS) {
            state.retried = true;
            state.inFlight = tryEnable().finally(() => {
                state.inFlight = null;
            });
            return state.inFlight.then(proceed, next);
        }
        return proceed();
    }
    parent.use(prefix, (req, res, next) => dispatch(req, res, next));
    state.inFlight = tryEnable().finally(() => {
        state.inFlight = null;
    });
    return {
        state,
        ready: () => state.inFlight ?? Promise.resolve(),
        close: async () => {
            state.closed = true;
            if (state.inFlight)
                await state.inFlight;
            state.status = "disabled";
            state.reason = "disabled";
            state.app = null;
            const store = state.store;
            state.store = null;
            if (store)
                await store.close();
        },
    };
}
//# sourceMappingURL=host-mount.js.map