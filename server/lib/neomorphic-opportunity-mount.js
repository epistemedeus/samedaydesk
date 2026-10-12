// Optional opportunity mount for the existing SameDayDesk Node process.
// Unconfigured or invalid: this prefix only. Other host routes stay up.
// The received earned-work service owns claims, terms, evidence and IOUs.
// Kernel task, funding and payout routes are not registered.
import express from "express";
import { reusesProductDataService } from "../foundry/product-isolation.js";

export const OPPORTUNITY_PREFIX = "/api/neomorphic-opportunity";
export const OPPORTUNITY_SCHEMA = "neo_opportunity_221400";
export const OPPORTUNITY_POOL_MAX = 4;
const TOKEN_MIN = 8;
const DIST_URL = new URL(
  "../../vendor/neomorphic-opportunity/services/earned-work/dist/",
  import.meta.url,
);

function jsonError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

function safeCode(error) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  return /^[A-Za-z0-9_]{1,32}$/.test(code) ? code : "unavailable";
}

function sameReference(left, right) {
  const a = String(left || "").trim();
  const b = String(right || "").trim();
  return a.length > 0 && a === b;
}

function databaseReference(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (!["postgres:", "postgresql:"].includes(url.protocol)) return null;
    // pg accepts host/port query overrides. Credentials, TLS and application
    // options do not make a shared database dedicated to this feature.
    const query = Object.fromEntries(url.searchParams);
    const host = decodeURIComponent(query.host || url.hostname).toLowerCase().replace(/\.$/, "");
    const port = Number.parseInt(query.port || url.port || "5432", 10);
    const database = decodeURI(url.pathname.slice(1));
    return host && database && Number.isInteger(port) ? JSON.stringify([host, port, database]) : null;
  } catch {
    return null;
  }
}

function sameDatabase(left, right) {
  const a = databaseReference(left);
  return sameReference(left, right) || (a !== null && a === databaseReference(right));
}

function databasePrincipal(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (!["postgres:", "postgresql:"].includes(url.protocol)) return null;
    const query = Object.fromEntries(url.searchParams);
    // A startup role override is not evidence of an independent application login.
    if (query.options && /(?:^|\s)(?:-c\s*)?(?:role|session_authorization)\s*=/.test(query.options)) return null;
    const principal = decodeURIComponent(query.user || url.username);
    return principal || null;
  } catch {
    return null;
  }
}

function separateCorrespondenceAuthority(url, env) {
  const opportunityPrincipal = databasePrincipal(url);
  const correspondencePrincipal = databasePrincipal(env.CORRESPONDENCE_DATABASE_URL);
  const correspondenceSchema = String(env.CORRESPONDENCE_PG_SCHEMA || "").trim();
  // The existing retained host may share its database, not its application
  // principal or schema. Root must receive the real role ACLs before deployment.
  return opportunityPrincipal !== null && correspondencePrincipal !== null &&
    opportunityPrincipal !== correspondencePrincipal &&
    /^[a-z][a-z0-9_]{0,62}$/.test(correspondenceSchema) &&
    correspondenceSchema !== OPPORTUNITY_SCHEMA;
}

