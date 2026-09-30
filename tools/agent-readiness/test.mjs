import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compareBaseline, scoreAll } from "./baseline.mjs";
import { CODE_SET } from "./codes.mjs";
import { captureById } from "./captures.mjs";
import { probeOrigin } from "./probe.mjs";
import { coverageOf, scoreCapture } from "./score.mjs";
import { SUPPORTED_PROTOCOL_VERSIONS } from "./shape.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["tools/agent-readiness/cli.mjs", ...args], {
      cwd: root,
      encoding: "utf8",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("coverage is 136 rows across the eight hosts", () => {
  const reports = scoreAll();
  const rows = coverageOf(reports);
  assert.equal(reports.length, 8);
  assert.equal(rows.length, 136);
  assert.equal(new Set(rows.map((row) => row.id)).size, 136);
  const compared = compareBaseline(reports);
  assert.deepEqual(compared.mismatches, []);
  assert.equal(compared.ok, true);
});

test("held-out fixture scores differently and is rejected", () => {
  const reports = scoreAll();
  const apex = reports.find((report) => report.hostId === "samedaydesk-apex");
  const held = reports.find((report) => report.hostId === "held-out-seed");
  assert.notEqual(held.score, apex.score);
  assert.equal(held.verdict, "reject");
  assert.ok(held.failClosed.includes("AG6_HANDSHAKE_VERSION_UNSUPPORTED"));
  assert.ok(held.failClosed.includes("AG6_TOOLS_LIST_ID_MISMATCH"));
  const version = held.checks.find((check) => check.id === "mcp.handshake.version");
  assert.equal(version.status, "fail");
  assert.notEqual(version.status, "pass");
});

test("wrong-shaped discovery and handshake fail closed and do not pass", () => {
  const reports = scoreAll();
  const discovery = reports.find((report) => report.hostId === "malformed-discovery");
  const handshake = reports.find((report) => report.hostId === "malformed-handshake");
  const card = discovery.checks.find((check) => check.id === "discovery.mcp_card");
  const llms = discovery.checks.find((check) => check.id === "discovery.llms");
  const version = handshake.checks.find((check) => check.id === "mcp.handshake.version");
  const envelope = handshake.checks.find((check) => check.id === "mcp.handshake.envelope");
  assert.equal(discovery.verdict, "reject");
  assert.equal(card.status, "fail");
  assert.equal(card.code, "AG6_DISCOVERY_NOT_OBJECT");
  assert.equal(llms.code, "AG6_DISCOVERY_NOT_JSON");
  assert.equal(handshake.verdict, "reject");
  assert.equal(envelope.code, "AG6_HANDSHAKE_NOT_JSONRPC");
  assert.equal(version.status, "blocked");
  assert.notEqual(version.status, "pass");
  for (const check of [...discovery.checks, ...handshake.checks]) {
    if (check.code) assert.equal(check.status === "pass", false, check.id);
    if (check.code) assert.equal(CODE_SET.has(check.code), true, check.code);
  }
});

test("a numeric x402 amount is not accepted as atomic", () => {
  const report = scoreCapture({
    id: "amount-seed",
    role: "gateway",
    origin: "https://agents.samedaydesk.com",
    responses: {
      "GET /.well-known/x402": {
        status: 200,
        contentType: "application/json",
        finalUrl: "https://agents.samedaydesk.com/.well-known/x402",
        body: { x402Version: 2, items: [{ resource: { url: "https://agents.samedaydesk.com/extract" }, accepts: [{ amount: 5000 }] }] },
      },
    },
  });
  const amount = report.checks.find((check) => check.id === "x402.amount_atomic");
  assert.equal(amount.status, "fail");
  assert.equal(amount.code, "AG6_X402_AMOUNT_NOT_ATOMIC");
});

test("gateway SSE capture lists 25 tools and ein stays applicable only for text discovery", () => {
  const reports = scoreAll();
  const gateway = reports.find((report) => report.hostId === "agents-gateway");
  const ein = reports.find((report) => report.hostId === "ein-llc");
  const neo = reports.find((report) => report.hostId === "neomorphic-io");
  assert.match(gateway.checks.find((check) => check.id === "mcp.tools_list.shape").detail, /25 tools/);
  assert.equal(ein.score, 100);
  assert.equal(ein.verdict, "pass");
  assert.notEqual(neo.score, ein.score);
  assert.equal(neo.verdict, "reject");
  assert.ok(neo.failClosed.includes("AG6_X402_WRONG_SHAPE"));
  assert.equal(neo.checks.find((check) => check.id === "mcp.handshake.envelope").status, "not_applicable");
});

