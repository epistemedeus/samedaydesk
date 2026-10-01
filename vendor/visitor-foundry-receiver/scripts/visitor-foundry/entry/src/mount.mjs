import { express } from './deps.mjs';
import { readBearer } from '../../../../services/correspondence/dist/auth.js';
import { createApp } from '../../../../services/correspondence/dist/app.js';
import { EntryStore } from './store.mjs';
import { BASE, SCHEMA, EntryError } from './contract.mjs';

function failure(res, error) {
  const e = error instanceof EntryError ? error : new EntryError(503, 'outcome_unknown', 'reconcile_same_attempt');
  res.setHeader('Cache-Control', 'no-store');
  res.status(e.status).json({ schema: SCHEMA, error: { code: e.code, nextAction: e.nextAction } });
}
/** Optional replacement for createApp at the EXISTING correspondence mount.
 * No listener, migrations, host secrets, runtime launch or automatic installation. */
export function createEntryMount({ enabled = false, databaseUrl, schema, correspondence, config, receiver = null, poolMax = 2 }) {
  if (enabled !== true) throw new Error('entry mount requires explicit installation');
  if (schema !== config.pgSchema || correspondence.schema !== schema) throw new Error('entry schema must match correspondence');
  const entry = new EntryStore({ databaseUrl, schema, correspondence, receiver, poolMax });
  const app = express(); app.disable('x-powered-by'); app.set('trust proxy', config.trustProxyHops);
  // Base middleware owns CORS, rate limits and parser. Only visitor grants are
  // excluded from future extension routes; ordinary installed tenants are unaffected.
  // Normalize base-parser/rate-limit refusals on the public entry paths. The
  // underlying service still enforces those limits; no request/proof is echoed.
  app.use((req, res, next) => {
    if (req.path === BASE || req.path.startsWith(`${BASE}/`)) {
      res.setHeader('Cache-Control', 'no-store');
      const json = res.json.bind(res);
      res.json = body => json(body?.error && !body.error.nextAction
        ? { schema: SCHEMA, error: { code: body.error.code,
          nextAction: res.statusCode >= 500 || res.statusCode === 429 ? 'reconcile_same_attempt' : 'restore_exact_attempt' } } : body);
    }
    next();
  });
  const service = createApp(entry.boundedCorrespondence(), config);
  service.use(async (req, res, next) => {
    if (!/^\/v1\/projects\/[^/]+\/(work-cells|foundry)(\/|$)/i.test(req.path)) return next();
    try {
      if(await entry.isVisitorToken(readBearer(req))){
        if(!receiver?.authorizeRequest)return failure(res,new EntryError(403,'entry_scope_excludes_receiver'));
        await receiver.authorizeRequest(req,readBearer(req));
      }
      next();
    } catch (error) { failure(res, error); }
  });
  service.use(BASE, (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  service.get(BASE, async (_req, res) => { try { res.json(await entry.describe()); } catch (e) { failure(res, e); } });
  for (const action of ['register', 'reconcile', 'renew']) service.post(`${BASE}/${action}`, async (req, res) => {
    try {
      const result = await entry.register(req.body, req.header('idempotency-key'), readBearer(req), { renew: action === 'renew' });
      res.status(result.status === 'partial' ? 202 : 200).json(result);
    } catch (e) { failure(res, e); }
  });
  // Explicit opt-out needs neither registration nor a credential, and writes nothing.
  service.post(`${BASE}/decline`, (_req, res) => res.json({ schema: SCHEMA, status: 'declined', nextAction: 'continue_original' }));
  app.use(service);
  return { app, entry, checkReady: () => entry.checkReady(), close: () => entry.close() };
}