export function inspectOpportunityEnv(env = process.env) {
  const url = String(env.NEOMORPHIC_OPPORTUNITY_DATABASE_URL || "").trim();
  const token = String(env.NEOMORPHIC_OPPORTUNITY_OWNER_TOKEN || "").trim();
  if (!url && !token) return { kind: "unconfigured" };
  if (!url || !token) return { kind: "invalid_config", detail: "incomplete" };
  if (token.length < TOKEN_MIN) return { kind: "invalid_config", detail: "owner_token" };
  if (sameDatabase(url, env.DATABASE_URL) || sameDatabase(url, env.EARNED_WORK_DATABASE_URL)) {
    return { kind: "invalid_config", detail: "reused_database_url" };
  }
  if (sameDatabase(url, env.CORRESPONDENCE_DATABASE_URL) && !separateCorrespondenceAuthority(url, env)) {
    return { kind: "invalid_config", detail: "reused_correspondence_database" };
  }
  if (sameReference(token, env.CORRESPONDENCE_ADMIN_TOKEN)) {
    return { kind: "invalid_config", detail: "reused_correspondence_owner" };
  }
  if (sameReference(token, env.EARNED_WORK_OWNER_TOKEN)) {
    return { kind: "invalid_config", detail: "reused_owner_token" };
  }
  if (reusesProductDataService(url, { supabaseUrl: env.SUPABASE_URL })) {
    return { kind: "invalid_config", detail: "reused_product_data_service" };
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: "invalid_config", detail: "database_url" };
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname || parsed.pathname.length < 2 || parsed.hash) {
    return { kind: "invalid_config", detail: "database_url" };
  }
  const schemaRaw = env.NEOMORPHIC_OPPORTUNITY_PG_SCHEMA;
  const schema = schemaRaw == null || String(schemaRaw).trim() === "" ? OPPORTUNITY_SCHEMA : String(schemaRaw).trim();
  if (schema !== OPPORTUNITY_SCHEMA) return { kind: "invalid_config", detail: "schema" };
  const poolRaw = env.NEOMORPHIC_OPPORTUNITY_POOL_MAX;
  const poolMax = poolRaw == null || String(poolRaw).trim() === "" ? OPPORTUNITY_POOL_MAX : Number(String(poolRaw).trim());
  if (!Number.isInteger(poolMax) || poolMax < 1 || poolMax > OPPORTUNITY_POOL_MAX) {
    return { kind: "invalid_config", detail: "pool" };
  }
  const trustRaw = env.NEOMORPHIC_OPPORTUNITY_TRUST_PROXY;
  let trustProxyHops = 0;
  if (trustRaw != null && String(trustRaw).trim() !== "") {
    const text = String(trustRaw).trim().toLowerCase();
    if (text === "true" || text === "false") return { kind: "invalid_config", detail: "trust_proxy" };
    trustProxyHops = Number(text);
    if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 5) {
      return { kind: "invalid_config", detail: "trust_proxy" };
    }
  }
  const verifierRaw = env.NEOMORPHIC_OPPORTUNITY_VERIFIER;
  if (verifierRaw != null && String(verifierRaw).trim() !== "" && String(verifierRaw).trim().toLowerCase() !== "default") {
    return { kind: "invalid_config", detail: "verifier" };
  }
  // Dedicated owner deployment data only; no generic earned-work environment
  // or claimant input can configure this projection.
  const hostedEnv = {
    EARNED_WORK_HOSTED_ORIGIN: env.NEOMORPHIC_OPPORTUNITY_HOSTED_ORIGIN,
    EARNED_WORK_HOSTED_PREFIX: env.NEOMORPHIC_OPPORTUNITY_HOSTED_PREFIX,
    EARNED_WORK_HOSTED_ROUND_KEY: env.NEOMORPHIC_OPPORTUNITY_HOSTED_ROUND_KEY,
    EARNED_WORK_HOSTED_ADMISSION: env.NEOMORPHIC_OPPORTUNITY_HOSTED_ADMISSION,
  };
  return { kind: "configured", url, token, schema, poolMax, trustProxyHops, hostedEnv };
}

function serviceEnv(inspected) {
  return {
    EARNED_WORK_DATABASE_URL: inspected.url,
    EARNED_WORK_OWNER_TOKEN: inspected.token,
    EARNED_WORK_PG_SCHEMA: inspected.schema,
    EARNED_WORK_POOL_MAX: String(inspected.poolMax),
    EARNED_WORK_VERIFIER: "default",
    EARNED_WORK_CORS_ORIGINS: "https://neomorphic.io",
    EARNED_WORK_TRUST_PROXY: String(inspected.trustProxyHops),
    EARNED_WORK_LISTEN_HOST: "127.0.0.1",
    ...inspected.hostedEnv,
  };
}

function readiness(state) {
  if (state.reason === "store_unavailable") {
    return { status: 503, body: { ok: false, enabled: false, reason: "store_unavailable" } };
  }
  return { status: 200, body: { ok: false, enabled: false, reason: state.reason } };
}

function disabledRouter(state) {
  const router = express.Router();
  router.get("/healthz", (_req, res) => {
    const body = readiness(state);
    res.status(body.status).json(body.body);
  });
  router.use((_req, res) => {
    const code = state.reason === "unconfigured" || state.reason === "invalid_config" || state.reason === "store_unavailable"
      ? state.reason
      : "store_unavailable";
    return jsonError(res, 503, code, "neomorphic opportunity is not enabled");
  });
  return router;
}

async function loadReceivedService(loadService) {
  if (loadService) return loadService();
  const [entry, configMod, authMod, cryptoMod, errorsMod, validationMod, routesMod] = await Promise.all([
    import(new URL("index.js", DIST_URL)),
    import(new URL("config.js", DIST_URL)),
    import(new URL("auth.js", DIST_URL)),
    import(new URL("crypto.js", DIST_URL)),
    import(new URL("errors.js", DIST_URL)),
    import(new URL("validation.js", DIST_URL)),
    import(new URL("opportunity/routes.js", DIST_URL)),
  ]);
  return { entry, configMod, authMod, cryptoMod, errorsMod, validationMod, routesMod };
}

