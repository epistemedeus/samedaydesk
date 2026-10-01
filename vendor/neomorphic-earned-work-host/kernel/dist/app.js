import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { allowCorsOrigin, assertOwner } from "./config.js";
import { hashRequest, hashToken, issueToken } from "./crypto.js";
import { ApiError, errorBody } from "./errors.js";
import { createRateLimiter, readBearer, requireContributor } from "./auth.js";
import { ownerTask, publicTask } from "./redaction.js";
import { DEFAULT_CLAIM_TTL_SECONDS, DEFAULT_CORRECTION_MAX_REVISIONS, DEFAULT_MAX_ARTIFACT_BYTES, DEFAULT_MEDIA_TYPES, DEFAULT_SLOT_LIMIT, acceptBodySchema, addTermsBodySchema, claimBodySchema, contributorTokenBodySchema, createTaskBodySchema, parseBody, rejectBodySchema, requireIdempotencyKey, reserveFundingBodySchema, submitBodySchema, verdictBodySchema, } from "./validation.js";
import { parseClaimTermsVersion } from "./terms-version.js";
import { withWorkability } from "./work-gate.js";
import { OWNER_VERIFIER_VERSION } from "./verifier.js";
import { createConfiguredVerifier } from "./reproduction-verifier.js";
import { bindReceivedEvidence, decodeEvidenceBase64 } from "./evidence.js";
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const openapi = JSON.parse(readFileSync(path.join(rootDir, "openapi.json"), "utf8"));
function param(value) {
    if (value == null)
        return "";
    return Array.isArray(value) ? value[0] : value;
}
export function createApp(store, config, options = {}) {
    const app = express();
    const rateLimit = createRateLimiter(config);
    const verifier = options.verifier ?? createConfiguredVerifier(config);
    app.disable("x-powered-by");
    app.set("trust proxy", config.trustProxyHops);
    app.use((req, res, next) => {
        res.setHeader("Vary", "Origin");
        const allowed = allowCorsOrigin(req.header("origin"), config.corsOrigins);
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
    app.use((req, _res, next) => {
        try {
            rateLimit(req.ip ?? "anonymous");
            next();
        }
        catch (error) {
            next(error);
        }
    });
    app.use(express.json({ limit: config.bodyLimitBytes, type: ["application/json"] }));
    app.get("/healthz", async (_req, res) => {
        try {
            await store.checkReady();
            res.status(200).json({ ok: true, enabled: true, store: store.kind });
        }
        catch {
            res.status(503).json({ ok: false, enabled: false, store: store.kind, reason: "store_unavailable" });
        }
    });
    app.get("/openapi.json", (_req, res) => {
        res.status(200).json(openapi);
    });
    app.get("/v1/tasks", async (_req, res, next) => {
        try {
            const tasks = await store.listOpenTasks();
            res.status(200).json({ tasks, provenanceNote: "public list is redacted; fixture/test provenance is explicit on each task" });
        }
        catch (error) {
            next(error);
        }
    });
    app.get("/v1/tasks/:taskId", async (req, res, next) => {
        try {
            const taskId = param(req.params.taskId);
            const agg = await store.getTask(taskId);
            if (!agg)
                throw new ApiError(404, "not_found", "task not found");
            const token = readBearer(req);
            if (token) {
                try {
                    assertOwner(token, config);
                    res.status(200).json({ task: withWorkability(ownerTask(agg), agg, store.now()) });
                    return;
                }
                catch (error) {
                    if (!(error instanceof ApiError) || error.status !== 401)
                        throw error;
                }
            }
            res.status(200).json({ task: withWorkability(publicTask(agg, store.now()), agg, store.now()) });
        }
        catch (error) {
            next(error);
        }
    });
    app.get("/v1/tasks/:taskId/terms/:termsVersion", async (req, res, next) => {
        try {
            const taskId = param(req.params.taskId);
            const termsVersion = parseClaimTermsVersion(param(req.params.termsVersion));
            const document = await store.getTermsDocument(taskId, termsVersion);
            if (!document)
                throw new ApiError(404, "not_found", "terms not found");
            res.status(200).json(document);
        }
        catch (error) {
            next(error);
        }
    });
    app.post("/v1/tasks", async (req, res, next) => {
        try {
            assertOwner(readBearer(req), config);
            const body = parseBody(createTaskBodySchema, req.body);
            if (body.budget.asset !== body.reward.asset || body.budget.network !== body.reward.network) {
                throw new ApiError(400, "invalid_input", "budget asset/network must match reward");
            }
            const idempotencyKey = requireIdempotencyKey(req.header("idempotency-key") ?? undefined);
            const terms = body.terms ?? {};
            const result = await store.createTask({
                title: body.title,
                summary: body.summary,
                provenance: body.provenance,
                budget: body.budget,
                terms: {
                    summary: terms.summary ?? body.summary,
                    reward: body.reward,
                    claimTtlSeconds: terms.claimTtlSeconds ?? DEFAULT_CLAIM_TTL_SECONDS,
                    maxArtifactBytes: terms.maxArtifactBytes ?? DEFAULT_MAX_ARTIFACT_BYTES,
                    allowedMediaTypes: terms.allowedMediaTypes ?? [...DEFAULT_MEDIA_TYPES],
                    slotLimit: terms.slotLimit ?? DEFAULT_SLOT_LIMIT,
                },
                correctionMaxRevisions: body.correctionPolicy?.maxRevisions ?? DEFAULT_CORRECTION_MAX_REVISIONS,
                idempotencyKey,
                requestHash: hashRequest(body),
            });
            res.status(result.replayed ? 200 : result.statusCode).json(result.body);
        }
        catch (error) {
            next(error);
        }
    });
    app.post("/v1/tasks/:taskId/terms", async (req, res, next) => {
        try {
            assertOwner(readBearer(req), config);
            const taskId = param(req.params.taskId);
            const body = parseBody(addTermsBodySchema, req.body);
            const idempotencyKey = requireIdempotencyKey(req.header("idempotency-key") ?? undefined);
            const result = await store.addTerms({
                taskId,
                summary: body.summary,
                reward: body.reward,
                claimTtlSeconds: body.claimTtlSeconds ?? DEFAULT_CLAIM_TTL_SECONDS,
                maxArtifactBytes: body.maxArtifactBytes ?? DEFAULT_MAX_ARTIFACT_BYTES,
                allowedMediaTypes: body.allowedMediaTypes ?? [...DEFAULT_MEDIA_TYPES],
                slotLimit: body.slotLimit ?? DEFAULT_SLOT_LIMIT,
                idempotencyKey,
                requestHash: hashRequest(body),
            });
            res.status(result.replayed ? 200 : result.statusCode).json(result.body);
        }
        catch (error) {
            next(error);
        }
    });
    app.post("/v1/tasks/:taskId/funding/reserve", async (req, res, next) => {
        try {
            assertOwner(readBearer(req), config);
            parseBody(reserveFundingBodySchema, req.body ?? {});
            const taskId = param(req.params.taskId);
            const idempotencyKey = requireIdempotencyKey(req.header("idempotency-key") ?? undefined);
            const result = await store.reserveFunding(taskId, idempotencyKey, hashRequest(req.body ?? {}));
            res.status(result.replayed ? 200 : result.statusCode).json(result.body);
        }
        catch (error) {
            next(error);
        }
    });
    app.post("/v1/contributor-tokens", async (req, res, next) => {
        try {
            assertOwner(readBearer(req), config);
            const body = parseBody(contributorTokenBodySchema, req.body);
            const token = issueToken("ew_ctr");
            const created = await store.createContributorToken({
                publicId: body.contributorPublicId,
                payoutDestination: body.payoutDestination ?? null,
                taskScope: body.taskId ?? null,
                provenance: body.provenance,
                tokenHash: hashToken(token),
                expiresAt: body.expiresAt ?? null,
            });
            res.status(201).json({
                token,
                contributorPublicId: created.publicId,
                expiresAt: created.expiresAt,
                provenance: created.provenance,
            });
        }
        catch (error) {
            next(error);
        }
    });
    app.post("/v1/tasks/:taskId/claims", async (req, res, next) => {
        try {
            const contributor = await requireContributor(req, store);
            const taskId = param(req.params.taskId);
            const body = parseBody(claimBodySchema, req.body);
            const termsVersion = parseClaimTermsVersion(body.termsVersion);
            const idempotencyKey = requireIdempotencyKey(req.header("idempotency-key") ?? undefined);
            const result = await store.claim({
                taskId,
                termsVersion,
                contributor,
                idempotencyKey,
                requestHash: hashRequest(body),
            });
            res.status(result.replayed ? 200 : result.statusCode).json(result.body);
        }
        catch (error) {
            next(error);
        }
    });
    app.post("/v1/tasks/:taskId/submissions", async (req, res, next) => {
        try {
            const contributor = await requireContributor(req, store);
            const taskId = param(req.params.taskId);
            const body = parseBody(submitBodySchema, req.body);
            const idempotencyKey = requireIdempotencyKey(req.header("idempotency-key") ?? undefined);
            let evidenceBytes = null;
            if (body.evidenceBase64 != null) {
                evidenceBytes = decodeEvidenceBase64(body.evidenceBase64);
                bindReceivedEvidence(body.artifact, evidenceBytes);
            }
            const result = await store.submit({
                taskId,
                reservationId: body.reservationId,
                contributor,
                artifact: body.artifact,
                evidenceBytes,
                idempotencyKey,
                requestHash: hashRequest(body),
            });
            res.status(result.replayed ? 200 : result.statusCode).json(result.body);
        }
        catch (error) {
            next(error);
        }
    });
    app.post("/v1/tasks/:taskId/verdicts", async (req, res, next) => {
        try {
            assertOwner(readBearer(req), config);
            const taskId = param(req.params.taskId);
            const body = parseBody(verdictBodySchema, req.body);
            const idempotencyKey = requireIdempotencyKey(req.header("idempotency-key") ?? undefined);
            const agg = await store.getTask(taskId);
            if (!agg)
                throw new ApiError(404, "not_found", "task not found");
            if (!agg.reservation || agg.reservation.id !== body.reservationId) {
                throw new ApiError(404, "not_found", "reservation not found");
            }
            if (!agg.submission)
                throw new ApiError(409, "conflict", "reservation has no submission to verify");
            let outcome = body.outcome;
            let verifierVersion = OWNER_VERIFIER_VERSION;
            let reasons = ["owner explicit verdict"];
            if (outcome == null) {
                const hook = verifier({
                    artifact: agg.submission.artifact,
                    terms: agg.terms,
                    taskId,
                    reservationId: body.reservationId,
                    termsVersion: agg.submission.termsVersion,
                    evidenceBytes: agg.submissionEvidenceBytes,
                    contributorPublicId: agg.reservation.contributorPublicId,
                });
                outcome = hook.outcome;
                verifierVersion = hook.verifierVersion;
                reasons = hook.reasons;
            }
            const result = await store.createVerdict({
                taskId,
                reservationId: body.reservationId,
                outcome,
                verifierVersion,
                reasons,
                artifactDigestSha256: body.artifactDigestSha256,
                idempotencyKey,
                requestHash: hashRequest(body),
            });
            res.status(result.replayed ? 200 : result.statusCode).json(result.body);
        }
        catch (error) {
            next(error);
        }
    });
    app.post("/v1/tasks/:taskId/accept", async (req, res, next) => {
        try {
            assertOwner(readBearer(req), config);
            const taskId = param(req.params.taskId);
            const body = parseBody(acceptBodySchema, req.body);
            const idempotencyKey = requireIdempotencyKey(req.header("idempotency-key") ?? undefined);
            const result = await store.accept({
                taskId,
                reservationId: body.reservationId,
                artifactDigestSha256: body.artifactDigestSha256,
                verdictId: body.verdictId,
                idempotencyKey,
                requestHash: hashRequest(body),
            });
            res.status(result.replayed ? 200 : result.statusCode).json(result.body);
        }
        catch (error) {
            next(error);
        }
    });
    app.post("/v1/tasks/:taskId/reject", async (req, res, next) => {
        try {
            assertOwner(readBearer(req), config);
            const taskId = param(req.params.taskId);
            const body = parseBody(rejectBodySchema, req.body);
            const idempotencyKey = requireIdempotencyKey(req.header("idempotency-key") ?? undefined);
            const result = await store.reject({
                taskId,
                reservationId: body.reservationId,
                reason: body.reason,
                idempotencyKey,
                requestHash: hashRequest(body),
            });
            res.status(result.replayed ? 200 : result.statusCode).json(result.body);
        }
        catch (error) {
            next(error);
        }
    });
    app.get("/v1/tasks/:taskId/obligation", async (req, res, next) => {
        try {
            assertOwner(readBearer(req), config);
            const taskId = param(req.params.taskId);
            const obligation = await store.getObligation(taskId);
            if (!obligation)
                throw new ApiError(404, "not_found", "obligation not found");
            res.status(200).json({ obligation });
        }
        catch (error) {
            next(error);
        }
    });
    app.get("/v1/tasks/:taskId/contributor-obligation", async (req, res, next) => {
        try {
            const contributor = await requireContributor(req, store);
            const taskId = param(req.params.taskId);
            try {
                const result = await store.getContributorObligationReadback(taskId, contributor);
                if (result.readback === "owed" && result.obligation) {
                    res.status(200).json({
                        readback: "owed",
                        obligation: result.obligation,
                        paid: false,
                        transfer: null,
                    });
                    return;
                }
                res.status(200).json({
                    readback: "none",
                    obligation: null,
                    paid: false,
                    transfer: null,
                });
            }
            catch (error) {
                if (error instanceof ApiError)
                    throw error;
                res.status(503).json({
                    readback: "unknown",
                    obligation: null,
                    paid: false,
                    transfer: null,
                    error: errorBody(new ApiError(503, "unavailable", "obligation readback unavailable")).error,
                });
            }
        }
        catch (error) {
            next(error);
        }
    });
    app.get("/v1/tasks/:taskId/payout", async (req, res, next) => {
        try {
            assertOwner(readBearer(req), config);
            const taskId = param(req.params.taskId);
            const payout = await store.getPayout(taskId);
            res.status(200).json(payout);
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
        console.error("earned_work_unhandled_error", {
            name: error instanceof Error ? error.name : "unknown",
        });
        res.status(503).json(errorBody(new ApiError(503, "unavailable", "service unavailable")));
    });
    return app;
}
//# sourceMappingURL=app.js.map