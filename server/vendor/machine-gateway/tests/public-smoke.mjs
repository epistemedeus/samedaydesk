// Explicit read-only public HTTP smoke; excluded from npm test and runtime pack.
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { execFile } from "./process-helpers.mjs";
import { SqliteStore, RouteRegistry, MachineGateway, builtinRoutes, createGatewayServer } from "../src/index.mjs";
import { sha256 } from "../src/util.mjs";

if (process.argv[2] !== "--public-read-only") throw new Error("explicit --public-read-only required");
const dir = await mkdtemp(join(tmpdir(), "gateway-public-smoke-"));
const token = randomBytes(32).toString("base64url");
const tokenFile = join(dir, "caller.credential"), stateFile = join(dir, "caller.json"), inputFile = join(dir, "input.json");
const url = "https://neomorphic.io/.well-known/security.txt";
let upstreamCalls = 0, server, store;
const routes = builtinRoutes().map(route => route.id !== "http.capture" ? route : { ...route,
  run: (...args) => { upstreamCalls++; return route.run(...args); } });
const registry = new RouteRegistry(routes);
const start = async port => {
  store = new SqliteStore(join(dir, "machine-gateway.sqlite"));
  const gateway = new MachineGateway({ store, registry, tenants: [{ id: "public-smoke", tokenSha256: sha256(token),
    routes: ["http.capture"], maxUnits: 0, maxCalls: 1, maxConcurrent: 1 }] });
  server = createGatewayServer(gateway); server.listen(port, "127.0.0.1"); await once(server, "listening");
  return server.address().port;
};
const stop = async () => { if (server) { await new Promise(resolve => server.close(resolve)); store.close(); server = null; } };
try {
  await writeFile(tokenFile, `${token}\n`, { mode: 0o600 });
  await writeFile(inputFile, JSON.stringify({ url }), { mode: 0o600 });
  const port = await start(0);
  const common = [fileURLToPath(new URL("../bin/caller.mjs", import.meta.url)), "--base-url", `http://127.0.0.1:${port}/api/machine-gateway`,
    "--token-file", tokenFile, "--state-file", stateFile, "--allow-loopback"];
  const first = await execFile(process.execPath, [...common, "--route", "http.capture", "--input-file", inputFile], { timeout: 20000 });
  const receipt = JSON.parse(first.stdout);
  assert.equal(receipt.status, "completed"); assert.equal(receipt.payment.state, "not_required");
  assert.equal(sha256(Buffer.from(receipt.output.bodyBase64, "base64")), receipt.output.sha256);
  await stop(); await start(port);
  const replay = JSON.parse((await execFile(process.execPath, [...common, "--resume"], { timeout: 20000 })).stdout);
  assert.deepEqual(replay, receipt); assert.equal(upstreamCalls, 1);
  console.log(JSON.stringify({ schema: "neomorphic.machine-gateway.public-smoke.v1", observedAt: new Date().toISOString(),
    scope: "local-mounted-gateway-to-public-free-http", targetUrl: url, upstreamStatus: receipt.output.status,
    bytes: receipt.output.bytes, sha256: receipt.output.sha256, receiptId: receipt.id, restartedReceiptId: replay.id,
    serverRestarted: true, coldCliProcesses: 2, upstreamCalls, paidAdapterCalls: 0,
    paymentState: receipt.payment.state, hostedGatewayVerified: false, liveSettlementVerified: false }));
} finally { await stop(); await rm(dir, { recursive: true, force: true }); }
