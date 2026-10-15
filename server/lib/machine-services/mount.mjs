import { readPrivateJson } from '../../vendor/machine-gateway/src/config.mjs';
import { validate } from '../../vendor/machine-gateway/src/schemas.mjs';
import { MachineGateway } from '../../vendor/machine-gateway/src/gateway.mjs';
import { RouteRegistry } from '../../vendor/machine-gateway/src/registry.mjs';
import { builtinRoutes } from '../../vendor/machine-gateway/src/providers.mjs';
import { createHttpHandler } from '../../vendor/machine-gateway/src/http.mjs';
import { bindUrlExtractService, unbindUrlExtractService } from '../../vendor/machine-gateway/src/url-extract-routes.mjs';
import { extractionBindingConfigured, openExtractionService } from './extraction.mjs';
import { PostgresGatewayStore } from '../../vendor/machine-gateway/src/store-pg.mjs';
import { PostgresMonitorStore } from '../../vendor/continuous-monitoring/src/store-pg.mjs';
import { createApiHandler } from '../../vendor/continuous-monitoring/src/api.mjs';
import { tick } from '../../vendor/continuous-monitoring/src/worker.mjs';
import { runtimeOptions } from '../../vendor/continuous-monitoring/src/config.mjs';
import { armScheduler } from '../managed-watch/scheduler.mjs';
import { PgPort, installedDatabaseUrl } from './postgres.mjs';
import { prepareMachineConfig } from './private-config.mjs';

const flag = (env, key) => {
  if (env[key] !== undefined && !['0', '1'].includes(env[key])) throw new Error('invalid_machine_flag');
  return env[key] === '1';
};

// AE21 U2 (J-C): the N2 standalone runtime.example.json shape is accepted.
// Mapping: `database` (standalone SQLite path) -> the enrolled Postgres
// pilot_monitor schema; `host`/`port` (standalone listener) -> the SDS listener
// mount /api/monitor. Those three are type-checked and otherwise ignored;
// they never select storage or open a port. Only `options` is applied.
const N2_STANDALONE = { database: value => typeof value === 'string' && value.length > 0 && value.length <= 4096,
  host: value => typeof value === 'string' && value.length > 0 && value.length <= 255,
  port: value => Number.isInteger(value) && value > 0 && value < 65536 };
const MONITOR_TOP = new Set(['options', 'mountedOrigin', 'integrated', 'targetReaders']);
const OPTION_KEYS = [
  'maxTick', 'maxMonitors', 'maxDeliveryAttempts', 'visibilityMs', 'leaseSlackMs',
  'minIntervalMs', 'sourceCooldownMs', 'originCooldownMs',
];
export function monitorOptions(env) {
  const config = env.MONITOR_RUNTIME_FILE ? readPrivateJson(env.MONITOR_RUNTIME_FILE) : {};
  if (!config || typeof config !== 'object' || Array.isArray(config) ||
      Object.entries(config).some(([key, value]) => !MONITOR_TOP.has(key) && !(Object.hasOwn(N2_STANDALONE, key) && N2_STANDALONE[key](value))) ||
      (config.integrated !== undefined && config.integrated !== true && config.integrated !== false) ||
      config.options && Object.keys(config.options).some(key => !OPTION_KEYS.includes(key))) throw new Error('invalid_monitor_runtime');
  return runtimeOptions({
    maxTick: 1,
    ...config.options,
    ...(config.mountedOrigin !== undefined ? { mountedOrigin: config.mountedOrigin } : {}),
    ...(config.integrated !== undefined ? { integrated: config.integrated } : {}),
    ...(config.targetReaders !== undefined ? { targetReaders: config.targetReaders } : {}),
  });
}

export async function openInstalledStore(service, env = process.env) {
  const adapter = env[service === 'gateway' ? 'MACHINE_GATEWAY_STORE' : 'MONITOR_STORE'] || 'postgres';
  const options = service === 'monitor' ? monitorOptions(env) : undefined;
  if (adapter === 'sqlite' && ['test', 'development'].includes(env.NODE_ENV)) {
    if (service === 'gateway') {
      const { SqliteStore } = await import('../../vendor/machine-gateway/src/store.mjs');
      return new SqliteStore(env.MACHINE_GATEWAY_STATE_FILE);
    }
    const { MonitorStore } = await import('../../vendor/continuous-monitoring/src/store.mjs');
    return new MonitorStore(env.MONITOR_STATE_FILE, options);
  }
  if (adapter !== 'postgres') throw new Error('production_postgres_required');
  const port = new PgPort({ service, databaseUrl: installedDatabaseUrl(env) });
  try {
    await port.checkReady(); // serving never migrates or provisions
    return service === 'gateway' ? new PostgresGatewayStore(port) : new PostgresMonitorStore(port, options);
  } catch (error) {
    try { await port.close(); } catch { /* retain the original classification, never a pool diagnostic */ }
    throw error;
  }
}

