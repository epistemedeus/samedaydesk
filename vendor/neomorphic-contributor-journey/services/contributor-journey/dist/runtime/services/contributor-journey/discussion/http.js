import express from "express";
const status = {
    disabled: 503, unauthenticated: 401, not_found: 404, forbidden: 403,
    invalid_input: 400, invalid_cursor: 400, conflict: 409, refused: 422,
    unavailable: 503, storage_invalid: 503, thread_capacity: 409,
};
function send(res, result) {
    res.status(result.ok ? 200 : status[result.error.code]).json(result);
}
export function createDiscussionRouter(service, options) {
    const router = express.Router();
    router.use((_req, res, next) => {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Vary", "Cookie, Authorization");
        res.setHeader("X-Content-Type-Options", "nosniff");
        next();
    });
    router.use(express.json({ limit: 24 * 1024, strict: true }));
    async function list(req, res, publicRead) {
        if (Object.keys(req.query).some(k => !["after", "limit"].includes(k))) {
            send(res, { ok: false, error: { code: "invalid_input" } });
            return;
        }
        const credential = publicRead ? null : await options.credential(req);
        if (!publicRead && credential === null) {
            send(res, { ok: false, error: { code: "unauthenticated" } });
            return;
        }
        const limit = req.query.limit === undefined ? undefined :
            typeof req.query.limit === "string" && /^[1-9][0-9]{0,2}$/.test(req.query.limit) ? Number(req.query.limit) : NaN;
        send(res, await service.list(req.params.taskId, credential, { cursor: req.query.after, limit }));
    }
    router.get("/tasks/:taskId", (req, res, next) => { list(req, res, false).catch(next); });
    router.get("/public/:taskId", (req, res, next) => { list(req, res, true).catch(next); });
    router.get("/tasks/:taskId/reports", async (req, res, next) => {
        try {
            if (Object.keys(req.query).some(k => !["after", "limit"].includes(k))) {
                send(res, { ok: false, error: { code: "invalid_input" } });
                return;
            }
            const credential = await options.credential(req);
            if (credential === null) {
                send(res, { ok: false, error: { code: "unauthenticated" } });
                return;
            }
            const limit = req.query.limit === undefined ? undefined : typeof req.query.limit === "string" && /^[1-9][0-9]{0,2}$/.test(req.query.limit) ? Number(req.query.limit) : NaN;
            send(res, await service.reports(req.params.taskId, credential, { cursor: req.query.after, limit }));
        }
        catch (error) {
            next(error);
        }
    });
    router.post("/tasks/:taskId", async (req, res, next) => {
        try {
            if (!req.is("application/json")) {
                send(res, { ok: false, error: { code: "invalid_input" } });
                return;
            }
            if (!await options.authorizeWrite(req)) {
                send(res, { ok: false, error: { code: "forbidden" } });
                return;
            }
            const credential = await options.credential(req);
            if (credential === null) {
                send(res, { ok: false, error: { code: "unauthenticated" } });
                return;
            }
            send(res, await service.write(req.params.taskId, credential, req.header("idempotency-key"), req.body));
        }
        catch (error) {
            next(error);
        }
    });
    router.use((error, _req, res, _next) => {
        const invalid = error instanceof SyntaxError ||
            (error !== null && typeof error === "object" && "type" in error && error.type === "entity.too.large");
        send(res, { ok: false, error: { code: invalid ? "invalid_input" : "unavailable" } });
    });
    return router;
}
//# sourceMappingURL=http.js.map