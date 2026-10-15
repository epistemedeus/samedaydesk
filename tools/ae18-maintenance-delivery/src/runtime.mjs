import { lstatSync } from 'node:fs';
import { readJson, requireThat } from './inputs.mjs';
import { prepareInputs, createGatewayRoutes, assertRouteScopes } from './index.mjs';

// Root supplies the current gateway and existing private runtime configuration.
// Mount before the existing host JSON parser; this opens no extra listener.
export async function prepareRuntime(config) {
  const inputs = await prepareInputs(config.inputs);
  const store = new inputs.gateway.SqliteStore(config.stateFile);
  try {
    const { operations, routes } = createGatewayRoutes({ inputs, store, ...config.maintenance });
    requireThat((lstatSync(config.tenantsFile).mode & 0o077) === 0, 'private_tenants_file_required');
    const { tenants } = readJson(config.tenantsFile);
    assertRouteScopes(tenants, operations, config.maintenance.ownerTenant, config.maintenance.reviewTenant);
    requireThat(config.paymentsEnabled === false, 'free_maintenance_runtime_required');
    const registry = new inputs.gateway.RouteRegistry([...inputs.gateway.builtinRoutes(), ...routes]);
    const gateway = new inputs.gateway.MachineGateway({ store, registry, tenants, paymentsEnabled: false });
    return { gateway, operations, handler: inputs.gateway.createHttpHandler(gateway, { stripPrefix: '' }), close: () => store.close() };
  } catch (error) { store.close(); throw error; }
}
export async function mountMaintenance(app, config) {
  const runtime = await prepareRuntime(config);
  app.use('/api/machine-gateway', runtime.handler);
  return runtime;
}