// Reuse the existing scheduler contract: one timer, finite runDue(), and replan
// after a durable API transition. Include leases so a crashed run wakes for recovery.
export function monitorScheduleService(store, { now = Date.now, signal } = {}) {
  return {
    async nextDueAt() {
      const row = await store.one(`SELECT min(due) due FROM (
        SELECT CASE WHEN m.current_run IS NULL THEN
          CASE WHEN m.next_due<=m.expires_at AND m.next_due<=t.entitlement_until THEN m.next_due
            WHEN m.expires_at<=t.entitlement_until THEN m.expires_at ELSE t.entitlement_until END
          ELSE m.expires_at END due FROM monitors m JOIN tenants t ON t.id=m.tenant_id
          WHERE m.status='active'
        UNION ALL SELECT lease_until due FROM runs WHERE phase IN ('claimed','started')
        UNION ALL SELECT ? due FROM runs WHERE phase='staged'
      ) wake`, now());
      return row?.due ?? null;
    },
    async runDue() {
      const result = await tick(store, { now, signal });
      return { action: 'completed', read: result.completed.length > 0, result };
    },
  };
}

function unavailable(res, service) {
  res.status(503).json({ error: { code: `${service}_unavailable` } });
}

const COMPLETION_REQUEST = /^\/v1\/jobs\/([A-Za-z0-9_-]{1,80})\/completion$/;
const GATEWAY_TENANT = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const SCHEMA_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

function completionOf(state) {
  if (state === 'queued' || state === 'running') return 'pending';
  if (state === 'ready' || state === 'no_fit' || state === 'fit') return 'ready';
  return 'failed';
}

// The vendored route module does not export its tenant join. Keep the same
// `<binding>:<gateway tenant>` scope and the same length ceiling.
async function writeJobCompletion(req, res, gateway, extraction, jobId) {
  let tenant;
  try { tenant = gateway.authenticate(req.headers.authorization); }
  catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 401;
    const code = typeof error?.code === 'string' ? error.code : 'unauthorized';
    res.status(status).json({ error: { code } });
    return;
  }
  const gatewayTenantId = tenant?.id;
  if (!extraction?.service?.pool || typeof extraction.tenantId !== 'string' || !SCHEMA_NAME.test(extraction.schema || '')
      || typeof gatewayTenantId !== 'string' || !GATEWAY_TENANT.test(gatewayTenantId)) {
    res.status(503).json({ error: { code: 'url_extract_unbound' } });
    return;
  }
  const tenantId = `${extraction.tenantId}:${gatewayTenantId}`;
  if (tenantId.length > 81) {
    res.status(400).json({ error: { code: 'invalid_tenant' } });
    return;
  }
  const { rows } = await extraction.service.pool.query(
    `SELECT state, result_digest FROM ${extraction.schema}.extraction_job WHERE job_id = $1 AND tenant_id = $2`,
    [jobId, tenantId],
  );
  const row = rows[0];
  if (!row) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const completion = completionOf(row.state);
  const digest = typeof row.result_digest === 'string' && /^[a-f0-9]{64}$/.test(row.result_digest) ? row.result_digest : null;
  res.status(200).json({
    jobId,
    complete: completion === 'ready' || completion === 'failed',
    completion,
    qualification: null,
    evidence: digest ? { digest } : null,
  });
}

function wrapGateway(handler, gateway, extraction) {
  if (!extraction) return handler;
  return async (req, res) => {
    const match = req.method === 'GET' ? COMPLETION_REQUEST.exec(req.url || '') : null;
    if (!match) return handler(req, res);
    try { await writeJobCompletion(req, res, gateway, extraction, match[1]); }
    catch { if (!res.headersSent) res.status(503).json({ error: { code: 'provider_failed' } }); }
  };
}

