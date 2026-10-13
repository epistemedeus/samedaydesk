import { createHash } from "node:crypto";
import express from "express";
import { z } from "zod";
import { MODULE_IDS } from "./types.js";
const opaqueId = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const accountSchema = z.object({
    accountId: opaqueId, sessionId: opaqueId,
    authTime: z.string().datetime({ offset: true }), expiresAt: z.string().datetime({ offset: true }),
    publicProfileId: opaqueId.optional(),
}).strip();
export class JourneyBoundaryError extends Error {
    status;
    code;
    constructor(status, code) {
        super(code);
        this.status = status;
        this.code = code;
    }
}
export function unwrapPort(result) {
    if (result.ok)
        return result.value;
    const status = { unauthenticated: 401, forbidden: 403, not_found: 404, integration_pending: 503, unavailable: 503 }[result.code];
    throw new JourneyBoundaryError(status ?? 503, result.code);
}
/** Validate even trusted adapter results. Session resolver227100 must check revocation on every request. */
export async function resolveAuthenticatedAccount(req, ports, now = Date.now()) {
    if (!ports.resolveAccount)
        throw new JourneyBoundaryError(503, "integration_pending");
    const parsed = accountSchema.safeParse(unwrapPort(await ports.resolveAccount(req)));
    if (!parsed.success)
        throw new JourneyBoundaryError(503, "invalid_account_binding");
    if (Date.parse(parsed.data.authTime) > now || Date.parse(parsed.data.expiresAt) <= now ||
        Date.parse(parsed.data.authTime) >= Date.parse(parsed.data.expiresAt))
        throw new JourneyBoundaryError(401, "unauthenticated");
    return parsed.data;
}
function tokenHash(token) { return createHash("sha256").update(token, "utf8").digest("hex"); }
/** Dispatch only allowlisted operations to the existing service, preserving its parser, transactions and errors. */
function dispatch(service, req, res, next, path, token) {
    const oldUrl = req.url;
    const oldAuthorization = req.headers.authorization;
    const oldContributor = req.contributor;
    req.url = path;
    if (token)
        req.headers.authorization = `Bearer ${token}`;
    else
        delete req.headers.authorization;
    const restore = () => {
        req.url = oldUrl;
        if (oldAuthorization == null)
            delete req.headers.authorization;
        else
            req.headers.authorization = oldAuthorization;
        delete req.bearerToken;
        delete req.grant;
        if (oldContributor == null)
            delete req.contributor;
        else
            req.contributor = oldContributor;
    };
    res.once("finish", restore);
    res.once("close", restore);
    service(req, res, error => { restore(); next(error); });
}
function id(raw) {
    const parsed = opaqueId.safeParse(raw);
    if (!parsed.success)
        throw new JourneyBoundaryError(400, "invalid_input");
    return parsed.data;
}
export function createJourneyApp(options) {
    const { config, services } = options;
    const ports = options.ports ?? {};
    const clock = options.clock ?? Date.now;
    const modules = options.modules ?? [];
    if (config.mode !== "disabled" && (!services || !config.storage || services.earnedWork.store.kind !== "postgres" ||
        services.correspondence.store.kind !== "postgres" || services.earnedWork.config.pgSchema !== config.storage.earnedWorkSchema ||
        services.correspondence.config.pgSchema !== config.storage.correspondenceSchema))
        throw new Error("real isolated postgres services are required for staging");
    const seen = new Set();
    for (const module of modules) {
        if (!MODULE_IDS.includes(module.id) || seen.has(module.id) || !/^[0-9a-f]{40}$/.test(module.sourceCommit) ||
            !["installed", "fixture_only"].includes(module.evidence))
            throw new Error("invalid or duplicate journey module");
        seen.add(module.id);
    }
    const app = express();
    app.disable("x-powered-by");
    app.set("trust proxy", config.trustProxyHops);
    app.use((req, res, next) => {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Robots-Tag", "noindex, nofollow");
        res.setHeader("Vary", "Origin");
        const origin = req.header("origin");
        const allowed = origin && config.corsOrigins.includes(origin);
        if (allowed) {
            res.setHeader("Access-Control-Allow-Origin", origin);
            res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key");
            res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
        }
        if (req.method === "OPTIONS") {
            res.status(allowed ? 204 : 403).end();
            return;
        }
        // Browser session mutations must originate at an approved preview origin.
        if (origin && !allowed) {
            res.status(403).json({ error: { code: "origin_refused" } });
            return;
        }
        next();
    });
    const requireAccount = (req) => resolveAuthenticatedAccount(req, ports, clock());
    const status = async () => {
        let ready = config.mode !== "disabled" && services != null;
        if (ready) {
            const checks = await Promise.allSettled([
                services.earnedWork.store.checkReady(), services.correspondence.store.checkReady(),
                ...modules.map(module => module.checkReady()),
            ]);
            ready = checks.every(check => check.status === "fulfilled");
        }
        return {
            schema: "neomorphic.contributor-journey.status.v1", mode: config.mode, ready,
            wholeJourney: "integration_pending", releaseAccepted: false, publicEnabled: config.mode === 'live' && config.installed?.publicReads === true,
            settlement: config.mode === 'live' ? 'not_configured' : "synthetic_only",
            storageProfile: config.mode === 'disabled' ? 'not_configured' : config.mode === 'live' ? (ready ? 'durable_enrolled' : 'not_configured') : 'synthetic_staging',
            modules: MODULE_IDS.map(moduleId => {
                const installed = modules.find(module => module.id === moduleId);
                return { id: moduleId, state: installed?.evidence ?? "integration_pending", sourceCommit: installed?.sourceCommit ?? null };
            }),
        };
    };
    app.get("/healthz", async (_req, res) => {
        try {
            const value = await status();
            res.status(config.mode !== "disabled" && !value.ready ? 503 : 200).json(value);
        }
        catch {
            res.status(503).json({ ready: false, publicEnabled: false, error: { code: "unavailable" } });
        }
    });
    app.get("/v1/status", async (_req, res, next) => { try {
        res.json(await status());
    }
    catch (error) {
        next(error);
    } });
    app.use((_req, _res, next) => {
        if (config.mode === "disabled")
            next(new JourneyBoundaryError(503, "disabled"));
        else
            next();
    });
    if (options.middleware)
        app.use(options.middleware);
    // Bounded requests before a leaf can install a broader parser.
    app.use(express.json({ limit: config.bodyLimitBytes, type: "application/json" }));
    const buckets = new Map();
    app.use((req, _res, next) => {
        const now = clock();
        for (const [key, bucket] of buckets)
            if (bucket.until <= now)
                buckets.delete(key);
        const key = req.ip ?? "unknown";
        let bucket = buckets.get(key);
        if (!bucket) {
            if (buckets.size >= 10000) {
                next(new JourneyBoundaryError(429, "rate_limited"));
                return;
            }
            bucket = { count: 0, until: now + config.rateLimitWindowMs };
            buckets.set(key, bucket);
        }
        if (++bucket.count > config.rateLimitMax)
            next(new JourneyBoundaryError(429, "rate_limited"));
        else
            next();
    });
    if (options.extra)
        app.use(options.extra);
    app.get("/v1/session", async (req, res, next) => {
        try {
            res.json({ account: await requireAccount(req) });
        }
        catch (error) {
            next(error);
        }
    });
    async function stagingTask(taskId) {
        const task = await services.earnedWork.store.getTask(taskId);
        if (!task || task.task.provenance === "production")
            throw new JourneyBoundaryError(404, "not_found");
        return task;
    }
    async function contributor(req, taskId) {
        const account = await requireAccount(req);
        if (!ports.resolveEarnedWorkBinding)
            throw new JourneyBoundaryError(503, "integration_pending");
        const binding = unwrapPort(await ports.resolveEarnedWorkBinding(account));
        if (binding.accountId !== account.accountId || !opaqueId.safeParse(binding.principalId).success ||
            typeof binding.token !== "string" || binding.token.length < 8 || binding.token.length > 512)
            throw new JourneyBoundaryError(403, "invalid_principal_binding");
        const principal = await services.earnedWork.store.findContributorByTokenHash(tokenHash(binding.token));
        if (!principal || principal.id !== binding.principalId || principal.provenance === "production" ||
            (principal.taskScope != null && principal.taskScope !== taskId))
            throw new JourneyBoundaryError(403, "invalid_principal_binding");
        return { account, binding, principal };
    }
    const core = express.Router();
    core.get("/tasks", async (_req, res, next) => {
        try {
            res.json({ tasks: (await services.earnedWork.store.listOpenTasks()).filter(task => task.provenance !== "production") });
        }
        catch (error) {
            next(error);
        }
    });
    core.get("/tasks/:taskId/terms/:termsVersion", async (req, res, next) => {
        try {
            const taskId = id(req.params.taskId);
            await stagingTask(taskId);
            dispatch(services.earnedWork.app, req, res, next, `/v1/tasks/${taskId}/terms/${encodeURIComponent(String(req.params.termsVersion))}`);
        }
        catch (error) {
            next(error);
        }
    });
    core.get("/tasks/:taskId/readback", async (req, res, next) => {
        try {
            const taskId = id(req.params.taskId);
            await stagingTask(taskId);
            const { account, principal } = await contributor(req, taskId);
            const work = await services.earnedWork.readContributorWork(taskId, principal.id);
            if (!work)
                throw new JourneyBoundaryError(404, "not_found");
            res.json({ accountId: account.accountId, work, paid: false });
        }
        catch (error) {
            next(error);
        }
    });
    core.get("/tasks/:taskId/obligation", async (req, res, next) => {
        try {
            const taskId = id(req.params.taskId);
            await stagingTask(taskId);
            const { binding } = await contributor(req, taskId);
            dispatch(services.earnedWork.app, req, res, next, `/v1/tasks/${taskId}/contributor-obligation`, binding.token);
        }
        catch (error) {
            next(error);
        }
    });
    for (const operation of ["claims", "submissions"]) {
        core.post(`/tasks/:taskId/${operation}`, async (req, res, next) => {
            try {
                const taskId = id(req.params.taskId);
                await stagingTask(taskId);
                const { binding } = await contributor(req, taskId);
                dispatch(services.earnedWork.app, req, res, next, `/v1/tasks/${taskId}/${operation}`, binding.token);
            }
            catch (error) {
                next(error);
            }
        });
    }
    for (const operation of ["readback", "verdicts", "accept", "reject"]) {
        const handle = async (req, res, next) => {
            try {
                const taskId = id(req.params.taskId);
                await stagingTask(taskId);
                const account = await requireAccount(req);
                if (!ports.authorizeRequester)
                    throw new JourneyBoundaryError(503, "integration_pending");
                const authority = unwrapPort(await ports.authorizeRequester(account, taskId));
                if (authority.accountId !== account.accountId || authority.taskId !== taskId ||
                    !opaqueId.safeParse(authority.requesterId).success)
                    throw new JourneyBoundaryError(403, "invalid_requester_binding");
                if (operation === "verdicts" || operation === "accept") {
                    // Existing kernel allows omitted selectors; the composed journey requires exact source binding.
                    id(req.body?.reservationId);
                    if (!/^[0-9a-f]{64}$/i.test(req.body?.artifactDigestSha256 ?? ""))
                        throw new JourneyBoundaryError(400, "exact_artifact_required");
                    if (operation === "accept")
                        id(req.body?.verdictId);
                }
                dispatch(services.earnedWork.app, req, res, next, `/v1/tasks/${taskId}${operation === "readback" ? "" : `/${operation}`}`, services.earnedWork.config.ownerToken);
            }
            catch (error) {
                next(error);
            }
        };
        if (operation === "readback")
            core.get("/requester/tasks/:taskId/readback", handle);
        else
            core.post(`/requester/tasks/:taskId/${operation}`, handle);
    }
    for (const method of ["get", "post"]) {
        core[method]("/tasks/:taskId/correspondence", async (req, res, next) => {
            try {
                const taskId = id(req.params.taskId);
                await stagingTask(taskId);
                const account = await requireAccount(req);
                if (!ports.resolveCorrespondenceBinding)
                    throw new JourneyBoundaryError(503, "integration_pending");
                const binding = unwrapPort(await ports.resolveCorrespondenceBinding(account, taskId, method === "get" ? "read" : "write"));
                if (binding.accountId !== account.accountId || binding.taskId !== taskId || !opaqueId.safeParse(binding.projectId).success ||
                    typeof binding.token !== "string" || binding.token.length > 512)
                    throw new JourneyBoundaryError(403, "invalid_project_binding");
                const grant = await services.correspondence.store.findActiveGrantByTokenHash(tokenHash(binding.token));
                if (!grant || grant.projectId !== binding.projectId || (method === "post" && grant.role === "reader"))
                    throw new JourneyBoundaryError(403, "invalid_project_binding");
                const query = method === "get" && req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
                dispatch(services.correspondence.app, req, res, next, `/v1/projects/${binding.projectId}/events${query}`, binding.token);
            }
            catch (error) {
                next(error);
            }
        });
    }
    // The foundation's fixture-supplied ports are not live authority. Installed
    // opportunity adapters exclusively own live tasks, identities and original IOUs.
    if (config.mode === 'staging')
        app.use("/v1/core", core);
    for (const moduleId of MODULE_IDS) {
        const module = modules.find(value => value.id === moduleId);
        if (module && config.mode !== "disabled")
            app.use(`/v1/${moduleId}`, module.createRouter({ services: services, requireAccount }));
        else
            app.use(`/v1/${moduleId}`, (_req, _res, next) => next(new JourneyBoundaryError(503, "integration_pending")));
    }
    app.use((_req, _res, next) => next(new JourneyBoundaryError(404, "not_found")));
    app.use((error, _req, res, _next) => {
        if (res.headersSent) {
            res.end();
            return;
        }
        if (error instanceof JourneyBoundaryError) {
            res.status(error.status).json({ error: { code: error.code } });
            return;
        }
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: { code: 'invalid_input' } });
            return;
        }
        if (error && typeof error === "object" && "type" in error && error.type === "entity.too.large") {
            res.status(413).json({ error: { code: "payload_too_large" } });
            return;
        }
        if (error instanceof SyntaxError) {
            res.status(400).json({ error: { code: "invalid_json" } });
            return;
        }
        // Do not serialize a port/driver error, credential, request body or SQL.
        res.status(503).json({ error: { code: "unavailable" }, readback: "unknown" });
    });
    return app;
}
//# sourceMappingURL=app.js.map