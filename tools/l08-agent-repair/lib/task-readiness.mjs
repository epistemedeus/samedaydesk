// Task-specific readiness. One method, one path, one supplied success contract.
// Findings stay in separate slots. The maintained adapter consumes an authorized packet.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import express from "express";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import healthRouter from "../../../server/routes/health.js";
import mcpRouter from "../../../server/routes/mcp.js";
import { PublicHostError, fetchBounded } from "./bounded-fetch.mjs";
import { catalogDocument, catalogText } from "./task-catalog.mjs";
import { S14_PIN, STALE_NEO, acquirePins, resolvePin, repoRoot } from "./pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const coldClient = join(here, "../cold-client.mjs");

export const PRICE_PATTERN = /^\d+(\.\d+)?$/;
export const USEFUL_TARGETS = Object.freeze([
  {
    id: "repair-add-required",
    fixture: "catalog-row-repair-add-required.json",
    source: "action/fixtures/catalog-row-repair-add-required.json",
    absent: false,
  },
  {
    id: "contract-absent",
    fixture: "catalog-row-contract-absent.json",
    source: "action/fixtures/catalog-row-contract-absent.json",
    absent: true,
  },
]);

export function blankClasses() {
  const slot = () => ({ state: "not_observed", code: null });
  return {
    availability: slot(),
    absentSchema: slot(),
    unsupportedEra: slot(),
    absenceOfDemand: slot(),
    security: slot(),
    semantic: slot(),
  };
}

export function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function quoteValue(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;
  if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) return undefined;
  return body.data.quote;
}

export function semanticResult(body) {
  const value = quoteValue(body);
  const ok = typeof value === "string" && PRICE_PATTERN.test(value);
  return {
    state: ok ? "pass" : "fail",
    code: ok ? null : "value_mismatch",
    pointer: "data.quote",
    shape: typeof value === "string" ? "string" : value === undefined ? "absent" : typeof value,
  };
}

export function readFixture(s14Root, name) {
  const path = join(s14Root, "action/fixtures", name);
  const raw = readFileSync(path, "utf8");
  return { raw, row: JSON.parse(raw), sha256: createHash("sha256").update(raw).digest("hex") };
}

export function authorizePacket(observation, fixture) {
  if (observation.semantic?.state !== "pass") {
    return { authorized: false, reason: "semantic_mismatch" };
  }
  if (observation.method !== fixture.row.method || observation.route !== fixture.row.route) {
    return { authorized: false, reason: "route_mismatch" };
  }
  if (!sameJson(observation.requiredPaths, fixture.row.requiredPaths)) {
    return { authorized: false, reason: "paths_mismatch" };
  }
  if (!sameJson(observation.schema, fixture.row.schema)) {
    return { authorized: false, reason: "schema_mismatch" };
  }
  return { authorized: true, reason: null, sha256: fixture.sha256, source: observation.source };
}

export function classifySchema(schema, requiredPaths) {
  if (schema == null) {
    return { state: "fail", code: "seller_response_contract_absent" };
  }
  const required = schema?.properties?.data?.required;
  const missing = requiredPaths.filter((path) => path === "data.quote" && !(Array.isArray(required) && required.includes("quote")));
  if (missing.length) return { state: "fail", code: "seller_response_required_path_missing:data.quote" };
  return { state: "pass", code: null };
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
    if (typeof server.closeAllConnections === "function") server.closeAllConnections();
  });
}

// The fixture listener and this caller share one event loop. spawnSync would
// freeze that loop, so the retest's fetch of the live origin would never return.
function spawnColdArgs(args) {
  return new Promise((resolveSpawn) => {
    const child = spawn(process.execPath, [coldClient, ...args], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      stderr += "retest timed out\n";
      child.kill("SIGKILL");
    }, 40_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolveSpawn({ status: 1, stdout, stderr: `${stderr}${err.message}\n` });
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      resolveSpawn({ status: status ?? 1, stdout, stderr });
    });
  });
}

export async function startFixtureTarget(fixture, body) {
  let schema = fixture.row.schema;
  const server = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/declaration") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        method: fixture.row.method,
        route: fixture.row.route,
        schema,
        requiredPaths: fixture.row.requiredPaths,
      }));
      return;
    }
    if (req.method === "POST" && req.url === "/repair") {
      schema = fixture.repairedSchema;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ repaired: true }));
      return;
    }
    if (req.method === fixture.row.method && req.url === fixture.row.route) {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(body));
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  const port = await listen(server);
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => closeServer(server),
  };
}

