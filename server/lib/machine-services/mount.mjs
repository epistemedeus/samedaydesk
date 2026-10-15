import { readPrivateJson } from '../../vendor/machine-gateway/src/config.mjs';
import { validate } from '../../vendor/machine-gateway/src/schemas.mjs';
import { MachineGateway } from '../../vendor/machine-gateway/src/gateway.mjs';
import { RouteRegistry } from '../../vendor/machine-gateway/src/registry.mjs';
import { builtinRoutes } from '../../vendor/machine-gateway/src/providers.mjs';
import { createHttpHandler } from '../../vendor/machine-gateway/src/http.mjs';
import { PostgresGatewayStore } from '../../vendor/machine-gateway/src/store-pg.mjs';
import { PostgresMonitorStore } from '../../vendor/continuous-monitoring/src/store-pg.mjs';
import { createApiHandler } from '../../vendor/continuous-monitoring/src/api.mjs';
import { tick } from '../../vendor/continuous-monitoring/src/worker.mjs';
import { armScheduler } from '../managed-watch/scheduler.mjs';
import { PgPort, installedDatabaseUrl } from './postgres.mjs';
import { prepareMachineConfig } from './private-config.mjs';

const flag = (env, key) => {
  if (env[key] !== undefined && !['0', '1'].includes(env[key])) throw new Error('invalid_machine_flag');
  return env[key] === '1';
};

export function monitorOptions(env) {
  const config = env.MONITOR_RUNTIME_FILE ? readPrivateJson(env.MONITOR_RUNTIME_FILE) : {};
  if (Object.keys(config).some(key => key !== 'options') ||
      config.options && Object.keys(config.options).some(key => ![
        'maxTick', 'maxMonitors', 'maxDeliveryAttempts', 'visibilityMs', 'leaseSlackMs',
        'minIntervalMs', 'sourceCooldownMs', 'originCooldownMs',
      ].includes(key))) throw new Error('invalid_monitor_runtime');
  return { maxTick: 1, ...config.options };
}

export async function openInstalledStore(service, env = process.env) {
  const adapter = env[service === 'gateway' ? 'MACHINE_GATEWAY_STORE' : 'MONITOR_STORE'] || 'postgres';
  if (adapter === 'sqlite' && ['test', 'development'].includes(env.NODE_ENV)) {
    if (service === 'gateway') {
      const { SqliteStore } = await import('../../vendor/machine-gateway/src/store.mjs');
      return new SqliteStore(env.MACHINE_GATEWAY_STATE_FILE);
    }
    const { MonitorStore } = await import('../../vendor/continuous-monitoring/src/store.mjs');
    return new MonitorStore(env.MONITOR_STATE_FILE, monitorOptions(env));
  }
  if (adapter !== 'postgres') throw new Error('production_postgres_required');
  const port = new PgPort({ service, databaseUrl: installedDatabaseUrl(env) });
  try {
    await port.checkReady(); // serving never migrates or provisions
    return service === 'gateway' ? new PostgresGatewayStore(port) : new PostgresMonitorStore(port, monitorOptions(env));
  } catch (error) { await port.close(); throw error; }
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

export function mountMachineServices(app, options = {}) {
  const env = options.env || process.env;
  const prefix = { gateway: '/api/machine-gateway', monitor: '/api/monitor' };
  let closing = false, scheduler = null, running = null;
  const abort = new AbortController();
  const states = new Map();
  async function ready(service) {
    if (closing) throw new Error('machine_services_closed');
    let state = states.get(service);
    if (!state) {
      state = { store: null, handler: null, promise: null };
      states.set(service, state);
      state.promise = (async () => {
        const key = service === 'gateway' ? 'MACHINE_GATEWAY_ENABLED' : 'MONITOR_ENABLED';
        if (!flag(env, key)) throw new Error('machine_service_disabled');
        if (service === 'gateway' && (env.MACHINE_GATEWAY_PAYMENTS_ENABLED || '0') !== '0') throw new Error('payments_must_remain_disabled');
        const activeEnv = prepareMachineConfig(env, { service });
        const store = await openInstalledStore(service, activeEnv);
        state.store = store;
        if (closing) throw new Error('machine_services_closed');
        if (service === 'gateway') {
          const config = readPrivateJson(activeEnv.MACHINE_GATEWAY_TENANTS_FILE);
          validate('tenantConfig', config);
          const gateway = new MachineGateway({ store, tenants: config.tenants,
            registry: new RouteRegistry(builtinRoutes()), paymentsEnabled: false });
          state.gateway = gateway;
          state.handler = createHttpHandler(gateway, { stripPrefix: '' });
        } else {
          state.service = monitorScheduleService(store, { signal: abort.signal });
          state.handler = createApiHandler(store, { basePath: prefix.monitor,
            healthDetails: () => ({ scheduler: { enabled: !!scheduler, armed: !!scheduler?.armed, nextDueAt: scheduler?.nextDueAt ?? null } }),
            onMutation: async () => { await scheduler?.plan(); } });
        }
        return state;
      })().catch(async () => {
        await state.store?.close().catch(() => {}); state.store = null;
        throw new Error(`${service}_unavailable`);
      });
    }
    return state.promise;
  }
  for (const service of ['gateway', 'monitor']) {
    app.use(prefix[service], async (req, res) => {
      try { const state = await ready(service); await state.handler(req, res); }
      catch { unavailable(res, service); }
    });
  }
  return {
    ready,
    async arm() {
      if (!flag(env, 'MONITOR_SCHEDULER')) return;
      const state = await ready('monitor');
      if (scheduler || closing) return scheduler;
      const service = { nextDueAt: state.service.nextDueAt, runDue() {
        if (!running) running = state.service.runDue().finally(() => { running = null; });
        return running;
      } };
      scheduler = armScheduler(service, { onError() { console.error('monitor_tick_unavailable'); } });
      await scheduler.plan();
      return scheduler;
    },
    schedulerState: () => ({ enabled: !!scheduler, armed: !!scheduler?.armed, nextDueAt: scheduler?.nextDueAt ?? null }),
    async close() {
      closing = true; scheduler?.stop(); abort.abort();
      await running?.catch(() => {});
      for (const state of states.values()) {
        await state.promise.catch(() => {});
        await state.store?.close();
      }
      states.clear();
    },
  };
}
