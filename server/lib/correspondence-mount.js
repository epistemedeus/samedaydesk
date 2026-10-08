// Optional correspondence mount for the existing SameDayDesk Node process.
// Unconfigured: truthful disabled healthz only. Never takes down SDS routes.
// No host-global CORS, no memory store outside NODE_ENV=test, no retry loop.
import express from "express";
import { startupDiagnostic } from "../foundry/startup-diagnostic.js";
import { foundryHostOptIn, parseFoundryBodyLimit } from "../foundry/opt-in.js";
import { REUSE_CLASS, reusesProductDataService } from "../foundry/product-isolation.js";
import { closeEntryThenBase, openEntryFacade } from "../foundry/compose.js";
import { verifiedFoundryDatabaseUrl } from "../foundry/pg-tls.js";
import { hostInputsFromEnv } from "../foundry/private-files.js";
import { receiveServingRuntime, servingRuntimeFailure } from "../foundry/serving-runtime.mjs";
import { guardVisitorEvent } from "./original-task/event-guard.mjs";
import { handleOriginalTaskOperator, isOriginalTaskOperatorPath } from "./original-task/operator-http.mjs";

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
  let foundryOptIn = false;
  try {
    foundryOptIn = foundryHostOptIn(env);
    parseFoundryBodyLimit(env);
  } catch {
    return { kind: "invalid_config", detail: "foundry opt-in" };
  }
  let url = String(env.CORRESPONDENCE_DATABASE_URL || "").trim();
  const token = String(env.CORRESPONDENCE_ADMIN_TOKEN || "").trim();
  if (url && reusesProductDataService(url, { supabaseUrl: env.SUPABASE_URL })) {
    return { kind: "invalid_config", detail: REUSE_CLASS };
  }
  const store = String(env.CORRESPONDENCE_STORE || "postgres").toLowerCase();
  if (store !== "postgres" && store !== "memory") return { kind: "invalid_config", detail: "invalid store" };
  const nodeEnv = env.NODE_ENV || "production";
  if (!url && !token) {
    if (foundryOptIn) return { kind: "invalid_config", detail: "foundry opt-in requires database url and admin token" };
    return { kind: "unconfigured" };
  }
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
  try {
    if (env.FOUNDRY_EXECUTION_RUNTIME) throw new Error("runtime_selection_unsupported");
    url = verifiedFoundryDatabaseUrl(url, env);
  } catch { return { kind: "invalid_config", detail: "foundry runtime or TLS configuration" }; }
  return { kind: "configured", url, token, schema, poolMax, store, foundryOptIn };
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
    foundry: { optIn: false, extension: false, reason: "opt_in_unset", facade: false, rawMounted: false },
    entryReuseMount: null,
    adminToken: null,
  };
  const disabled = disabledRouter(state);
  // Shared by initial enable and the existing bounded store retry. Publication
  // receiving runs once for this HTTP mount, never from a request or owner pass.
  let runtimeReceiving;

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
    if (inspected.foundryOptIn && !options.createEntryReuseMount && !options.hostProfile) {
      const inputs = hostInputsFromEnv(env);
      if (!inputs.ok) {
        state.status = "disabled";
        state.reason = "invalid_config";
        state.foundry = { optIn: true, extension: false, reason: inputs.reason, facade: false, rawMounted: false };
        return;
      }
    }
    state.lastAttempt = now();
    let mounted = null;
    let startupStage = "runtime_publication";
    try {
      if (inspected.foundryOptIn && !options.createEntryReuseMount) {
        runtimeReceiving ||= receiveServingRuntime();
        try { state.runtimePublication = await runtimeReceiving; }
        catch (error) {
          console.error("foundry_runtime_startup_refused", servingRuntimeFailure(error));
          throw error;
        }
      }
      startupStage = "service_import";
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
      startupStage = "service_config";
      const config = {
        ...service.loadConfig(configEnv),
        bodyLimitBytes: parseFoundryBodyLimit(env),
      };
      // Opt-in serving does not migrate. createPostgresStore applies the base
      // schema as a side effect, so the installed facade opens the class directly.
      startupStage = "store_create";
      const store = inspected.foundryOptIn && !loadService
        ? new service.PostgresStore(config.databaseUrl, {
          schema: config.pgSchema || inspected.schema,
          poolMax: config.poolMax || inspected.poolMax,
        })
        : await service.createPostgresStore(config.databaseUrl, {
          schema: config.pgSchema || inspected.schema,
          poolMax: config.poolMax || inspected.poolMax,
        });
      state.store = store;
      if (state.closed) {
        await store.close();
        state.store = null;
        return;
      }
      if (!inspected.foundryOptIn) {
        startupStage = "app_create";
        state.app = service.createApp(store, config);
        state.foundry = { optIn: false, extension: false, reason: "opt_in_unset", facade: false, rawMounted: false };
      } else {
        const opened = await openEntryFacade({
          store,
          config,
          env,
          createEntryReuseMount: options.createEntryReuseMount,
          hostProfile: options.hostProfile,
          participationKey: options.participationKey,
          onStartupStage: (stage) => { startupStage = stage; },
        });
        mounted = opened.mounted;
        state.entryReuseMount = mounted;
        if (state.closed) {
          await closeEntryThenBase(mounted, store);
          state.entryReuseMount = null;
          state.store = null;
          return;
        }
        await store.checkReady();
        state.app = mounted.app;
        state.foundry = {
          optIn: true,
          extension: true,
          reason: "ready",
          facade: true,
          rawMounted: false,
        };
      }
      state.adminToken = inspected.token;
      state.status = "ready";
      state.reason = "ready";
    } catch (error) {
      await closeEntryThenBase(mounted || state.entryReuseMount, state.store).catch(() => {});
      state.entryReuseMount = null;
      state.store = null;
      state.app = null;
      state.adminToken = null;
      state.status = "disabled";
      state.reason = "store_unavailable";
      console.error("correspondence_store_unavailable", startupDiagnostic(startupStage, error));
    }
  }

  function dispatch(req, res, next) {
    const proceed = () => {
      if (isOriginalTaskOperatorPath(req.path)) {
        if (!state.app || !state.store || !state.adminToken) return disabled(req, res, next);
        return handleOriginalTaskOperator(req, res, { store: state.store, adminToken: state.adminToken });
      }
      if (req.path === "/foundry-receiver" && state.foundry?.optIn && state.status === "ready") {
        return res.status(200).json({
          optIn: true,
          extension: state.foundry.extension,
          reason: state.foundry.reason,
          bodyLimitBytes: parseFoundryBodyLimit(env),
          schema: "pilot_correspondence",
          facade: true,
          rawMounted: false,
          vf09: "private_loader",
          publicExecution: false,
          wholeHostSandbox: false,
        });
      }
      if (state.app) {
        if (!state.store) return state.app(req, res, next);
        return guardVisitorEvent(req, res, next, {
          store: state.store,
          forward: () => state.app(req, res, next),
        });
      }
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
      state.adminToken = null;
      const entry = state.entryReuseMount;
      const store = state.store;
      state.entryReuseMount = null;
      state.store = null;
      state.app = null;
      await closeEntryThenBase(entry, store);
    },
  };
}