// This process is the only extraction worker. A hard kill leaves queued rows
// and running rows whose lease still belongs to the dead process. recover()
// requeues an expired lease; the update requeues a still-live one. pump does
// not block the listener.
function resumeExtraction(extraction) {
  if (!extraction?.service?.recover || !SCHEMA_NAME.test(extraction.schema || '')) return;
  void extraction.service.recover()
    .then(() => extraction.service.pool.query(
      `UPDATE ${extraction.schema}.extraction_job SET state = 'queued', lease_until = NULL, updated_at = now() WHERE state = 'running'`,
    ))
    .then(() => extraction.service.pump({ limit: 8 }))
    .catch(() => {});
}

// U1 execute requires Idempotency-Key /^[A-Za-z0-9_.-]{16,128}$/. The mounted
// caller key is the same charset from 8 characters (url-extract controls use
// `u2-exec-<pid>-<n>`, which is 15 characters for a 5-digit pid). Map a short
// valid key onto one stable 16+ key so replay stays idempotent. Anything else
// is left for the gateway to refuse.
const SHORT_IDEMPOTENCY = /^[A-Za-z0-9_.-]{8,15}$/;
function widenIdempotencyKey(req) {
  const key = req?.headers?.['idempotency-key'];
  if (typeof key !== 'string' || !SHORT_IDEMPOTENCY.test(key)) return;
  req.headers['idempotency-key'] = `sds-idem-${key}`;
}

// Retry connection availability, server recovery/capacity and bounded query/lock
// timeouts only. Config, TLS trust, authentication, missing/foreign schemas and
// unknown programmer errors stay refused until a corrected process is started.
function transientStoreError(error, depth = 0) {
  if (!error || depth > 4) return false;
  if (['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH',
    'EAI_AGAIN', 'ENOTFOUND', '08000', '08001', '08003', '08006', '08007',
    '53000', '53100', '53200', '53300', '53400', '57P01', '57P02', '57P03', '57014', '55P03',
  ].includes(error.code)) return true;
  // pg-pool/pg use uncoded Errors for these particular bounded disconnects.
  if (['Connection terminated unexpectedly', 'Connection ended unexpectedly',
    'Connection terminated due to connection timeout', 'timeout exceeded when trying to connect',
    'Query read timeout', 'Client has encountered a connection error and is not queryable',
  ].includes(error.message)) return true;
  if (error instanceof AggregateError && error.errors.length) {
    return error.errors.every(value => transientStoreError(value, depth + 1));
  }
  return transientStoreError(error.cause, depth + 1);
}
const failure = () => ({ count: 0, retryAt: 0, permanent: false });
function recordFailure(state, retryable) {
  state.permanent = !retryable;
  state.count = Math.min(state.count + 1, 6);
  state.retryAt = Date.now() + Math.min(30000, 1000 * 2 ** (state.count - 1));
}

async function e08AsyncRoutes(env) {
  const file = env.MACHINE_GATEWAY_E08_ASYNC_FILE;
  if (!file) return [];
  const { readFileSync } = await import('node:fs');
  const { pathToFileURL } = await import('node:url');
  const config = JSON.parse(readFileSync(file, 'utf8'));
  if (typeof config.packageRoot !== 'string' || !config.packageRoot.startsWith('/')) throw new Error('invalid_e08_async_binding');
  const { createE08Client } = await import(pathToFileURL(`${config.packageRoot}/src/e08-client.mjs`));
  const { createAsyncProviders } = await import(pathToFileURL(`${config.packageRoot}/adapters/gateway-240200/index.mjs`));
  const { GatewayError } = await import('../../vendor/machine-gateway/src/errors.mjs');
  const ca = readFileSync(config.caFile);
  const urlToken = readFileSync(config.tokenFile, 'utf8').trim();
  const client = createE08Client({
    origin: config.origin, ca, actor: config.actor, mode: 'test',
    extractionOrigin: config.extractionOrigin,
    extractionCa: config.extractionCaFile ? readFileSync(config.extractionCaFile) : ca,
    urlToken, timeoutMs: Number(config.timeoutMs || 20000),
  });
  return createAsyncProviders({ client, allowedJobIds: config.allowedJobIds,
    gatewayError: (code, status) => new GatewayError(code, status),
    timeoutMs: Number(config.timeoutMs || 20000) });
}

