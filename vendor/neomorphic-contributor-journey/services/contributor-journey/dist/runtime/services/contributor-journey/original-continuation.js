import express from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ZodError } from 'zod';
import { readAccountSessionToken } from './account/http.js';
import { createOriginalRouteClient } from './original-continuation/client.js';
import { OriginalContinuationService } from './original-continuation/service.js';
import { ContinuationError } from './original-continuation/types.js';
import { ApiError } from '../earned-work/src/errors.js';
export const ORIGINAL_CONTINUATION_PREFIX = '/api/neomorphic-original-continuation';
export { createOriginalRouteClient, OriginalContinuationService };
export { CONSENT_VERSION, ContinuationError } from './original-continuation/types.js';
/** Explicit integration API. It uses existing account authentication; adoption/FKs/future-round admission are untouched. */
export async function createInstalledOriginalContinuation(runtime, options = {}) {
    const router = express.Router();
    let service = null;
    router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store, private'); res.setHeader('Pragma', 'no-cache'); res.setHeader('X-Robots-Tag', 'noindex, nofollow'); next(); });
    if (options.enabled !== true) {
        router.use((_req, res) => res.status(503).json({ error: { code: 'disabled' } }));
        return { router, service };
    }
    const installed = runtime.installed, settings = runtime.config.installed;
    if (!installed || !settings || !runtime.services || !options.canonicalOrigin || !options.roundKey || !options.provenance ||
        settings.futureRounds.some(pin => pin.roundKey === options.roundKey) || (runtime.config.mode === 'live' && (options.provenance !== 'production' || options.request)))
        throw new ContinuationError('invalid_input', 400);
    const source = createOriginalRouteClient({ origin: options.canonicalOrigin, roundKey: options.roundKey, provenance: options.provenance, request: options.request });
    service = new OriginalContinuationService({ accounts: installed.accounts, database: runtime.services.earnedWork.store,
        source, origin: settings.origin, integrityKey: settings.integrityKey });
    await service.migrate();
    const active = service;
    const token = (req) => readAccountSessionToken(req, true);
    router.use(async (req, res, next) => {
        try {
            if (!req.secure || req.header('host') !== new URL(settings.origin).host || req.header('origin') !== settings.origin || req.header('sec-fetch-site') === 'cross-site')
                throw new ContinuationError('forbidden', 403);
            const actor = await active.authenticate(token(req));
            const expected = createHmac('sha256', settings.integrityKey).update(`${actor.accountId}:${actor.sessionId}`).digest('hex'), provided = req.header('x-cj-csrf') ?? '';
            if (!/^[a-f0-9]{64}$/.test(provided) || !timingSafeEqual(Buffer.from(expected), Buffer.from(provided)))
                throw new ContinuationError('forbidden', 403);
            next();
        }
        catch (error) {
            next(error);
        }
    });
    router.use(express.json({ limit: '32kb', strict: true }));
    const holder = (req) => req.header('x-original-holder-credential');
    const linkId = (req) => String(req.params.linkId ?? '');
    router.post('/v1/links', async (req, res, next) => { try {
        res.json(await active.createLink(token(req), holder(req), req.body, req.header('idempotency-key')));
    }
    catch (error) {
        next(error);
    } });
    router.get('/v1/links/:linkId', async (req, res, next) => { try {
        res.json(await active.read(token(req), holder(req), linkId(req)));
    }
    catch (error) {
        next(error);
    } });
    router.delete('/v1/links/:linkId', async (req, res, next) => { try {
        res.json(await active.revoke(token(req), linkId(req)));
    }
    catch (error) {
        next(error);
    } });
    router.post('/v1/links/:linkId/deliveries', async (req, res, next) => {
        try {
            const result = await active.submit(token(req), holder(req), linkId(req), req.body, req.header('idempotency-key') ?? '');
            res.status(result.state === 'unknown' ? 202 : 200).json(result);
        }
        catch (error) {
            next(error);
        }
    });
    router.get('/v1/links/:linkId/operations/:operationKey', async (req, res, next) => {
        try {
            const result = await active.readOperation(token(req), holder(req), linkId(req), String(req.params.operationKey ?? ''));
            res.status(result.state === 'unknown' ? 202 : 200).json(result);
        }
        catch (error) {
            next(error);
        }
    });
    router.use(((error, _req, res, _next) => {
        const bad = error instanceof ZodError || error instanceof SyntaxError;
        const denied = error instanceof ApiError && [401, 403].includes(error.status);
        const result = error instanceof ContinuationError ? error : new ContinuationError(denied ? (error.status === 401 ? 'unauthorized' : 'forbidden') : bad ? 'invalid_input' : 'unavailable', denied ? error.status : bad ? 400 : 503);
        res.status(result.status).json({ error: { code: result.code } });
    }));
    return { router, service };
}
//# sourceMappingURL=original-continuation.js.map