export async function readTarget(origin) {
  const declaration = await fetch(`${origin}/declaration`, { signal: AbortSignal.timeout(5_000) });
  const declared = await declaration.json();
  const response = await fetch(`${origin}${declared.route}`, {
    method: declared.method,
    signal: AbortSignal.timeout(5_000),
  });
  const body = await response.json();
  return {
    httpStatus: response.status,
    method: declared.method,
    route: declared.route,
    schema: declared.schema,
    requiredPaths: declared.requiredPaths,
    body,
  };
}

export function observeTarget(live, source) {
  const classes = blankClasses();
  classes.availability = live.httpStatus >= 200 && live.httpStatus < 300
    ? { state: "pass", code: null }
    : { state: "fail", code: "unreachable" };
  classes.absentSchema = live.schema == null
    ? { state: "fail", code: "seller_response_contract_absent" }
    : { state: "pass", code: null };
  const schemaSlot = classifySchema(live.schema, live.requiredPaths);
  if (classes.absentSchema.state === "pass" && schemaSlot.state === "fail") {
    classes.absentSchema = { state: "pass", code: null };
  }
  classes.semantic = semanticResult(live.body);
  classes.absenceOfDemand = { state: "not_observed", code: null };
  classes.unsupportedEra = { state: "not_observed", code: null };
  classes.security = { state: "pass", code: null };
  return {
    ...live,
    source,
    classes,
    schemaFinding: schemaSlot,
    semantic: classes.semantic,
  };
}

export async function consumePacket(neoRoot, s14Root, sourceRelative) {
  const href = pathToFileURL(join(neoRoot, "experiments/s19-receipt-referral/src/receiving/engines.mjs")).href;
  const { runS14 } = await import(href);
  const ran = runS14(s14Root, sourceRelative);
  return {
    status: ran.status ?? 1,
    json: ran.json,
    stderr: ran.stderr,
  };
}

export async function startCanonical() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", healthRouter);
  app.use("/mcp", mcpRouter);
  const server = createServer(app);
  const port = await listen(server);
  return { origin: `http://127.0.0.1:${port}`, close: () => closeServer(server) };
}

async function postCanonical(origin, body, header) {
  const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
  if (header !== undefined) headers["mcp-protocol-version"] = header;
  const response = await fetch(`${origin}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

export async function observeCanonical(origin) {
  const healthRes = await fetch(`${origin}/api/health`);
  const health = await healthRes.json();
  const healthSemantic = health?.ok === true && health?.service === "samedaydesk";
  const toolsList = { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} };
  const unsupported = await postCanonical(origin, toolsList, "1999-01-01");
  const missing = await postCanonical(origin, toolsList);
  const canonical = await postCanonical(origin, toolsList, "2025-11-25");
  const initialize = await postCanonical(origin, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "task-readiness", version: "0" },
    },
  }, "1999-01-01");
  const repaired = unsupported.status === 400 && unsupported.json?.result === undefined && unsupported.json?.error?.code === -32000;
  return {
    health: {
      method: "GET",
      path: "/api/health",
      httpStatus: healthRes.status,
      semantic: healthSemantic ? "pass" : "fail",
      availability: healthRes.status === 200 ? "pass" : "fail",
    },
    era: {
      method: "POST",
      path: "/mcp",
      header: "MCP-Protocol-Version: 1999-01-01",
      observedStatus: unsupported.status,
      requiredStatus: 400,
      hasResult: unsupported.json?.result !== undefined,
      hasError: unsupported.json?.error !== undefined,
      errorCode: unsupported.json?.error?.code ?? null,
      state: repaired ? "pass" : "fail",
      repaired,
    },
    missingHeader: {
      httpStatus: missing.status,
      hasResult: missing.json?.result !== undefined,
    },
    canonicalVersion: {
      version: "2025-11-25",
      httpStatus: canonical.status,
      hasResult: canonical.json?.result !== undefined,
    },
    initialize: {
      httpStatus: initialize.status,
      protocolVersion: initialize.json?.result?.protocolVersion ?? null,
    },
  };
}

export async function retestEra(origin) {
  const observed = await observeCanonical(origin);
  const batch = await postCanonical(origin, [
    { jsonrpc: "2.0", id: 3, method: "ping" },
    { jsonrpc: "2.0", id: 4, method: "tools/list", params: {} },
  ], "1999-01-01");
  const method = await postCanonical(origin, { jsonrpc: "2.0", id: 9, method: "no-such-method" });
  const checks = {
    unsupported: observed.era.repaired === true,
    missingHeader: observed.missingHeader.httpStatus === 200 && observed.missingHeader.hasResult === true,
    canonical: observed.canonicalVersion.httpStatus === 200 && observed.canonicalVersion.hasResult === true,
    initialize: observed.initialize.httpStatus === 200 && observed.initialize.protocolVersion === "2025-11-25",
    batch: batch.status === 400 && batch.json?.error?.code === -32000 && batch.json?.result === undefined,
    methodNotFound: method.status === 200 && method.json?.error?.code === -32601,
  };
  const ok = Object.values(checks).every(Boolean);
  return { exit: ok ? 0 : 1, checks, observed };
}

export function demandFromLedger(records) {
  const classes = blankClasses();
  classes.availability = { state: "pass", code: null };
  if (!Array.isArray(records)) {
    classes.absenceOfDemand = { state: "not_observed", code: null };
    return classes;
  }
  if (records.length === 0) {
    classes.absenceOfDemand = { state: "fail", code: "no_demand_records" };
    return classes;
  }
  classes.absenceOfDemand = { state: "pass", code: null };
  return classes;
}

export function demandAfterFailedProbe() {
  const classes = blankClasses();
  classes.availability = { state: "fail", code: "unreachable" };
  classes.absenceOfDemand = { state: "not_observed", code: "probe_failure_is_not_demand" };
  return classes;
}

export async function probeClosedPort() {
  const held = createServer();
  const port = await listen(held);
  await closeServer(held);
  const classes = blankClasses();
  try {
    await fetch(`http://127.0.0.1:${port}/quote`, { signal: AbortSignal.timeout(800) });
    classes.availability = { state: "pass", code: null };
    classes.absenceOfDemand = { state: "not_observed", code: null };
  } catch {
    classes.availability = { state: "fail", code: "unreachable" };
    classes.absenceOfDemand = { state: "not_observed", code: "probe_failure_is_not_demand" };
  }
  return { port, classes };
}

