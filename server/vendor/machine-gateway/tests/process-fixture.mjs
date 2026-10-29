// Owned disposable child process. This file is excluded from the runtime pack.
import { appendFileSync } from "node:fs";
import { SqliteStore, RouteRegistry, MachineGateway, builtinRoutes, createGatewayServer } from "../src/index.mjs";
import { echoRoute, tenantConfig, unsignedPaymentAdapter, requirements } from "./helpers.mjs";

const log = line => appendFileSync(process.env.GATEWAY_TEST_LOG, `${line}\n`, { mode: 0o600 });
const adapter = unsignedPaymentAdapter({
  verify: () => log("verify"),
  settle: () => { log("settle"); return process.env.GATEWAY_TEST_HANG === "1" ? new Promise(() => {}) : undefined; },
});
const routes = [...builtinRoutes(), echoRoute(), echoRoute({ id: "fixture.paid", price: { amount: 5, unit: "usd-micros" },
  paymentRequirements: requirements, timeoutMs: 1200, run: input => { log("provider"); return input; } })];
const store = new SqliteStore(process.env.GATEWAY_TEST_FILE);
const gateway = new MachineGateway({ store, registry: new RouteRegistry(routes), tenants: tenantConfig(routes.map(r => r.id)),
  paymentAdapter: adapter, paymentsEnabled: true, environment: "test" });
const server = createGatewayServer(gateway);
server.listen(0, "127.0.0.1", () => console.log(JSON.stringify({ event: "listening", port: server.address().port })));
process.on("SIGTERM", () => { server.close(() => store.close()); server.closeIdleConnections(); });
