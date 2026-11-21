// Mounted machine projection. Artifact history is immutable; readiness is an
// observation of this process/store, and neither grants tenant authority.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIMITS } from '../../vendor/continuous-monitoring/src/config.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const prefix = '/api/monitor';
const artifactFile = 'server/vendor/continuous-monitoring/machine-manifest.json';
const contractFile = 'server/vendor/continuous-monitoring/openapi.json';
const publicPaths = new Set(['/healthz', '/v1/manifest', '/openapi.json']);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

// Scope the existing canonical source evidence to the monitor's interpreted
// runtime. This is local source consistency, never provider/build qualification.
export function monitorSourceMembers() {
  const files = [artifactFile, contractFile,
    'server/lib/machine-services/mount.mjs', 'server/lib/machine-services/monitor-manifest.mjs',
    'server/lib/machine-services/postgres.mjs', 'server/lib/machine-services/private-config.mjs',
    'server/lib/managed-watch/scheduler.mjs', 'server/foundry/pg-tls.js',
    'server/foundry/private-paths.js', 'server/foundry/private-materialize.js'];
  function walk(name) {
    for (const entry of readdirSync(path.join(root, name), { withFileTypes: true })) {
      const child = name + '/' + entry.name;
      if (entry.isSymbolicLink()) throw new Error('monitor_source_refused');
      if (entry.isDirectory()) walk(child);
      else if (/\.(mjs|js|json)$/.test(entry.name)) files.push(child);
    }
  }
  for (const name of ['server/vendor/continuous-monitoring/src',
    'server/vendor/continuous-monitoring/vendor/change-monitor/src',
    'server/vendor/continuous-monitoring/vendor/change-monitor/vendor']) walk(name);
  return [...new Set(files)].sort();
}
function sourceBytes(name, limit = 1048576) {
  const file = path.join(root, name);
  // Source paths are fixed by the owner, never derived from HTTP paths or pins.
  const parts = path.relative(root, file).split(path.sep);
  let parent = root;
  for (const part of parts) {
    parent = path.join(parent, part);
    if (lstatSync(parent).isSymbolicLink()) throw new Error('monitor_source_refused');
  }
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.size > limit) throw new Error('monitor_source_refused');
  return readFileSync(file);
}
export const isMonitorContractRequest = url => typeof url === 'string' && publicPaths.has(url.split('?')[0]);

let loadedSource;
try { loadedSource = Object.fromEntries(monitorSourceMembers().map(name => [name, sha(sourceBytes(name))])); }
catch { /* missing source is unavailable, not an import-time product outage */ }