function createSurface(service, store, config) {
  const { configMod, authMod, cryptoMod, errorsMod, validationMod, routesMod } = service;
  const surface = express();
  surface.disable("x-powered-by");
  surface.set("trust proxy", config.trustProxyHops);
  const rateLimit = authMod.createRateLimiter(config);
  surface.use((req, res, next) => {
    res.setHeader("Vary", "Origin");
    const allowed = configMod.allowCorsOrigin(req.header("origin"), config.corsOrigins);
    if (allowed) {
      res.setHeader("Access-Control-Allow-Origin", allowed);
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Max-Age", "600");
    }
    if (req.method === "OPTIONS") {
      res.status(allowed ? 204 : 403).end();
      return;
    }
    next();
  });
  surface.use((req, _res, next) => {
    try {
      rateLimit(req.ip ?? "anonymous");
      next();
    } catch (error) {
      next(error);
    }
  });
  surface.use(express.json({ limit: config.bodyLimitBytes, type: ["application/json"] }));
  surface.get("/healthz", async (_req, res) => {
    try {
      await store.checkReady();
      res.status(200).json({ ok: true, enabled: true, store: store.kind });
    } catch {
      res.status(503).json({ ok: false, enabled: false, store: store.kind, reason: "store_unavailable" });
    }
  });
  // Owner-issued scoped bearer. Same store method as the received service.
  // Callers cannot register themselves.
  surface.post("/v1/contributor-tokens", async (req, res, next) => {
    try {
      configMod.assertOwner(authMod.readBearer(req), config);
      const body = validationMod.parseBody(validationMod.contributorTokenBodySchema, req.body);
      const token = cryptoMod.issueToken("ew_ctr");
      const created = await store.createContributorToken({
        publicId: body.contributorPublicId,
        payoutDestination: body.payoutDestination ?? null,
        taskScope: body.taskId ?? null,
        provenance: body.provenance,
        tokenHash: cryptoMod.hashToken(token),
        expiresAt: body.expiresAt ?? null,
      });
      res.status(201).json({
        token,
        contributorPublicId: created.publicId,
        expiresAt: created.expiresAt,
        provenance: created.provenance,
      });
    } catch (error) {
      next(error);
    }
  });
  routesMod.mountOpportunityRoutes(surface, store, config);
  surface.use((_req, res) => {
    jsonError(res, 404, "not_found", "not found");
  });
  surface.use((error, _req, res, _next) => {
    if (error instanceof SyntaxError) {
      res.status(400).json(errorsMod.errorBody(new errorsMod.ApiError(400, "invalid_input", "malformed JSON body")));
      return;
    }
    if (typeof error === "object" && error && "type" in error && error.type === "entity.too.large") {
      res.status(413).json(errorsMod.errorBody(new errorsMod.ApiError(413, "payload_too_large", "request body exceeds 32KiB")));
      return;
    }
    if (error instanceof errorsMod.ApiError) {
      res.status(error.status).json(errorsMod.errorBody(error));
      return;
    }
    console.error("neomorphic_opportunity_unhandled", { name: error instanceof Error ? error.name : "unknown" });
    res.status(503).json(errorsMod.errorBody(new errorsMod.ApiError(503, "unavailable", "service unavailable")));
  });
  return surface;
}

export function mountNeomorphicOpportunity(app, options = {}) {
  const env = options.env || process.env;
  const prefix = OPPORTUNITY_PREFIX;
  const inspected = inspectOpportunityEnv(env);
  const state = {
    status: "disabled",
    reason: "unconfigured",
    app: null,
    store: null,
    poolMax: null,
    schema: null,
    inFlight: null,
    closed: false,
  };
  if (inspected.kind === "invalid_config") {
    state.reason = "invalid_config";
    console.error("neomorphic_opportunity_invalid_config", { detail: inspected.detail });
  }
  const disabled = disabledRouter(state);

  async function tryEnable() {
    if (inspected.kind !== "configured" || state.closed) return;
    let store = null;
    try {
      const service = await loadReceivedService(options.loadService);
      const config = service.entry.loadConfig(serviceEnv(inspected));
      if (config.pgSchema !== OPPORTUNITY_SCHEMA || config.poolMax !== inspected.poolMax || config.verifierMode !== "default" ||
          (config.hostedDelivery?.configuration === "hosted" && config.hostedDelivery.prefix !== prefix)) {
        state.reason = "invalid_config";
        return;
      }
      store = await service.entry.createPostgresStore(config.databaseUrl, {
        schema: config.pgSchema,
        poolMax: config.poolMax,
        clock: options.clock,
        afterDurableWrite: options.afterDurableWrite,
      });
      if (state.closed) {
        await store.close();
        return;
      }
      state.store = store;
      state.app = createSurface(service, store, config);
      state.poolMax = config.poolMax;
      state.schema = config.pgSchema;
      state.status = "ready";
      state.reason = "ready";
      store = null;
    } catch (error) {
      if (store) await store.close().catch(() => {});
      state.app = null;
      state.store = null;
      state.status = "disabled";
      state.reason = "store_unavailable";
      console.error("neomorphic_opportunity_store_unavailable", { code: safeCode(error) });
    }
  }

  function dispatch(req, res, next) {
    if (state.status === "ready" && state.app) return state.app(req, res, next);
    return disabled(req, res, next);
  }

  app.use(prefix, (req, res, next) => {
    if (state.inFlight) return Promise.resolve(state.inFlight).then(() => dispatch(req, res, next)).catch(next);
    return dispatch(req, res, next);
  });

  if (inspected.kind === "configured") {
    state.status = "starting";
    state.inFlight = tryEnable().finally(() => {
      state.inFlight = null;
    });
  }

  return {
    state,
    ready: () => state.inFlight || Promise.resolve(),
    close: async () => {
      state.closed = true;
      await state.inFlight;
      const store = state.store;
      state.store = null;
      state.app = null;
      state.status = "disabled";
      state.reason = "store_unavailable";
      if (store) await store.close();
    },
  };
}
