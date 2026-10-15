import express from 'express';
import { MAX_REQUEST_BYTES } from './validation.js';
export const HTTP_STATUS = {
    invalid_input: 400, unauthorized: 401, not_found: 404, forbidden: 403,
    oversize: 413, secret_detected: 422, terms_changed: 409, late_submission: 409,
    revision_conflict: 409, idempotency_conflict: 409, immutable_submission: 409,
    foreign_evidence: 409, storage_invalid: 503, temporarily_unavailable: 503, kernel_refused: 409,
};
/** Session and write authorization come from the account service, never from JSON fields. */
export function createSubmissionRouter(options) {
    const router = express.Router();
    router.use(async (req, res, next) => {
        res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        if (!options.enabled) {
            res.status(404).json({ ok: false, error: { code: 'not_found', message: 'Submissions are not enabled.' } });
            return;
        }
        try {
            const account = await options.resolveAccount(req);
            if (!account) {
                res.status(401).json({ ok: false, error: { code: 'unauthorized', message: 'Sign in to continue.' } });
                return;
            }
            if (req.method !== 'GET' && !await options.authorizeWrite(req, account)) {
                res.status(403).json({ ok: false, error: { code: 'forbidden', message: 'This request is not authorized.' } });
                return;
            }
            res.locals.account = account;
            next();
        }
        catch {
            res.status(503).json({ ok: false, error: { code: 'temporarily_unavailable', message: 'Sign-in status could not be confirmed.' } });
        }
    });
    router.use(express.json({ limit: MAX_REQUEST_BYTES, strict: true }));
    function send(res, result) { res.status(result.ok ? 200 : HTTP_STATUS[result.error.code]).json(result); }
    router.get('/:reservationId', async (req, res) => {
        send(res, await options.service.read(res.locals.account, req.params.reservationId));
    });
    router.post('/:reservationId/draft', async (req, res) => {
        if (req.body?.reservationId !== req.params.reservationId) {
            send(res, { ok: false, error: { code: 'invalid_input', message: 'Draft reservation must match the route.' } });
            return;
        }
        send(res, await options.service.save(res.locals.account, req.body, req.header('idempotency-key')));
    });
    router.post('/:reservationId/submit', async (req, res) => {
        if (req.body?.reservationId !== req.params.reservationId) {
            send(res, { ok: false, error: { code: 'invalid_input', message: 'Delivery reservation must match the route.' } });
            return;
        }
        send(res, await options.service.submit(res.locals.account, req.body));
    });
    router.use((error, _req, res, _next) => {
        const oversize = error.type === 'entity.too.large';
        send(res, { ok: false, error: { code: oversize ? 'oversize' : 'invalid_input', message: oversize ? 'Evidence request exceeds the limit.' : 'Provide a JSON evidence request.' } });
    });
    return router;
}
//# sourceMappingURL=http.js.map