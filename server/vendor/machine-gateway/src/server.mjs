#!/usr/bin/env node
import { gatewayFromEnv, createGatewayServer } from "./index.mjs";

try {
  const gateway = gatewayFromEnv();
  if (!gateway) throw new Error("unconfigured");
  const host = process.env.MACHINE_GATEWAY_LISTEN_HOST || "127.0.0.1";
  const port = Number(process.env.PORT || 8787);
  if (!["127.0.0.1", "0.0.0.0", "::1"].includes(host) || !Number.isInteger(port) || port < 0 || port > 65535) throw new Error("invalid listen address");
  const server = createGatewayServer(gateway);
  server.on("error", () => { console.error("machine_gateway_listener_failed"); gateway.store.close(); process.exitCode = 1; });
  server.listen(port, host, () => {
    process.stdout.write(`${JSON.stringify({ event: "machine_gateway_listening", port: server.address().port, prefix: gateway.prefix })}\n`);
  });
  let closing = false;
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
    if (closing) return;
    closing = true;
    server.close(() => { gateway.store.close(); });
    server.closeIdleConnections();
  });
} catch {
  console.error("machine_gateway_configuration_invalid");
  process.exitCode = 1;
}
