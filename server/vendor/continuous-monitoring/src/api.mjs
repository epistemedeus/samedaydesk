import http from 'node:http';
import { readFileSync } from 'node:fs';
import { ServiceError, requireThat, object } from './errors.mjs';

const manifest = JSON.parse(readFileSync(new URL('../machine-manifest.json', import.meta.url), 'utf8'));
const uuid = /^[a-f0-9-]{36}$/;
const eventKey = /^[a-f0-9]{64}$/;
async function readBody(req) {
  requireThat(req.headers['content-type']?.split(';')[0] === 'application/json', 'json_required', 415);
  requireThat(!req.headers['content-encoding'], 'encoded_request_refused', 415);
  requireThat(!(Number(req.headers['content-length']) > 8192), 'body_limit', 413);
  const chunks = []; let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    requireThat(length <= 8192, 'body_limit', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ServiceError('invalid_json'); }
}
function queryNumber(url, name, fallback) {
  if (!url.searchParams.has(name)) return fallback;
  const value = url.searchParams.get(name);
  requireThat(/^\d{1,16}$/.test(value), 'invalid_query');
  return Number(value);
}
function write(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(value));
}
export function createApi(store, { now = Date.now } = {}) {
  let inflight = 0;
  const server = http.createServer({ maxHeaderSize: 8192 }, async (req, res) => {
    req.setTimeout(10000, () => req.destroy());
    if (++inflight > 32) { inflight--; return write(res, 503, { error: 'capacity' }); }
    try {
      requireThat(req.url.length <= 2048, 'invalid_route');
      requireThat(!req.headers.origin, 'cross_origin_refused', 403);
      const url = new URL(req.url, 'http://service.local');
      const path = url.pathname;
      if (req.method === 'GET' && path === '/healthz' && !url.search) {
        store.one('SELECT 1'); return write(res, 200, { ok: true, service: 'continuous-monitoring' });
      }
      if (req.method === 'GET' && path === '/v1/manifest' && !url.search) return write(res, 200, manifest);
      requireThat([...url.searchParams.keys()].every(key => ['after', 'limit'].includes(key))
        && [...url.searchParams.keys()].every(key => url.searchParams.getAll(key).length === 1), 'invalid_query');
      const token = /^Bearer ([A-Za-z0-9_-]+)$/.exec(req.headers.authorization ?? '')?.[1];
      const tenant = store.authenticate(token, now());
      if (req.method !== 'GET' || path.endsWith('/deliveries')) requireThat(tenant.role === 'owner', 'read_only_credential', 403);
      if ((req.method === 'POST' && (path === '/v1/monitors' || path.endsWith('/resume'))) || req.method === 'PATCH') {
        requireThat(tenant.entitlement_until > now(), 'entitlement_expired', 403);
      }
      if (req.method !== 'GET') requireThat(!url.search, 'invalid_query');
      const ownerBody = async () => {
        const body = await readBody(req);
        const live = store.authenticate(token, now());
        requireThat(live.id === tenant.id && live.role === 'owner', 'unauthorized', 401);
        return body;
      };
      store.expire(now());
      if (path === '/v1/monitors') {
        if (req.method === 'POST') {
          requireThat(!url.search, 'invalid_query');
          const result = store.create(tenant, await ownerBody(), req.headers['idempotency-key'], now());
          return write(res, result.replay ? 200 : 201, result);
        }
        if (req.method === 'GET') {
          const limit = queryNumber(url, 'limit', 25);
          requireThat(limit >= 1 && limit <= 50 && !url.searchParams.has('after'), 'invalid_query');
          return write(res, 200, { monitors: store.all('SELECT * FROM monitors WHERE tenant_id=? ORDER BY created_at DESC,id LIMIT ?', tenant.id, limit).map(row => store.publicMonitor(row)) });
        }
      }
      const match = /^\/v1\/monitors\/([^/]+)(?:\/(.*))?$/.exec(path);
      requireThat(match && uuid.test(match[1]), 'not_found', 404);
      const id = match[1], resource = match[2] ?? '';
      const monitor = store.owned(tenant.id, id);
      const limit = queryNumber(url, 'limit', resource === 'deliveries' ? 10 : 25), after = queryNumber(url, 'after', 0);
      requireThat(limit >= 1 && limit <= 50, 'invalid_query');
      if (req.method === 'GET' && resource === '') return write(res, 200, { monitor: store.publicMonitor(monitor) });
      if (req.method === 'PATCH' && resource === '') return write(res, 200, { monitor: store.revise(tenant, id, await ownerBody(), now()) });
      if (req.method === 'POST' && ['pause', 'resume', 'cancel'].includes(resource)) {
        object(await ownerBody(), []);
        return write(res, 200, { monitor: store.lifecycle(tenant.id, id, resource, now()) });
      }
      if (req.method === 'GET' && resource === 'events') return write(res, 200, store.listEvents(tenant.id, id, after, limit));
      if (req.method === 'GET' && resource === 'deliveries') return write(res, 200, store.poll(tenant.id, id, now(), limit));
      if (req.method === 'GET' && resource === 'usage') {
        const usage = store.usageFor(monitor);
        usage.retainedPayloadBytes = store.one(`SELECT
          COALESCE((SELECT sum(length(CAST(document AS BLOB))) FROM snapshots WHERE monitor_id=?),0)+
          COALESCE((SELECT sum(length(CAST(document AS BLOB))) FROM events WHERE monitor_id=?),0)+
          COALESCE((SELECT sum(length(CAST(document AS BLOB))) FROM run_outputs WHERE monitor_id=?),0) bytes`, id, id, id).bytes;
        usage.plan = tenant.plan; usage.subscriptionRef = tenant.subscription_ref;
        return write(res, 200, usage);
      }
      if (req.method === 'GET' && resource === 'runs') return write(res, 200, { runs: store.all(`SELECT document FROM run_outputs
        WHERE monitor_id=? ORDER BY created_at DESC,run_id DESC LIMIT ?`, id, limit).map(row => JSON.parse(row.document)) });
      const detail = /^(snapshots|runs|deliveries)\/([^/]+)(?:\/(ack))?$/.exec(resource);
      if (detail && ((detail[1] === 'runs' && uuid.test(detail[2])) || (detail[1] !== 'runs' && eventKey.test(detail[2])))) {
        const [, kind, artifactId, action] = detail;
        if (kind === 'deliveries') {
          if (req.method === 'GET' && !action) return write(res, 200, store.delivery(tenant.id, id, artifactId));
          if (req.method === 'POST' && action === 'ack') {
            const input = await ownerBody(); object(input, ['idempotencyKey']);
            return write(res, 200, store.acknowledge(tenant.id, id, artifactId, input.idempotencyKey, now()));
          }
        }
        if (req.method === 'GET' && !action && ['runs', 'snapshots'].includes(kind)) {
          const row = kind === 'runs' ? store.one('SELECT document FROM run_outputs WHERE monitor_id=? AND run_id=?', id, artifactId)
            : store.one('SELECT document FROM snapshots WHERE monitor_id=? AND evidence_id=?', id, artifactId);
          requireThat(row, 'not_found_or_retained_out', 404);
          return write(res, 200, JSON.parse(row.document));
        }
      }
      throw new ServiceError('not_found', 404);
    } catch (error) {
      // No request logging, raw exceptions, credential echo or upstream response text.
      write(res, error instanceof ServiceError ? error.status : 503, { error: error instanceof ServiceError ? error.code : 'service_unavailable' });
    } finally { inflight--; }
  });
  server.requestTimeout = 10000; server.headersTimeout = 10000; server.keepAliveTimeout = 500;
  server.maxConnections = 64;
  return server;
}