test("supported protocol versions are the ones the apex MCP route declares", () => {
  const source = readFileSync(join(root, "server/routes/mcp.js"), "utf8");
  for (const version of SUPPORTED_PROTOCOL_VERSIONS) assert.match(source, new RegExp(version));
  assert.match(source, /samedaydesk-agent-tools/);
  assert.equal(captureById("samedaydesk-apex").role, "apex");
});

test("CLI baseline exits 0 and the seeded host exits 1", async () => {
  const baseline = await runCli(["--baseline"]);
  assert.equal(baseline.code, 0, baseline.stderr || baseline.stdout);
  const parsed = JSON.parse(baseline.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.coverageRows, 136);
  assert.equal(parsed.heldOutDiffers, true);
  assert.equal(parsed.paid, false);

  const seeded = await runCli(["--seeded-failure", "held-out-seed"]);
  assert.equal(seeded.code, 1, seeded.stdout);
  const rejected = JSON.parse(seeded.stdout);
  assert.equal(rejected.rejected, true);
  assert.equal(rejected.ok, false);
  assert.ok(rejected.failClosed.includes("AG6_HANDSHAKE_VERSION_UNSUPPORTED"));

  const discovery = await runCli(["--seeded-failure", "malformed-discovery"]);
  assert.equal(discovery.code, 1);
  assert.ok(JSON.parse(discovery.stdout).failClosed.includes("AG6_DISCOVERY_NOT_OBJECT"));

  const coverage = await runCli(["--coverage"]);
  assert.equal(coverage.code, 0, coverage.stdout);
  assert.equal(JSON.parse(coverage.stdout).coverageRows, 136);
});

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

test("probe rejects a private URL and fail-closes an HTML handshake", async () => {
  await assert.rejects(() => probeOrigin("http://127.0.0.1:9/"), /not a public website/);
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<!doctype html><title>soft</title>");
  });
  const port = await listen(server);
  try {
    const probed = await probeOrigin(`http://127.0.0.1:${port}`, { allowLoopback: true, followOffOrigin: false });
    const report = scoreCapture({
      id: "loop-html",
      role: "apex",
      origin: probed.origin,
      responses: probed.responses,
    });
    assert.equal(report.verdict, "reject");
    assert.ok(report.failClosed.includes("AG6_HANDSHAKE_NOT_JSON"));
    assert.ok(report.failClosed.includes("AG6_DISCOVERY_NOT_JSON"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("shipped apex app negotiates MCP, lists tools, and redirects the agent card", async () => {
  const [{ default: express }, { createSdsApp }] = await Promise.all([
    import("express"),
    import("../../server/app.js"),
  ]);
  assert.equal(typeof express, "function");
  const app = createSdsApp();
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const probed = await probeOrigin(`http://127.0.0.1:${port}`, { allowLoopback: true, followOffOrigin: false });
    const report = scoreCapture({
      id: "loopback-apex",
      label: "loopback apex",
      origin: probed.origin,
      role: "apex",
      responses: probed.responses,
    });
    const handshake = report.checks.find((check) => check.id === "mcp.handshake.envelope");
    const version = report.checks.find((check) => check.id === "mcp.handshake.version");
    const tools = report.checks.find((check) => check.id === "mcp.tools_list.shape");
    const cors = report.checks.find((check) => check.id === "cors.preflight");
    const registry = report.checks.find((check) => check.id === "discovery.registry_auth");
    const card = report.checks.find((check) => check.id === "agent_card.shape");
    assert.equal(handshake.status, "pass", handshake.detail);
    assert.equal(version.status, "pass", version.detail);
    assert.match(version.detail, /2024-11-05/);
    assert.equal(tools.status, "pass", tools.detail);
    assert.match(tools.detail, /5 tools/);
    assert.equal(cors.status, "pass", cors.detail);
    assert.equal(registry.status, "pass", registry.detail);
    assert.equal(card.status, "pass", card.detail);
    assert.match(probed.responses["GET /.well-known/agent-card.json"].headers.location, /agents\.samedaydesk\.com\/\.well-known\/agent-card\.json/);
    assert.equal(report.paid, false);

    const baseline = await fetch(`http://127.0.0.1:${port}/api/tools/agent-readiness/baseline`);
    const baselineBody = await baseline.json();
    assert.equal(baseline.status, 200);
    assert.equal(baselineBody.coverageRows, 136);
    assert.equal(baselineBody.paid, false);
    assert.equal(baselineBody.heldOutDiffers, true);

    const blocked = await fetch(`http://127.0.0.1:${port}/api/tools/agent-readiness?url=${encodeURIComponent("http://127.0.0.1/secret")}`);
    const blockedBody = await blocked.json();
    assert.equal(blocked.status, 400);
    assert.match(blockedBody.error, /not a public website/);
    assert.equal(blockedBody.paid, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
