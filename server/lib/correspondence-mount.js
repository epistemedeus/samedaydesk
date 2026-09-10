// Optional correspondence mount for the existing SameDayDesk Node process.
// Unconfigured: truthful disabled healthz only. Never takes down SDS routes.
// No host-global CORS, no memory store outside NODE_ENV=test, no retry loop.
import express from "express";

export const CORRESPONDENCE_PREFIX = "/api/correspondence";
export const MOUNTED_PG_SCHEMA = "pilot_correspondence";
const COOLDOWN_MS = 5_000;
const SCHEMA_RE = /^[a-z][a-z0-9_]{0,62}$/;
const RESERVED_SCHEMAS = new Set(["pg_catalog", "information_schema", "pg_toast"]);

function jsonError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

function readinessBody(state) {
  if (state.status === "ready") {
    return { ok: true, enabled: true, store: "postgres" };
  }
  return { ok: false, enabled: false, reason: state.reason };
}

export function inspectCorrespondenceEnv(env = process.env) {
  const url = String(env.CORRESPONDENCE_DATABASE_URL || "").trim();
  const token = String(env.CORRESPONDENCE_ADMIN_TOKEN || "").trim();
  const store = String(env.CORRESPONDENCE_STORE || "postgres").toLowerCase();
  if (store !== "postgres" && store !== "memory") return { kind: "invalid_config", detail: "invalid store" };
  const nodeEnv = env.NODE_ENV || "production";
  if (!url && !token) return { kind: "unconfigured" };
  if (store === "memory" && nodeEnv !== "test") {
    return { kind: "invalid_config", detail: "memory store refused outside test" };
  }
  if (!url || !token || token.length < 24) {
    return { kind: "invalid_config", detail: "database url and admin token required together" };
  }
  try {
    const parsed = new URL(url);
    if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname || parsed.pathname.length < 2 || parsed.hash) {
      return { kind: "invalid_config", detail: "database URL must name a Postgres host and database" };
    }
  } catch { return { kind: "invalid_config", detail: "invalid database URL" }; }
  const schema = String(env.CORRESPONDENCE_PG_SCHEMA || MOUNTED_PG_SCHEMA).trim();
  if (!SCHEMA_RE.test(schema) || RESERVED_SCHEMAS.has(schema) || schema !== MOUNTED_PG_SCHEMA) {
    return { kind: "invalid_config", detail: "invalid schema" };
  }
  const poolRaw = env.CORRESPONDENCE_POOL_MAX;
  const poolMax = poolRaw == null || String(poolRaw).trim() === "" ? 4 : Number(String(poolRaw).trim());
  if (!Number.isInteger(poolMax) || poolMax < 1 || poolMax > 4) {
    return { kind: "invalid_config", detail: "invalid pool" };
  }
  try {
    if (env.CORRESPONDENCE_TRUST_PROXY != null && String(env.CORRESPONDENCE_TRUST_PROXY).trim() !== "") {
      const hops = Number(String(env.CORRESPONDENCE_TRUST_PROXY).trim());
      if (String(env.CORRESPONDENCE_TRUST_PROXY).trim().toLowerCase() === "true" ||
          !Number.isInteger(hops) || hops < 0 || hops > 5) {
        return { kind: "invalid_config", detail: "invalid trust proxy" };
      }
    }
  } catch {
    return { kind: "invalid_config", detail: "invalid trust proxy" };
  }
  return { kind: "configured", url, token, schema, poolMax, store };
}

function disabledRouter(state) {
  const router = express.Router();
  router.get("/healthz", (_req, res) => {
    res.status(200).json(readinessBody(state));
  });
  router.use((req, res) => {
    const code =
      state.reason === "unconfigured" ||
      state.reason === "invalid_config" ||
      state.reason === "store_unavailable"
        ? state.reason
        : "store_unavailable";
    return jsonError(res, 503, code, "correspondence is not enabled");
  });
  return router;
}

export function mountCorrespondence(app, options = {}) {
  const env = options.env || process.env;
  const prefix = options.prefix || CORRESPONDENCE_PREFIX;
  const now = options.now || Date.now;
  const loadService = options.loadService;
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
    const inspected = inspectCorrespondenceEnv(env);
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
      const service = loadService
        ? await loadService()
        : await import("@neomorphic/correspondence");
      const configEnv = {
        ...env,
        DATABASE_URL: inspected.url,
        CORRESPONDENCE_DATABASE_URL: inspected.url,
        CORRESPONDENCE_ADMIN_TOKEN: inspected.token,
        CORRESPONDENCE_PG_SCHEMA: inspected.schema,
        CORRESPONDENCE_POOL_MAX: String(inspected.poolMax),
        CORRESPONDENCE_STORE: inspected.store,
      };
      const config = service.loadConfig(configEnv);
      const store = await service.createPostgresStore(config.databaseUrl, {
        schema: config.pgSchema || inspected.schema,
        poolMax: config.poolMax || inspected.poolMax,
      });
      state.store = store;
      if (state.closed) { await store.close(); state.store = null; return; }
      state.app = service.createApp(store, config);
      state.status = "ready";
      state.reason = "ready";
    } catch (error) {
      if (state.store?.close) await state.store.close().catch(() => {});
      state.store = null;
      state.app = null;
      state.status = "disabled";
      state.reason = "store_unavailable";
      console.error("correspondence_store_unavailable", {
        name: error instanceof Error ? error.name : "unknown",
      });
    }
  }

  function dispatch(req, res, next) {
    const proceed = () => {
      if (state.app) return state.app(req, res, next);
      return disabled(req, res, next);
    };
    if (state.inFlight) {
      return Promise.resolve(state.inFlight).then(proceed).catch(next);
    }
    if (!state.closed && !state.retried && state.reason === "store_unavailable" && now() - state.lastAttempt >= COOLDOWN_MS) {
      state.retried = true;
      state.inFlight = tryEnable().finally(() => {
        state.inFlight = null;
      });
      return state.inFlight.then(proceed).catch(next);
    }
    return proceed();
  }

  app.use(prefix, (req, res, next) => dispatch(req, res, next));
  state.inFlight = tryEnable().finally(() => {
    state.inFlight = null;
  });

  return {
    state,
    ready: () => state.inFlight || Promise.resolve(),
    close: async () => {
      state.closed = true;
      await state.inFlight;
      state.status = "disabled";
      state.reason = "store_unavailable";
      if (state.store?.close) await state.store.close();
      state.store = null;
      state.app = null;
    },
  };
}
