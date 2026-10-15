import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readPrivateJson, writePrivateJson } from '../../contributor-environment-packet.js';

const allowed = new Set([
  'MACHINE_GATEWAY_ENABLED', 'MACHINE_GATEWAY_PAYMENTS_ENABLED', 'MACHINE_GATEWAY_STORE',
  'MACHINE_GATEWAY_TENANTS_FILE', 'MACHINE_GATEWAY_TENANTS_JSON',
  'MACHINE_GATEWAY_URL_EXTRACT_FILE', 'MACHINE_GATEWAY_URL_EXTRACT_JSON',
  'MONITOR_ENABLED', 'MONITOR_SCHEDULER', 'MONITOR_STORE', 'MONITOR_RUNTIME_FILE', 'MONITOR_RUNTIME_JSON',
  'MACHINE_SERVICES_PRIVATE_DIR', 'MACHINE_SERVICES_DATABASE_URL', 'MACHINE_SERVICES_PGSSL_CA_FILE', 'MACHINE_SERVICES_PGSSL_CA_PEM',
]);
// Additive discovery enrollment on the same preserving overlay. Optional.
// A named key that already exists is refused; these values never replace a baseline row.
const discovery = new Set(['DISCOVERY_LOG_DIR', 'DISCOVERY_LOG_QA_SECRET', 'DISCOVERY_LOG_JOURNEY_SECRET']);
const discoverySecrets = new Set(['DISCOVERY_LOG_QA_SECRET', 'DISCOVERY_LOG_JOURNEY_SECRET']);
const discoveryChild = 'discovery-log-v1';
const absoluteDir = value => path.isAbsolute(value) && !value.split(path.sep).includes('..');
// FOUNDRY_PRIVATE_DIR is a retained baseline key. When it is present, the additive
// log directory is that directory plus discovery-log-v1. The baseline value is not overwritten.
function discoveryDirAllowed(value, baseline) {
  if (!absoluteDir(value)) return false;
  if (!baseline.has('FOUNDRY_PRIVATE_DIR')) return true;
  const root = baseline.get('FOUNDRY_PRIVATE_DIR');
  return absoluteDir(root) && value === path.join(root, discoveryChild);
}
function entries(input) {
  const rows = Array.isArray(input) ? input : input?.env_vars;
  if (!Array.isArray(rows) || rows.length > 512) throw new Error('environment_shape_refused');
  const result = new Map();
  for (const row of rows) {
    if (!/^[A-Z_][A-Z0-9_]{0,127}$/.test(row?.key || '') || typeof row.value !== 'string' ||
        row.value.length > 16384 || row.value.includes('\0') || /^\*{4,}$/.test(row.value) || result.has(row.key)) throw new Error('environment_shape_refused');
    result.set(row.key, row.value);
  }
  return result;
}
const payload = map => ({ env_vars: [...map].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({ key, value })) });

// Hostinger's environment setter replaces the full set. Merge against an
// authoritative private baseline; a masked GET supplies coverage only.
export function prepareMachineEnvironment({ existing, listed, overlay }) {
  const baseline = entries(existing), changes = entries(overlay);
  const list = Array.isArray(listed) ? listed : listed?.data;
  if (!baseline.size || !Array.isArray(list) || list.length !== baseline.size ||
      new Set(list.map(row => row?.key)).size !== baseline.size || list.some(row => !baseline.has(row?.key))) throw new Error('environment_coverage_refused');
  let machineKeyCount = 0, discoveryKeyCount = 0;
  for (const [key, value] of changes) {
    const machine = allowed.has(key);
    if (!machine && !discovery.has(key)) throw new Error('unrelated_environment_change_refused');
    if (baseline.has(key)) throw new Error('existing_environment_key_not_overwritten');
    if (discoverySecrets.has(key) && value.length < 32) throw new Error('discovery_secret_refused');
    if (key === 'DISCOVERY_LOG_DIR' && !discoveryDirAllowed(value, baseline)) throw new Error('discovery_dir_refused');
    if (machine) machineKeyCount += 1; else discoveryKeyCount += 1;
  }
  const merged = new Map([...baseline, ...changes]);
  if ((merged.get('MACHINE_GATEWAY_PAYMENTS_ENABLED') || '0') !== '0' ||
      ['MACHINE_GATEWAY_STORE', 'MONITOR_STORE'].some(key => merged.has(key) && merged.get(key) !== 'postgres')) throw new Error('production_adapter_refused');
  for (const key of ['MACHINE_GATEWAY_ENABLED', 'MONITOR_ENABLED', 'MONITOR_SCHEDULER']) {
    if (merged.has(key) && !['0', '1'].includes(merged.get(key))) throw new Error('invalid_machine_flag');
  }
  return { install: payload(merged), rollback: payload(baseline), receipt: {
    schema: 'sds.machine-services.environment-packet.v1', preservesExistingValues: true,
    existingKeys: baseline.size, machineKeys: machineKeyCount, discoveryKeys: discoveryKeyCount, sent: false,
  } };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [, , baselineFile, listedFile, overlayFile, output] = process.argv;
    const packet = prepareMachineEnvironment({ existing: await readPrivateJson(baselineFile), listed: await readPrivateJson(listedFile), overlay: await readPrivateJson(overlayFile) });
    await writePrivateJson(path.join(output, 'install.json'), packet.install);
    await writePrivateJson(path.join(output, 'rollback.json'), packet.rollback);
    console.log(JSON.stringify(packet.receipt));
  } catch { console.error('machine_environment_packet_refused'); process.exitCode = 1; }
}
