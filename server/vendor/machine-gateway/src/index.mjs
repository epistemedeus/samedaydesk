import { loadConfig } from "./config.mjs";
import { SqliteStore } from "./store.mjs";
import { RouteRegistry } from "./registry.mjs";
import { builtinRoutes } from "./providers.mjs";
import { MachineGateway } from "./gateway.mjs";
import { createHttpHandler } from "./http.mjs";

export { SqliteStore, RouteRegistry, MachineGateway, builtinRoutes, createHttpHandler };
export { createGatewayServer } from "./http.mjs";
export { existingFacilitatorAdapter } from "./payments.mjs";

export function gatewayFromEnv({ env = process.env, registry, paymentAdapter } = {}) {
  const config = loadConfig(env);
  if (!config) return null;
  const store = new SqliteStore(config.file);
  try {
    return new MachineGateway({ ...config, store, registry: registry || new RouteRegistry(builtinRoutes()), paymentAdapter });
  } catch (error) { store.close(); throw error; }
}

// Same mount shape as the accepted SDS integrations. Register before the host's
// JSON parser/static fallback. Invalid configuration affects this prefix only.
export function mountMachineGateway(app, options = {}) {
  const prefix = "/api/machine-gateway";
  let current, closed = false;
  const handle = {
    ready() {
      if (closed) throw new Error("gateway closed");
      if (!current) {
        const gateway = gatewayFromEnv(options);
        if (!gateway) throw new Error("gateway unconfigured");
        current = { gateway, handler: createHttpHandler(gateway, { stripPrefix: "" }) };
      }
      return current.gateway;
    },
    close() { closed = true; current?.gateway.store.close(); current = null; },
  };
  app.use(prefix, (req, res) => {
    try { handle.ready(); return current.handler(req, res); }
    catch {
      res.statusCode = 503;
      res.setHeader("content-type", "application/json");
      res.setHeader("cache-control", "no-store");
      res.end(JSON.stringify({ error: { code: "gateway_unavailable" } }));
    }
  });
  return handle;
}
