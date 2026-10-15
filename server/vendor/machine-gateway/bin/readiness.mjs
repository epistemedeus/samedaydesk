#!/usr/bin/env node
import { argumentsFor, baseUrl, request } from "./client-io.mjs";
import { validate } from "../src/schemas.mjs";
try {
  const args = argumentsFor(process.argv.slice(2), ["base-url", "allow-loopback"], ["allow-loopback"]);
  const base = baseUrl(args["base-url"], args["allow-loopback"]);
  const health = validate("health", await request(base, "/healthz"), { response: true });
  const discovery = validate("discovery", await request(base, "/v1/discover"), { response: true });
  const sample = validate("test", await request(base, "/v1/test", { body: { routeId: "lockfile.delta" } }), { response: true });
  if (!health.ready || health.routeCount !== discovery.routes.length || sample.output.counts?.changed !== 1) throw new Error("readiness_failed");
  console.log(JSON.stringify({ runtimeReachable: true, persistence: health.persistence, paymentsEnabled: health.paymentsEnabled,
    testFixture: true, authenticatedExecutionVerified: false, livePaymentVerified: false }));
} catch { console.error("machine_gateway_readiness_failed"); process.exitCode = 1; }
