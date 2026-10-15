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
  for (const key of changes.keys()) if (!allowed.has(key)) throw new Error('unrelated_environment_change_refused');
  const merged = new Map([...baseline, ...changes]);
  if ((merged.get('MACHINE_GATEWAY_PAYMENTS_ENABLED') || '0') !== '0' ||
      ['MACHINE_GATEWAY_STORE', 'MONITOR_STORE'].some(key => merged.has(key) && merged.get(key) !== 'postgres')) throw new Error('production_adapter_refused');
  for (const key of ['MACHINE_GATEWAY_ENABLED', 'MONITOR_ENABLED', 'MONITOR_SCHEDULER']) {
    if (merged.has(key) && !['0', '1'].includes(merged.get(key))) throw new Error('invalid_machine_flag');
  }
  return { install: payload(merged), rollback: payload(baseline), receipt: {
    schema: 'sds.machine-services.environment-packet.v1', preservesExistingValues: true,
    existingKeys: baseline.size, machineKeys: changes.size, sent: false,
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
