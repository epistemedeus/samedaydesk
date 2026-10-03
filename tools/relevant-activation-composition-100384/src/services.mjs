/** SPDX-License-Identifier: MIT. Reuses the acquired EIN transports and catalog. */
import { createApiTransport } from '../vendor/ein-activation-continuation/src/transport.mjs';
import { createContinuationTransport, parseTransportEnv } from '../vendor/ein-activation-continuation/src/adapters.mjs';
import { describeDiscovery, resolveLinkOrigin, selectRoutes, surfacePath, termsFingerprint } from '../vendor/ein-activation-continuation/src/catalog.mjs';
import { fail } from './budget.mjs';

export const SDS_ORIGIN = 'https://samedaydesk.com';
export const SDS_ROUTE = '/api/public-readiness/supplied-row';

export function originFor(value, fallback, env) {
  const url = new URL(value || fallback);
  const qa = env.EIN_CONTINUATION_LANE === 'disposable_owner_qa' && url.protocol === 'http:' && url.hostname === '127.0.0.1';
  if (url.origin !== (value || fallback) || url.username || url.password
      || (!qa && url.origin !== fallback)) throw fail('origin_refused');
  return url.origin;
}

export async function readiness(task, env, scope, fetchImpl) {
  const origin = originFor(env.SDS_ACTIVATION_BASE_URL, SDS_ORIGIN, env);
  const transport = await createApiTransport({ apiOrigin: origin, fetch: scope.fetch(fetchImpl), maxResponseBytes: scope.maxBytes, timeoutMs: Math.max(50, scope.remaining()) });
  const catalog = (await transport.request('GET', '/discovery/task-readiness.json')).payload;
  if (catalog?.schema !== 'samedaydesk.acquisition-discovery.v1' || catalog.packageId !== 'task-readiness'
      || catalog.paid !== false || catalog.privateGitRequired !== false) throw fail('readiness_catalog_mismatch');
  const health = (await transport.request('GET', '/api/public-readiness/healthz')).payload;
  if (health.enabled !== true || health.checker?.commit !== catalog.pins?.s14?.commit) throw fail('readiness_unavailable');
  const result = (await transport.request('POST', SDS_ROUTE, { body: task.readiness, success: [200] })).payload;
  if (result.schema !== 'samedaydesk.public-readiness.supplied-row.v1' || result.visitorSupplied !== true
      || result.network?.fetched !== false || result.versions?.commit !== health.checker.commit) throw fail('readiness_contract_mismatch');
  return { result, nextAction: result.nextAction.executable || { kind: 'inspect_readiness_finding', checked: result.checked, observation: result.observation }, source: { origin, method: 'POST', path: SDS_ROUTE }, purchaseRequired: false };
}

export async function discoverEIN(env, scope, fetchImpl) {
  const origin = originFor(env.EIN_ACTIVATION_BASE_URL, 'https://ein.llc', env);
  const selection = parseTransportEnv(env);
  const transport = await createContinuationTransport({ apiOrigin: origin, fetch: scope.fetch(fetchImpl), timeoutMs: Math.max(50, scope.remaining()), maxResponseBytes: scope.maxBytes, ...selection });
  const catalog = (await transport.readCatalog()).payload;
  const linkOrigin = resolveLinkOrigin(catalog, origin);
  const path = surfacePath(catalog.machineEntry?.surfaces?.openapi, [origin, linkOrigin]);
  const openapi = (await transport.readOpenApi(path)).payload;
  const selected = selectRoutes(catalog, openapi);
  const fingerprint = termsFingerprint(catalog);
  return {
    discovery: describeDiscovery({ catalog, apiOrigin: origin, linkOrigin, fingerprint, ...selected }),
    fingerprint, origin, transport: selection.transport, catalogTransport: selection.catalogTransport,
  };
}