export async function securityProbes() {
  const probes = [];
  for (const url of ["file:///etc/passwd", "javascript:alert(1)"]) {
    try {
      await fetchBounded(url);
      probes.push({ url, state: "fail", code: "fetched_malicious", fetched: true });
    } catch (err) {
      probes.push({
        url,
        state: "fail",
        code: err instanceof PublicHostError ? "malicious_source" : "unexpected",
        fetched: false,
      });
    }
  }
  try {
    await fetchBounded("http://user:secret@example.com/x");
    probes.push({ url: "http://user:secret@example.com/x", state: "fail", code: "fetched_malicious", fetched: true });
  } catch (err) {
    probes.push({
      url: "http://user:secret@example.com/x",
      state: "fail",
      code: err instanceof PublicHostError ? "malicious_source" : "unexpected",
      fetched: false,
    });
  }
  let dnsFetched = false;
  try {
    await fetchBounded("http://example.com/dns", {
      lookup: async () => [{ address: "10.1.2.3", family: 4 }, { address: "93.184.216.34", family: 4 }],
      transport: async () => {
        dnsFetched = true;
        return { status: 200, headers: {}, body: "" };
      },
    });
    probes.push({ url: "http://example.com/dns", state: "fail", code: "dns_private_fetched", fetched: true });
  } catch (err) {
    probes.push({
      url: "http://example.com/dns",
      state: "fail",
      code: err instanceof PublicHostError && !dnsFetched ? "dns_private" : "unexpected",
      fetched: dnsFetched,
    });
  }
  let budgetHops = 0;
  try {
    await fetchBounded("http://example.com/budget", {
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      timeoutMs: 40,
      maxBytes: 32,
      transport: async () => {
        budgetHops += 1;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
        return { status: 302, headers: { location: "http://example.com/next" }, body: "" };
      },
    });
    probes.push({ url: "http://example.com/budget", state: "fail", code: "budget_not_enforced", hops: budgetHops });
  } catch (err) {
    probes.push({
      url: "http://example.com/budget",
      state: err instanceof PublicHostError && budgetHops === 1 ? "pass" : "fail",
      code: err instanceof PublicHostError && budgetHops === 1 ? "budget_time" : "unexpected",
      hops: budgetHops,
    });
  }
  for (const url of ["http://127.0.0.1/secret", "http://169.254.169.254/latest"]) {
    try {
      await fetchBounded(url);
      probes.push({ url, state: "fail", code: "fetched_private" });
    } catch (err) {
      const privateHit = err instanceof PublicHostError;
      probes.push({
        url,
        state: privateHit ? "fail" : "fail",
        code: privateHit ? "private_address" : "unexpected",
        fetched: false,
      });
    }
  }
  const calls = [];
  const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  const transport = async (url, options) => {
    calls.push({ url: url.toString(), headers: { ...options.headers } });
    if (calls.length === 1) {
      return { status: 302, headers: { location: "http://other.example/landed" }, body: "" };
    }
    return { status: 200, headers: { "content-type": "application/json" }, body: "{}" };
  };
  await fetchBounded("http://example.com/start", {
    headers: {
      authorization: "Bearer caller-secret",
      origin: "https://caller.example",
      cookie: "session=abc",
      "content-type": "application/json",
      accept: "application/json",
    },
    lookup,
    transport,
  });
  const leaked = calls.some((call) => {
    const headers = call.headers || {};
    return headers.authorization || headers.origin || headers.cookie;
  });
  const second = calls[1];
  const broadened = second && (second.headers.origin || second.headers.authorization || second.headers["content-type"]);
  probes.push({
    url: "http://example.com/start",
    state: leaked || broadened ? "fail" : "pass",
    code: leaked || broadened ? "credential_or_origin_forwarded" : "headers_confined",
    hops: calls.length,
  });
  let privateRedirectFetched = false;
  try {
    await fetchBounded("http://example.com/bounce", {
      lookup,
      transport: async (url) => {
        if (url.hostname === "127.0.0.1") privateRedirectFetched = true;
        return { status: 302, headers: { location: "http://127.0.0.1/secret" }, body: "" };
      },
    });
  } catch (err) {
    probes.push({
      url: "http://example.com/bounce",
      state: "fail",
      code: err instanceof PublicHostError && !privateRedirectFetched ? "redirect_private" : "unexpected",
      fetched: privateRedirectFetched,
    });
    return probes;
  }
  probes.push({
    url: "http://example.com/bounce",
    state: "fail",
    code: "redirect_private_followed",
    fetched: privateRedirectFetched,
  });
  return probes;
}

