import express from "express";
import { allowCorsOrigin, assertAdmin } from "./config.js";
import { deriveOwnerToken, hashRequest, hashToken, issueToken } from "./crypto.js";
import { ApiError, errorBody } from "./errors.js";
import { createRateLimiter, readBearer, requireGrant, requireProjectAccess, } from "./auth.js";
import { createEventBodySchema, createGrantBodySchema, createProjectBodySchema, parseBody, parseCursor, parseLimit, requireIdempotencyKey, } from "./validation.js";
function param(value) {
    return Array.isArray(value) ? value[0] : value;
}
export function createApp(store, config) {
    const app = express();
    const rateLimit = createRateLimiter(config);
    app.disable("x-powered-by");
    // Explicit reverse-proxy setting: default 0 refuses X-Forwarded-For spoofing.
    // Operators set CORRESPONDENCE_TRUST_PROXY=1 only behind a known TLS terminator.
    app.set("trust proxy", config.trustProxyHops);
    app.use((req, res, next) => {
        res.setHeader("Vary", "Origin");
        const allowed = allowCorsOrigin(req.header("origin"), config.corsOrigins);
        if (allowed) {
            res.setHeader("Access-Control-Allow-Origin", allowed);
            res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key");
            res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
            res.setHeader("Access-Control-Max-Age", "600");
        }
        if (req.method === "OPTIONS") {
            res.status(allowed ? 204 : 403).end();
            return;
        }
        next();
    });
    app.use((req, _res, next) => {
        try {
            // Before authentication, arbitrary bearer strings are not identities.
            // Express's default trust-proxy=false prevents client-supplied IP spoofing.
            rateLimit(req.ip ?? "anonymous");
            next();
        }
        catch (error) {
            next(error);
        }
    });
    app.use(express.json({ limit: config.bodyLimitBytes, type: ["application/json"] }));
    app.get("/healthz", (_req, res) => {
        res.status(200).json({ ok: true, enabled: true, store: store.kind });
    });
    app.post("/v1/projects", async (req, res, next) => {
        try {
            assertAdmin(readBearer(req), config.adminToken);
            const body = parseBody(createProjectBodySchema, req.body);
            const idempotencyKey = requireIdempotencyKey(req.header("idempotency-key") ?? undefined);
            const ownerToken = deriveOwnerToken(config.adminToken, idempotencyKey);
            const result = await store.createProject({
                title: body.title,
                summary: body.summary,
                ownerTokenHash: hashToken(ownerToken),
                ownerTokenPlainForReplay: ownerToken,
                idempotencyKey,
                requestHash: hashRequest(body),
            });
            // Exact authenticated retries reconstruct the token during the 24-hour window.
            res.status(result.replayed ? 200 : result.statusCode).json({
                project: result.project,
                ownerToken: result.ownerToken,
            });
        }
        catch (error) {
            next(error);
        }
    });
    app.get("/v1/projects/:projectId", async (req, res, next) => {
        try {
            const projectId = param(req.params.projectId);
            const grant = await requireGrant(req, store);
            requireProjectAccess(grant, projectId);
            const project = await store.getProject(projectId);
            if (!project)
                throw new ApiError(404, "not_found", "project not found");
            res.status(200).json({ project });
        }
        catch (error) {
            next(error);
        }
    });
    app.post("/v1/projects/:projectId/grants", async (req, res, next) => {
        try {
            const projectId = param(req.params.projectId);
            const grant = await requireGrant(req, store, ["owner"]);
            requireProjectAccess(grant, projectId);
            const body = parseBody(createGrantBodySchema, req.body);
            const token = issueToken(body.role === "reader" ? "neo_rdr" : "neo_wtr");
            const created = await store.createGrant({
                projectId,
                role: body.role,
                tokenHash: hashToken(token),
                expiresAt: body.expiresAt ?? null,
            });
            res.status(201).json({
                grantId: created.grant.id,
                token,
                role: created.grant.role,
                expiresAt: created.grant.expiresAt,
            });
        }
        catch (error) {
            next(error);
        }
    });
    app.delete("/v1/projects/:projectId/grants/:grantId", async (req, res, next) => {
        try {
            const projectId = param(req.params.projectId);
            const grantId = param(req.params.grantId);
            const grant = await requireGrant(req, store, ["owner"]);
            requireProjectAccess(grant, projectId);
            await store.revokeGrant(projectId, grantId);
            res.status(204).send();
        }
        catch (error) {
            next(error);
        }
    });
    app.post("/v1/projects/:projectId/events", async (req, res, next) => {
        try {
            const projectId = param(req.params.projectId);
            const grant = await requireGrant(req, store, ["owner", "writer"]);
            requireProjectAccess(grant, projectId);
            const body = parseBody(createEventBodySchema, req.body);
            if ((body.kind === "resolved" || body.kind === "reopened") && grant.role !== "owner") {
                throw new ApiError(403, "forbidden", "only the owner grant can resolve or reopen");
            }
            const idempotencyKey = requireIdempotencyKey(req.header("idempotency-key") ?? undefined);
            const result = await store.createEvent({
                projectId,
                kind: body.kind,
                text: body.text,
                artifact: body.artifact,
                expectedVersion: body.expectedVersion,
                idempotencyKey,
                requestHash: hashRequest(body),
            });
            res.status(result.replayed ? 200 : 201).json({
                event: result.event,
                project: result.project,
            });
        }
        catch (error) {
            next(error);
        }
    });
    app.get("/v1/projects/:projectId/events", async (req, res, next) => {
        try {
            const projectId = param(req.params.projectId);
            const grant = await requireGrant(req, store);
            requireProjectAccess(grant, projectId);
            const after = parseCursor(req.query.after, projectId);
            const limit = parseLimit(req.query.limit);
            const result = await store.listEvents({
                projectId,
                afterSequence: after,
                limit,
            });
            res.status(200).json(result);
        }
        catch (error) {
            next(error);
        }
    });
    app.use((error, _req, res, _next) => {
        if (error instanceof SyntaxError) {
            res.status(400).json(errorBody(new ApiError(400, "invalid_input", "malformed JSON body")));
            return;
        }
        if (typeof error === "object" &&
            error &&
            "type" in error &&
            error.type === "entity.too.large") {
            res.status(413).json(errorBody(new ApiError(413, "payload_too_large", "request body exceeds 32KiB")));
            return;
        }
        if (error instanceof ApiError) {
            res.status(error.status).json(errorBody(error));
            return;
        }
        console.error("correspondence_unhandled_error", {
            name: error instanceof Error ? error.name : "unknown",
        });
        res.status(503).json(errorBody(new ApiError(503, "unavailable", "service unavailable")));
    });
    return app;
}
//# sourceMappingURL=app.js.map