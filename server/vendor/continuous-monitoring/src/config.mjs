import { object, integer, requireThat } from './errors.mjs';
import { targetUrl, assertMountedOrigin } from './policy.mjs';
import { digestJson } from './observation.mjs';

export const LIMITS = Object.freeze({
  free: { monitors: 3, checks: 100, bytes: 8388608, runtimeMs: 300000, events: 50, days: 7,
    tenantChecks: 300, tenantBytes: 25165824, tenantMs: 900000 },
  paid: { monitors: 20, checks: 1000, bytes: 67108864, runtimeMs: 3000000, events: 200, days: 30,
    tenantChecks: 20000, tenantBytes: 1342177280, tenantMs: 60000000 },
});
export function runtimeOptions(input = {}) {
  const options = { mountedOrigin: null, minIntervalMs: 60000, sourceCooldownMs: 60000,
    originCooldownMs: 1000, maxMonitors: 200, leaseSlackMs: 5000, visibilityMs: 30000,
    maxDeliveryAttempts: 8, maxTick: 10, ...input };
  integer(options.maxMonitors, 1, 200, 'invalid_host_monitor_limit');
  integer(options.maxTick, 1, 10, 'invalid_tick_limit');
  integer(options.maxDeliveryAttempts, 1, 8, 'invalid_delivery_attempt_limit');
  integer(options.visibilityMs, 1, 3600000, 'invalid_visibility');
  for (const key of ['minIntervalMs', 'sourceCooldownMs', 'originCooldownMs']) integer(options[key], 1, 7 * 86400000, 'invalid_runtime_cadence');
  integer(options.leaseSlackMs, 1, 30000, 'invalid_lease_slack');
  if (options.mountedOrigin) {
    assertMountedOrigin(options.mountedOrigin);
    requireThat(options.demo === true && process.env.NODE_ENV !== 'production', 'demo_refused_in_production');
  } else {
    requireThat(options.minIntervalMs >= 60000 && options.sourceCooldownMs >= 60000
      && options.originCooldownMs >= 1000 && options.leaseSlackMs >= 5000
      && options.visibilityMs >= 1000, 'unsafe_runtime_cadence');
  }
  return options;
}
export function monitorConfig(input, tenant, now, options) {
  object(input, ['url', 'mode', 'pointers', 'sourceId', 'intervalMs', 'expiresAt', 'budget', 'retentionDays']);
  const limit = LIMITS[tenant.plan];
  const url = targetUrl(input.url, options).href;
  const mode = input.mode || 'http';
  requireThat(['http', 'json', 'observatory'].includes(mode), 'invalid_mode');
  let pointers = null, sourceId = null;
  if (mode === 'json') {
    requireThat(Array.isArray(input.pointers) && input.pointers.length > 0 && input.pointers.length <= 32, 'pointers_required');
    requireThat(input.pointers.every(value => typeof value === 'string' && value.length <= 128 && /^\/(?:[^~]|~[01])*$/.test(value)
      && !/(?:__proto__|constructor|prototype)/.test(value)), 'invalid_pointer');
    pointers = [...new Set(input.pointers)].sort();
  } else requireThat(input.pointers === undefined, 'pointers_only_for_json');
  if (mode === 'observatory') {
    requireThat(['moltjobs', 'x402stats', 'smithery_mcp'].includes(input.sourceId), 'invalid_source_id');
    sourceId = input.sourceId;
  } else requireThat(input.sourceId === undefined, 'source_id_only_for_observatory');
  const intervalMs = integer(input.intervalMs ?? 3600000, options.minIntervalMs, 7 * 86400000, 'invalid_interval');
  const expiresAt = input.expiresAt === undefined ? now + Math.min(limit.days * 86400000, tenant.entitlement_until - now) : Date.parse(input.expiresAt);
  requireThat(Number.isSafeInteger(expiresAt) && expiresAt > now && expiresAt <= now + limit.days * 86400000
    && expiresAt <= tenant.entitlement_until, 'invalid_expiry');
  const budget = input.budget ?? {};
  object(budget, ['maxChecks', 'maxBytes', 'maxRuntimeMs', 'maxEvents', 'timeoutMs', 'maxBodyBytes']);
  const parsed = {
    maxChecks: integer(budget.maxChecks ?? limit.checks, 1, limit.checks),
    maxBytes: integer(budget.maxBytes ?? limit.bytes, 1, limit.bytes),
    maxRuntimeMs: integer(budget.maxRuntimeMs ?? limit.runtimeMs, 1, limit.runtimeMs),
    maxEvents: integer(budget.maxEvents ?? limit.events, 1, limit.events),
    timeoutMs: integer(budget.timeoutMs ?? 5000, 50, 10000),
    maxBodyBytes: integer(budget.maxBodyBytes ?? 65536, 256, 262144),
  };
  requireThat(parsed.maxBytes >= parsed.maxBodyBytes + 65536 && parsed.maxRuntimeMs >= parsed.timeoutMs, 'budget_cannot_reserve_one_check');
  return { url, mode, pointers, sourceId, intervalMs, expiresAt, budget: parsed,
    retentionDays: integer(input.retentionDays ?? 7, 1, limit.days), scopeKey: digestJson({ url, mode, pointers, sourceId }), sourceKey: digestJson({ url }) };
}