export async function runTaskReadiness() {
  const acquired = acquirePins();
  const neo = resolvePin("neo");
  const s14 = resolvePin("s14");
  if (neo.head !== acquired.neo.head || s14.head !== S14_PIN) throw new Error("s14 pin drifted");
  const canonical = await startCanonical();
  let canon;
  let eraRetest;
  try {
    canon = await observeCanonical(canonical.origin);
    eraRetest = await spawnColdArgs(["task-readiness-era-retest", "--origin", canonical.origin]);
  } finally {
    await canonical.close();
  }
  if (canon.era.observedStatus !== 400 || canon.era.requiredStatus !== 400 || canon.era.hasResult !== false || canon.era.repaired !== true) {
    throw new Error(`canonical era was not repaired (${canon.era.observedStatus})`);
  }
  if (canon.missingHeader.httpStatus !== 200 || canon.canonicalVersion.httpStatus !== 200 || canon.initialize.httpStatus !== 200) {
    throw new Error("missing-header, canonical version, or initialize client broke");
  }
  if ((eraRetest?.status ?? 1) !== 0) {
    throw new Error(`era retest exit ${eraRetest?.status ?? 1}: ${eraRetest?.stdout || ""} ${eraRetest?.stderr || ""}`);
  }
  const targets = [];
  for (const spec of USEFUL_TARGETS) {
    const fixture = readFixture(s14.root, spec.fixture);
    const complete = readFixture(s14.root, "catalog-row-repair-complete.json");
    fixture.repairedSchema = complete.row.schema;
    const server = await startFixtureTarget(fixture, { data: { quote: "1.25" } });
    try {
      const live = await readTarget(server.origin);
      const observation = observeTarget(live, spec.source);
      const packet = authorizePacket(observation, fixture);
      if (!packet.authorized) throw new Error(`${spec.id} packet refused ${packet.reason}`);
      const consumed = await consumePacket(neo.root, s14.root, spec.source);
      if (!consumed.json) throw new Error(`${spec.id} adapter returned no JSON`);
      if (consumed.status !== 1 || consumed.json.repairComplete !== false || consumed.json.ok !== false) {
        throw new Error(`${spec.id} adapter exit ${consumed.status} is the finding, not completion`);
      }
      const repairRes = await fetch(`${server.origin}/repair`, {
        method: "POST",
        signal: AbortSignal.timeout(5_000),
      });
      if (repairRes.status !== 200) throw new Error(`${spec.id} repair did not apply`);
      const child = await spawnColdArgs(["task-readiness-retest", "--origin", server.origin]);
      targets.push({
        id: spec.id,
        method: observation.method,
        route: observation.route,
        before: {
          classes: observation.classes,
          schemaFinding: observation.schemaFinding,
          packet,
          adapter: {
            status: consumed.status,
            json: consumed.json,
            means: "repair-needed",
            complete: false,
          },
        },
        claimedBecausePacket: false,
        retest: {
          status: child.status ?? 1,
          stdout: child.stdout,
          source: "separate-process-retest",
          complete: (child.status ?? 1) === 0,
        },
      });
    } finally {
      await server.close();
    }
  }
  const semanticFixture = readFixture(s14.root, "catalog-row-repair-complete.json");
  semanticFixture.repairedSchema = semanticFixture.row.schema;
  const semanticServer = await startFixtureTarget(semanticFixture, { data: { quote: "soon" } });
  let semantic;
  try {
    const live = await readTarget(semanticServer.origin);
    const observation = observeTarget(live, "action/fixtures/catalog-row-repair-complete.json");
    const packet = authorizePacket(observation, semanticFixture);
    semantic = {
      shape: observation.semantic.shape,
      semantic: observation.semantic,
      schemaFinding: observation.schemaFinding,
      packet,
    };
  } finally {
    await semanticServer.close();
  }
  const security = await securityProbes();
  const closed = await probeClosedPort();
  const receipt = {
    schema: "samedaydesk.task-readiness.receipt.v1",
    job: "READINESS-REPAIR-INTEGRATION-100129",
    consumer: "MAINT",
    neo: neo.head,
    s14: s14.head,
    staleNeoRefused: STALE_NEO,
    paymentSent: false,
    paymentSigned: false,
    credentialsUsed: false,
    newPaymentRail: false,
    catalog: catalogDocument(),
    canonical: canon,
    eraRetest: {
      status: eraRetest.status ?? 1,
      stdout: eraRetest.stdout,
      source: "separate-process-retest",
    },
    publicReadback: {
      path: "client/public/discovery/task-readiness.json",
      repaired: catalogDocument().canonical.repaired,
      requiredStatus: catalogDocument().canonical.requiredStatus,
      matchesCommitted: catalogMatchesCommitted(),
    },
    targets,
    semantic,
    availability: closed.classes,
    demand: demandFromLedger([]),
    security,
  };
  if (receipt.targets.some((target) => target.retest.status !== 0 || target.before.adapter.complete !== false || target.claimedBecausePacket !== false)) {
    throw new Error("independent retest failed");
  }
  if (receipt.publicReadback.matchesCommitted !== true || receipt.publicReadback.repaired !== true) {
    throw new Error("public readback does not match the repaired catalog");
  }
  if (semantic.packet.authorized !== false || semantic.semantic.state !== "fail" || semantic.shape !== "string") {
    throw new Error("semantic case was treated as ready");
  }
  if (receipt.availability.absenceOfDemand.code !== "probe_failure_is_not_demand") {
    throw new Error("failed probe synthesized demand");
  }
  if (receipt.demand.absenceOfDemand.code !== "no_demand_records") {
    throw new Error("empty ledger was not absence of demand");
  }
  return receipt;
}

