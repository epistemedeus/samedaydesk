import { Router } from "express";
import { readBearer } from "../auth.js";
import { WorkCellError, UnsupportedWorkCell } from "./contracts.js";
/** Mount on the existing correspondence app AFTER createApp, behind its existing
 * body limit/CORS/rate limiter. No listener, authentication system or admin API. */
export function createWorkCellRouter(store) {
    const router = Router();
    const base = "/v1/projects/:projectId/work-cells";
    const part = (value) => Array.isArray(value) ? value[0] : value;
    const context = (req) => ({ projectId: part(req.params.projectId), token: readBearer(req) ?? "" });
    router.post(base, async (req, res) => {
        const result = await store.mutate(context(req), null, req.body, req.header("idempotency-key") ?? "");
        res.status(result.replayed ? 200 : 201).json(result);
    });
    router.post(`${base}/:cellId/commands`, async (req, res) => {
        const result = await store.mutate(context(req), part(req.params.cellId), req.body, req.header("idempotency-key") ?? "");
        res.status(result.replayed ? 200 : 201).json(result);
    });
    router.get(`${base}/:cellId`, async (req, res) => {
        res.json(await store.get(context(req), part(req.params.cellId)));
    });
    router.get(`${base}/:cellId/receipts`, async (req, res) => {
        res.json(await store.replay(context(req), part(req.params.cellId), req.query.after, req.query.limit === undefined ? 25 : Number(req.query.limit)));
    });
    router.use((error, _req, res, _next) => {
        if (error instanceof UnsupportedWorkCell) {
            res.status(422).json(error.result);
            return;
        }
        const e = error instanceof WorkCellError ? error : new WorkCellError(503, "unavailable", "work-cell request failed or outcome unknown", "retry identical key/body before starting another mutation", 1);
        if (e.retryAfterSeconds)
            res.setHeader("Retry-After", String(e.retryAfterSeconds));
        res.status(e.status).json({ error: { code: e.code, message: e.message,
                nextStep: e.nextStep, ...(e.retryAfterSeconds ? { retryAfterSeconds: e.retryAfterSeconds } : {}) } });
    });
    return router;
}
//# sourceMappingURL=router.js.map