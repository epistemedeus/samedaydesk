import { Router } from 'express';
/** Mount behind the host's body limit, session auth, CSRF/origin checks and rate
 * limiter. No account/principal/provenance/role is accepted from request data. */
export function createContributorClaimsRouter(service) {
    const router = Router();
    router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    const send = (res, result) => res.status(result.ok ? 200 : result.error.status).json(result);
    router.get('/', async (req, res) => send(res, await service.list(req)));
    router.get('/terms', async (req, res) => send(res, await service.terms(req, req.query)));
    router.get('/claims', async (req, res) => send(res, await service.mine(req)));
    router.get('/claim', async (req, res) => send(res, await service.lookupClaim(req, req.query)));
    router.post('/claims', async (req, res) => send(res, await service.claim(req, req.body, req.get('Idempotency-Key'))));
    router.get('/operations', async (req, res) => send(res, await service.readOperation(req, req.query)));
    router.get('/waitlist', async (req, res) => send(res, await service.waitlist(req, req.query)));
    router.post('/waitlist', async (req, res) => send(res, await service.joinWaitlist(req, req.body, req.get('Idempotency-Key'))));
    return router;
}
//# sourceMappingURL=routes.js.map