export async function retestOrigin(origin) {
  const neo = resolvePin("neo");
  const s14 = resolvePin("s14");
  const complete = readFixture(s14.root, "catalog-row-repair-complete.json");
  const live = await readTarget(origin);
  const observation = observeTarget(live, "action/fixtures/catalog-row-repair-complete.json");
  const packet = authorizePacket(observation, complete);
  if (!packet.authorized) {
    return { exit: 1, reason: packet.reason, observation };
  }
  const consumed = await consumePacket(neo.root, s14.root, "action/fixtures/catalog-row-repair-complete.json");
  const good = consumed.status === 0
    && consumed.json?.ok === true
    && consumed.json?.repairComplete === true
    && consumed.json?.paymentSent === false
    && observation.semantic.state === "pass"
    && observation.classes.absentSchema.state === "pass";
  return { exit: good ? 0 : 1, consumed, observation };
}

export function receiptPath() {
  return join(here, "../TASK-READINESS-RECEIPT.json");
}

export function writeReceipt(receipt) {
  const path = receiptPath();
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`);
  return path;
}

export function catalogMatchesCommitted() {
  const committed = readFileSync(join(repoRoot, "client/public/discovery/task-readiness.json"), "utf8");
  return committed === catalogText();
}

export async function runTaskReadinessNegative() {
  acquirePins();
  const semanticFixture = readFixture(resolvePin("s14").root, "catalog-row-repair-complete.json");
  const observation = {
    method: "POST",
    route: "/quote",
    requiredPaths: semanticFixture.row.requiredPaths,
    schema: semanticFixture.row.schema,
    source: "action/fixtures/catalog-row-repair-complete.json",
    semantic: semanticResult({ data: { quote: "soon" } }),
  };
  const packet = authorizePacket(observation, semanticFixture);
  const shaped = observation.semantic.shape === "string" && observation.semantic.state === "fail" && packet.authorized === false;
  const probe = demandAfterFailedProbe();
  const demandDistinct = probe.availability.state === "fail"
    && probe.absenceOfDemand.state === "not_observed"
    && probe.absenceOfDemand.code === "probe_failure_is_not_demand"
    && demandFromLedger([]).absenceOfDemand.code === "no_demand_records";
  let stale = false;
  try {
    resolvePin("s14", join(repoRoot, "..", "pins", "s14"));
  } catch (err) {
    stale = err.code === "stale_sibling";
  }
  let mismatch = false;
  try {
    resolvePin("neo", repoRoot);
  } catch (err) {
    mismatch = err.code === "pin_mismatch" || err.code === "stale_sibling";
  }
  let privateCode = null;
  try {
    await fetchBounded("http://127.0.0.1/secret");
  } catch (err) {
    privateCode = err instanceof PublicHostError ? "private_address" : "unexpected";
  }
  const privateDistinct = privateCode === "private_address";
  return {
    exit: shaped && demandDistinct && stale && mismatch && privateDistinct ? 1 : 2,
    shaped,
    demandDistinct,
    stale,
    mismatch,
    privateDistinct,
  };
}

export function sayReceipt(receipt, say) {
  for (const target of receipt.targets) {
    const finding = target.before.schemaFinding;
    const adapter = target.before.adapter;
    say(`task-readiness target ${target.id} ${target.method} ${target.route} schema ${finding.code ?? "pass"} semantic ${target.before.classes.semantic.state} packet authorized`);
    say(`task-readiness adapter ${target.id} exit ${adapter.status} finding ${(adapter.json.findings || []).join(",") || "none"} repair ${(adapter.json.repairActions || []).join(",") || "none"} paymentSent ${adapter.json.paymentSent} means repair-needed`);
    say(`task-readiness completion ${target.id} separate-process retest exit ${target.retest.status}`);
    say(`task-readiness retest ${target.id} exit ${target.retest.status}`);
  }
  say(`task-readiness semantic shape ${receipt.semantic.shape} value ${receipt.semantic.semantic.state} packet ${receipt.semantic.packet.authorized ? "authorized" : "refused"} ${receipt.semantic.packet.reason}`);
  say(`task-readiness canonical POST /mcp ${receipt.canonical.era.header} observed ${receipt.canonical.era.observedStatus} required ${receipt.canonical.era.requiredStatus} unsupported_era ${receipt.canonical.era.state} repaired ${receipt.canonical.era.repaired}`);
  say(`task-readiness era-retest exit ${receipt.eraRetest.status}`);
  say(`task-readiness public-readback ${receipt.publicReadback.path} repaired ${receipt.publicReadback.repaired} required ${receipt.publicReadback.requiredStatus}`);
  say(`task-readiness canonical GET /api/health semantic ${receipt.canonical.health.semantic} availability ${receipt.canonical.health.availability}`);
  say(`task-readiness availability ${receipt.availability.availability.state} demand ${receipt.availability.absenceOfDemand.state} ${receipt.availability.absenceOfDemand.code}`);
  say(`task-readiness demand empty-ledger ${receipt.demand.absenceOfDemand.state} ${receipt.demand.absenceOfDemand.code}`);
  for (const probe of receipt.security) {
    say(`task-readiness security ${probe.code} ${probe.state}`);
  }
  say(`task-readiness catalog ${catalogMatchesCommitted() ? "matches committed" : "drift"} repaired-era`);
  say("task-readiness paymentSent false");
}
