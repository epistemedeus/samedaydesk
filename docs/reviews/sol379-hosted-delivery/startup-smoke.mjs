#!/usr/bin/env node
// Actual built site + existing server/index.js in production mode on loopback.
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { Budget, within, readResponse } from "../../../tools/hosted-useful-journey-100346/lib/budget.mjs";
import { UsefulJourneyClient } from "../../../tools/hosted-useful-journey-100346/client.mjs";
import { MCP_TOOL_NAMES } from "../../../server/lib/mcp-tool-inventory.js";

const budget = new Budget();
const reserve = createServer();
await within(new Promise(resolve => reserve.listen(0, "127.0.0.1", resolve)), budget);
const port = reserve.address().port;
await within(new Promise(resolve => reserve.close(resolve)), budget);
const child = spawn(process.execPath, ["server/index.js"], { cwd: new URL("../../../", import.meta.url), detached: true,
  env: { PATH: process.env.PATH, NODE_ENV: "production", PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
const exited = new Promise(resolve => child.once("exit", resolve));
const origin = `http://127.0.0.1:${port}`;
const requests = [];
try {
  await within(new Promise((resolve, reject) => {
    let output = "";
    child.stdout.on("data", bytes => { try { budget.spend(bytes.length, "startup-diagnostics"); output += bytes; if (output.includes("listening")) resolve(); } catch (error) { reject(error); } });
    child.stderr.on("data", bytes => { try { budget.spend(bytes.length, "startup-diagnostics"); } catch (error) { reject(error); } });
    child.once("exit", () => reject(Error("startup_failed")));
    child.once("error", reject);
  }), budget);
  async function request(path, body) {
    const controller = new AbortController();
    try {
      const encoded = body === undefined ? undefined : JSON.stringify(body);
      if (encoded) budget.spend(Buffer.byteLength(encoded), "http-request");
      const response = await within(fetch(`${origin}${path}`, { method: body ? "POST" : "GET",
        headers: body ? { "content-type": "application/json", accept: "application/json, text/event-stream" } : {},
        body: encoded, redirect: "manual", signal: controller.signal }), budget, 0, () => controller.abort());
      const bytes = await readResponse(response, budget);
      requests.push({ path, status: response.status, bytes: bytes.length });
      return { status: response.status, bytes, json: () => JSON.parse(bytes) };
    } finally { controller.abort(); }
  }
  assert.equal((await request("/api/health")).json().service, "samedaydesk");
  assert.equal((await request("/api/correspondence/healthz")).json().enabled, false);
  const health = (await request("/api/hosted-useful/healthz")).json();
  assert.equal(health.enabled, false); assert.equal(health.publicEvaluation, true);
  assert.equal((await request("/api/public-readiness/healthz")).json().enabled, true);
  const homepage = await request("/");
  assert.equal(homepage.status, 200);
  assert.match(homepage.bytes.toString(), /SameDayDesk/);
  const initialized = await request("/mcp", { jsonrpc: "2.0", id: 379, method: "initialize",
    params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "sol379-loopback", version: "1" } } });
  assert.equal(initialized.json().result.serverInfo.name, "samedaydesk-agent-tools");
  const listed = await request("/mcp", { jsonrpc: "2.0", id: 380, method: "tools/list", params: {} });
  assert.deepEqual(listed.json().result.tools.map(tool => tool.name), [...MCP_TOOL_NAMES]);
  assert.equal((await request("/api/uploads/signed-url", {})).status, 501);
  const client = new UsefulJourneyClient({ origin, budget });
  const entry = await client.call("GET", "/api/hosted-useful/client", undefined, undefined, true);
  const controller = new AbortController();
  const archiveReply = await within(fetch(`${origin}${entry.archiveUrl}`, { headers: {
    "x-useful-deadline-at": String(budget.deadlineAt), "x-useful-total-bytes": String(budget.totalBytes),
    "x-useful-used-bytes": String(budget.used), "x-useful-output-bytes": String(budget.outputBytes) },
    signal: controller.signal }), budget, 0, () => controller.abort());
  budget.inherit(Number(archiveReply.headers.get("x-useful-used-bytes")));
  const archive = await readResponse(archiveReply, budget); controller.abort();
  assert.equal(createHash("sha256").update(archive).digest("hex"), entry.sha256);
  assert.equal(archive.length, entry.bytes);
  const supplied = JSON.parse(await within(readFile(new URL("../../../tools/hosted-useful-journey-100346/examples/issue-brief.json", import.meta.url)), budget));
  supplied.taskId = "production-mode-loopback-supplied-brief";
  const evaluated = await client.evaluate(supplied);
  assert.equal(evaluated.admitted, false);
  assert.equal(evaluated.result.recipe.evidence.brief.actions.length, 2);
  assert.equal(evaluated.publicationVerified, false);
  child.kill("SIGTERM");
  await within(exited, budget);
  assert.equal(child.exitCode, 0);
  budget.spend(4096, "receipt-output-reservation");
  const receipt = { schema: "samedaydesk.sol379.actual-startup.v1", observedAt: new Date().toISOString(),
    command: "NODE_ENV=production node server/index.js", runtime: process.version, loopback: true, processId: child.pid,
    builtHomepage: true, existingMcpNames: MCP_TOOL_NAMES, requests, client: { version: entry.version, bytes: entry.bytes, sha256: entry.sha256 },
    publicSuppliedEvaluation: true, admissionEnabled: false, cleanSigtermExit: true, budget: budget.snapshot(),
    productionHostingVerified: false, productionWrites: 0 };
  const output = JSON.stringify(receipt, null, 2) + "\n";
  assert.ok(Buffer.byteLength(output) < 3840);
  await within(writeFile(new URL("STARTUP-READBACK.json", import.meta.url), output), budget);
  process.stdout.write(JSON.stringify({ ok: true, client: receipt.client, elapsedMs: budget.snapshot().elapsedMs }) + "\n");
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    try { process.kill(-child.pid, "SIGKILL"); } catch {}
    await exited;
  }
}