export function mountMachineServices(app, options = {}) {
  const env = options.env || process.env;
  const prefix = { gateway: '/api/machine-gateway', monitor: '/api/monitor' };
  let closing = false, scheduler = null, schedulerHandle = null, running = null, arming = null, desired = false;
  let retryTimer = null, closingPromise = null, closeFailed = false;
  let schedulerFailure = failure();
  const abort = new AbortController();
  const states = new Map();
  const owned = new Set(), closed = new WeakMap(), queries = new Set();
  const privateError = service => new Error(`${service}_unavailable`);
  function track(promise) {
    queries.add(promise);
    promise.then(() => queries.delete(promise), () => queries.delete(promise));
    return promise;
  }
  function release(store) {
    if (!closed.has(store)) {
      const promise = Promise.resolve().then(() => store.close())
        .catch(() => { closeFailed = true; }).finally(() => owned.delete(store));
      closed.set(store, promise);
    }
    return closed.get(store);
  }
  function cancelRetry() { if (retryTimer !== null) clearTimeout(retryTimer); retryTimer = null; }
  function recoverLater() {
    const state = states.get('monitor');
    if (closing || !desired || scheduler || arming || state?.permanent || schedulerFailure.permanent) return;
    if (retryTimer !== null) return;
    const delay = Math.max(0, (state?.retryAt || 0) - Date.now(), schedulerFailure.retryAt - Date.now());
    retryTimer = setTimeout(() => { retryTimer = null; arm().catch(() => {}); }, delay);
    retryTimer.unref?.();
  }
  function stopScheduler() { const previous = scheduler; scheduler = null; schedulerHandle = null; previous?.stop(); }
  function schedulerFailed(candidate, error) {
    if (closing || scheduler !== candidate) return;
    stopScheduler();
    recordFailure(schedulerFailure, transientStoreError(error));
    console.error('monitor_scheduler_unavailable');
    recoverLater();
  }
  async function plan(candidate) {
    try { await track(candidate.plan()); }
    catch (error) { schedulerFailed(candidate, error); throw privateError('monitor'); }
  }
  async function ready(service) {
    if (closing) throw new Error('machine_services_closed');
    if (!Object.hasOwn(prefix, service)) throw new Error('machine_service_refused');
    let state = states.get(service);
    if (!state) {
      state = { ...failure(), store: null, handler: null, promise: null };
      states.set(service, state);
    }
    if (state.store) return state;
    if (state.promise) return state.promise;
    if (state.permanent || Date.now() < state.retryAt) throw privateError(service);
    // Defer even synchronous validation until promise is installed: concurrent
    // callers share failure as well as success, and finally cannot relatch it.
    state.promise = Promise.resolve().then(async () => {
      let store, connecting = false;
      try {
        if (closing) throw new Error('machine_services_closed');
        const key = service === 'gateway' ? 'MACHINE_GATEWAY_ENABLED' : 'MONITOR_ENABLED';
        if (!flag(env, key)) throw new Error('machine_service_disabled');
        if (service === 'gateway' && (env.MACHINE_GATEWAY_PAYMENTS_ENABLED || '0') !== '0') throw new Error('payments_must_remain_disabled');
        const activeEnv = prepareMachineConfig(env, { service });
        let gateway;
        if (service === 'gateway') {
          const config = readPrivateJson(activeEnv.MACHINE_GATEWAY_TENANTS_FILE);
          validate('tenantConfig', config);
          const routes = [...builtinRoutes(), ...await e08AsyncRoutes(activeEnv)];
          // Constructor validates duplicate authority/routes before any DB open.
          // This object is private until the actual store is bound below.
          gateway = new MachineGateway({ store: {}, tenants: config.tenants,
            registry: new RouteRegistry(routes), paymentsEnabled: false });
        } else monitorOptions(activeEnv);
        const adapter = activeEnv[service === 'gateway' ? 'MACHINE_GATEWAY_STORE' : 'MONITOR_STORE'] || 'postgres';
        if (adapter === 'postgres') installedDatabaseUrl(activeEnv);
        else if (adapter !== 'sqlite' || !['test', 'development'].includes(activeEnv.NODE_ENV)) throw new Error('production_postgres_required');
        connecting = true;
        store = await openInstalledStore(service, activeEnv);
        owned.add(store);
        if (closing) throw new Error('machine_services_closed');
        let extraction = null;
        if (gateway) {
          // AE21 U2: url.extract.* fail closed (url_extract_unbound) unless the
          // private binding is configured. The extraction pool opens after the
          // gateway store is ready, binds before the handler is published, and
          // closes (and unbinds) with that store.
          if (extractionBindingConfigured(activeEnv)) {
            extraction = await openExtractionService(activeEnv);
            let bound = null;
            const closeStore = store.close.bind(store);
            store.close = async () => {
              unbindUrlExtractService(bound ?? {});
              try { await extraction.close(); } finally { await closeStore(); }
            };
            if (closing) throw new Error('machine_services_closed');
            bound = bindUrlExtractService(extraction);
            resumeExtraction(extraction);
          }
          gateway.store = store;
          state.gateway = gateway;
          state.handler = wrapGateway(createHttpHandler(gateway, { stripPrefix: '' }), gateway, extraction);
        } else {
          state.service = monitorScheduleService(store, { signal: abort.signal });
          state.handler = createApiHandler(store, { basePath: prefix.monitor,
            healthDetails: () => ({ scheduler: schedulerState() }),
            onMutation: async () => {
              // The mutation already committed. Recovery owns planning errors;
              // do not turn its successful durable acknowledgement into a 503.
              try { if (scheduler) await plan(scheduler); else if (desired) await arm(); } catch { /* private bounded recovery */ }
            } });
        }
        state.store = store;
        Object.assign(state, failure());
        return state;
      } catch (error) {
        if (store) await release(store);
        if (!closing) recordFailure(state, connecting && transientStoreError(error));
        throw privateError(service);
      } finally { state.promise = null; recoverLater(); }
    });
    return state.promise;
  }
  async function arm() {
    if (closing) return;
    // Invalid/disabled flags never create a retry owner.
    if (!flag(env, 'MONITOR_SCHEDULER')) return;
    desired = true;
    if (arming) return arming;
    if (scheduler) return schedulerHandle;
    if (schedulerFailure.permanent || Date.now() < schedulerFailure.retryAt) {
      recoverLater(); throw privateError('monitor');
    }
    cancelRetry();
    arming = Promise.resolve().then(async () => {
      const state = await ready('monitor');
      // An API replan can fail while an earlier bounded tick is still running.
      // Its replacement scheduler must never dispatch overlapping work.
      await running?.catch(() => {});
      if (closing) return;
      const candidate = armScheduler({
        async nextDueAt() {
          if (closing || scheduler !== candidate) return null;
          const next = await track(state.service.nextDueAt());
          return closing || scheduler !== candidate ? null : next;
        },
        runDue() {
          if (closing || scheduler !== candidate) return Promise.resolve(null);
          if (!running) running = Promise.resolve().then(() => state.service.runDue())
            .then(outcome => { if (scheduler === candidate && !closing) schedulerFailure = failure(); return outcome; })
            .finally(() => { running = null; });
          return running;
        },
      }, {
        onError: error => schedulerFailed(candidate, error),
        // The shared scheduler awaits its due query. Fence timer installation
        // as well as callback entry if stop/close wins during that await.
        schedule(callback, delay) {
          if (closing || scheduler !== candidate) return null;
          return setTimeout(() => { if (!closing && scheduler === candidate) callback(); }, delay);
        },
      });
      scheduler = candidate;
      schedulerHandle = {
        plan: () => plan(candidate),
        stop() { if (scheduler === candidate) { desired = false; cancelRetry(); stopScheduler(); } },
        get armed() { return candidate.armed; },
        get nextDueAt() { return candidate.nextDueAt; },
      };
      await plan(candidate);
      if (scheduler === candidate && (!candidate.armed || candidate.nextDueAt > Date.now())) schedulerFailure = failure();
      return closing ? undefined : schedulerHandle;
    }).finally(() => { arming = null; recoverLater(); });
    return arming;
  }
  function schedulerState() {
    return { enabled: !!scheduler, armed: !!scheduler?.armed, nextDueAt: scheduler?.nextDueAt ?? null };
  }
  for (const service of ['gateway', 'monitor']) {
    app.use(prefix[service], async (req, res) => {
      try {
        if (service === 'gateway') widenIdempotencyKey(req);
        const state = await ready(service); await state.handler(req, res);
      }
      catch { unavailable(res, service); }
    });
  }
  return {
    ready,
    arm,
    schedulerState,
    close() {
      if (closingPromise) return closingPromise;
      closing = true; desired = false; cancelRetry(); stopScheduler(); abort.abort();
      closingPromise = (async () => {
        await Promise.allSettled([arming, running, ...[...states.values()].map(state => state.promise), ...queries]);
        // This includes an automatic post-tick due query that was pending when
        // shutdown began. No new query/timer can enter after the closing fence.
        await Promise.allSettled([...queries]);
        await Promise.all([...owned].map(release));
        states.clear();
        if (closeFailed) throw new Error('machine_services_close_unavailable');
      })();
      return closingPromise;
    },
  };
}