export function createMonitorProjection({ sourcePinFile = path.join(root, 'server/foundry/activation/private-control-pin.json'), inspect } = {}) {
  // Bind module-load bytes. Repinning files in a running process cannot qualify
  // different, unloaded code, including when a caller creates another mount.
  const startup = loadedSource;
  function readSource() {
    let artifact = null, artifactBytes;
    try {
      artifactBytes = sourceBytes(artifactFile);
      const value = JSON.parse(artifactBytes);
      if (value?.schema === 'neomorphic.continuous-monitoring.manifest.v1' && value.service === 'continuous-monitoring' &&
          typeof value.version === 'string' && typeof value.deploymentState === 'string') artifact = value;
    } catch { /* explicit unknown provenance below */ }
    const provenance = artifact ? { schema: artifact.schema, version: artifact.version,
      deploymentState: artifact.deploymentState, sha256: sha(artifactBytes) } : null;
    try {
      if (!startup) throw new Error();
      const stat = lstatSync(sourcePinFile);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4194304) throw new Error();
      const pin = JSON.parse(readFileSync(sourcePinFile));
      if (pin.schema !== 'sds.foundry.private-control-source.v1') throw new Error();
      const members = monitorSourceMembers();
      if (members.length !== Object.keys(startup).length) throw new Error();
      let bytes;
      for (const name of members) {
        const content = name === artifactFile ? artifactBytes : sourceBytes(name);
        const actual = sha(content);
        if (actual !== startup[name] || actual !== pin.files?.[name]) throw new Error();
        if (name === contractFile) bytes = content;
      }
      const document = JSON.parse(bytes);
      if (artifact?.service !== 'continuous-monitoring' || document.openapi !== '3.1.0' ||
          document.info?.version !== artifact.version || document.servers?.length !== 1 || document.servers[0].url !== prefix ||
          ![...publicPaths].every(name => document.paths?.[name]?.get?.security?.length === 0) ||
          !document.paths?.['/v1/monitors']?.post ||
          JSON.stringify(document.security) !== '[{"tenantBearer":[]}]' ||
          document.components?.securitySchemes?.tenantBearer?.type !== 'http' ||
          document.components?.securitySchemes?.tenantBearer?.scheme !== 'bearer') throw new Error();
      for (const [name, entry] of Object.entries(document.paths)) {
        for (const method of ['get', 'post', 'patch', 'put', 'delete', 'head', 'options']) {
          if (entry[method]?.security !== undefined && !(publicPaths.has(name) && method === 'get')) throw new Error();
        }
      }
      return { artifact, provenance, bytes, source: { status: 'matched', scope: 'local-monitor-runtime',
        sha256: sha(JSON.stringify(startup)), providerBuildQualified: false } };
    } catch {
      return { artifact, provenance, source: { status: 'unverified', scope: 'local-monitor-runtime', sha256: null, providerBuildQualified: false } };
    }
  }
  return async (req, url) => {
    if (!publicPaths.has(url.pathname)) return null;
    if (req.method !== 'GET') return { status: 405, headers: { allow: 'GET' }, body: { error: 'method_not_allowed' } };
    if (req.url !== url.pathname) return { status: 400, body: { error: 'invalid_query' } };
    const observed = await inspect();
    // Read source evidence after the asynchronous readiness check, so an
    // intervening source change cannot inherit a pre-await matched verdict.
    const current = readSource();
    const available = observed.mounted && observed.configured && observed.storeReady && observed.persistence === 'postgres' && current.source.status === 'matched';
    const runtime = { ...observed, available, observationsAvailable: available && observed.scheduler.enabled,
      state: !observed.configured ? 'disabled' : current.source.status !== 'matched' ? 'source_unverified' : available ? 'ready' : 'unavailable' };
    const status = available ? 200 : 503;
    if (url.pathname === '/healthz') return { status, body: { ok: available, service: 'continuous-monitoring',
      persistence: observed.persistence, scheduler: observed.scheduler, runtime, source: current.source } };
    if (url.pathname === '/openapi.json') return available
      ? { status, contentType: 'application/openapi+json; charset=utf-8', body: current.bytes }
      : { status, body: { error: 'monitor_contract_unavailable' } };
    const artifact = current.artifact;
    // Do not spread unresolved artifact docs, demo commands or historical
    // deployment labels into the effective mounted contract.
    return { status, body: {
      schema: 'sds.continuous-monitoring.mounted-manifest.v1', service: 'continuous-monitoring', version: artifact?.version ?? null,
      artifact: current.provenance,
      runtime, source: current.source, basePath: prefix + '/v1',
      authentication: artifact?.authentication ?? 'operator-provisioned tenant bearer credential',
      access: { provisioning: 'operator', anonymous: ['health', 'manifest', 'openapi'],
        tenantCredentialRequired: true, readerWrites: false, entitlement: 'not-evaluated', capacity: 'not-guaranteed',
        freeLifetimeMonitors: LIMITS.free.monitors, freeCapacityRenews: false },
      methods: artifact?.methods ?? [], delivery: artifact?.delivery ?? null,
      subscription: { activation: 'operator-provisioned entitlement with subscription reference and finite expiry',
        checkout: null, automaticCharge: false, price: null },
      limits: artifact?.limits ?? null,
      worker: 'bounded tick in existing SDS scheduler', publicDemo: null, freePath: null,
      openapi: available ? prefix + '/openapi.json' : null,
      contract: available ? { url: prefix + '/openapi.json', sha256: sha(current.bytes), bytes: current.bytes.length,
        contentType: 'application/openapi+json' } : null,
      documentation: available ? [prefix + '/openapi.json'] : [],
      notImplemented: artifact?.notImplemented ?? [],
    } };
  };
}
