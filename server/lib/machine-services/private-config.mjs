import { fileURLToPath } from 'node:url';
import { materializePrivateInputs } from '../../foundry/private-materialize.js';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
// Reuse the host's private-file materializer. These files are configuration,
// regenerated from enrolled values; all durable execution state lives in PG.
export function prepareMachineConfig(env = process.env, { grant = false, service } = {}) {
  const files = [
    ...(service === 'monitor' ? [] : [['MACHINE_GATEWAY_TENANTS_JSON', 'MACHINE_GATEWAY_TENANTS_FILE', 'gateway-tenants.json', 'json'],
      // AE21 U2: optional url.extract binding, same JSON/FILE pairing as tenants.
      ['MACHINE_GATEWAY_URL_EXTRACT_JSON', 'MACHINE_GATEWAY_URL_EXTRACT_FILE', 'gateway-url-extract.json', 'json']]),
    ...(service === 'gateway' ? [] : [['MONITOR_RUNTIME_JSON', 'MONITOR_RUNTIME_FILE', 'monitor-runtime.json', 'json']]),
    ['MACHINE_SERVICES_PGSSL_CA_PEM', 'MACHINE_SERVICES_PGSSL_CA_FILE', 'database-ca.pem', 'pem'],
    ...(grant ? [['MONITOR_GRANT_JSON', 'MONITOR_GRANT_FILE', 'monitor-grant.json', 'json']] : []),
  ];
  const prepared = materializePrivateInputs({ ...env, FOUNDRY_PRIVATE_DIR: env.MACHINE_SERVICES_PRIVATE_DIR }, { repoRoot, files });
  return { ...env, ...prepared.assigned };
}
