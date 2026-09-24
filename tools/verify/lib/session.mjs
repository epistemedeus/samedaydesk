import http from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ABSENT_TOOL_NAME, MCP_PROTOCOL, RPC_REQUEST_ID } from "./catalog.mjs";
import { sessionFromProbeResponses } from "./judge.mjs";

const FETCH_MS = 10_000;

function parseJsonBody(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export async function postRpc(mcpUrl, message) {
  const response = await fetch(mcpUrl, {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(FETCH_MS),
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "mcp-protocol-version": MCP_PROTOCOL,
    },
    body: JSON.stringify(message),
  });
  const text = await response.text();
  return {
    status: response.status,
    json: parseJsonBody(text),
  };
}

export function mcpUrlForOrigin(origin) {
  const url = new URL(origin);
  const path = url.pathname.replace(/\/+$/, "");
  if (path === "" || path === "/") url.pathname = "/mcp";
  else if (!path.endsWith("/mcp")) url.pathname = `${path}/mcp`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

// tools/list first. The only tools/call name is the absent probe.
export async function probeApex(origin) {
  const mcpUrl = mcpUrlForOrigin(origin);
  const initialize = await postRpc(mcpUrl, {
    jsonrpc: "2.0",
    id: RPC_REQUEST_ID.initialize,
    method: "initialize",
    params: {
      protocolVersion: MCP_PROTOCOL,
      capabilities: {},
      clientInfo: { name: "samedaydesk-apex-verify", version: "1.0.0" },
    },
  });
  const listed = await postRpc(mcpUrl, {
    jsonrpc: "2.0",
    id: RPC_REQUEST_ID.toolsList,
    method: "tools/list",
    params: {},
  });
  const absent = await postRpc(mcpUrl, {
    jsonrpc: "2.0",
    id: RPC_REQUEST_ID.absent,
    method: "tools/call",
    params: { name: ABSENT_TOOL_NAME, arguments: {} },
  });
  return {
    mcpUrl,
    steps: ["initialize", "tools/list", "tools/call:absent"],
    absentToolName: ABSENT_TOOL_NAME,
    initialize,
    listed,
    absent,
    session: sessionFromProbeResponses(initialize.json, listed.json, absent.json),
  };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function childEnv(port) {
  const dir = mkdtempSync(join(tmpdir(), "sds-apex-mcp-"));
  return {
    PATH: process.env.PATH || "",
    HOME: process.env.HOME || "",
    LANG: process.env.LANG || "C",
    TMPDIR: dir,
    PULSE_FILE: join(dir, "pulse-v1.json"),
    NODE_ENV: "development",
    PORT: String(port),
  };
}

function redact(text) {
  return String(text || "")
    .replace(/(key|secret|token|password|authorization)=\S+/gi, "$1=[redacted]")
    .slice(-400);
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null && !child.signalCode) child.kill("SIGKILL");
      resolve();
    }, 1500);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function waitForHealth(port, child) {
  const deadline = Date.now() + 20_000;
  let lastError = "not-ready";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      const error = new Error("shipped server exited before health");
      error.code = "HOST_BUILD";
      throw error;
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        const body = await response.json();
        if (body?.service === "samedaydesk") return body;
        lastError = "health service mismatch";
      } else {
        lastError = `health status ${response.status}`;
      }
    } catch (error) {
      lastError = error?.message || String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  const error = new Error(`shipped server health timeout: ${lastError}`);
  error.code = "HOST_BUILD";
  throw error;
}

export function shippedHostReady(root) {
  return existsSync(join(root, "node_modules/express/package.json"))
    && existsSync(join(root, "server/index.js"));
}

export async function withShippedHost(root, fn) {
  if (!shippedHostReady(root)) {
    const error = new Error("express is not installed; run npm ci before the apex MCP probe");
    error.code = "HOST_BUILD";
    throw error;
  }
  const port = await freePort();
  const logs = { text: "" };
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: root,
    env: childEnv(port),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const capture = (chunk) => {
    logs.text += chunk.toString("utf8");
    if (logs.text.length > 4000) logs.text = logs.text.slice(-4000);
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  try {
    await waitForHealth(port, child);
    return await fn({
      origin: `http://127.0.0.1:${port}`,
      port,
      logs: () => redact(logs.text),
    });
  } catch (error) {
    error.logs = redact(logs.text);
    throw error;
  } finally {
    await stopChild(child);
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function envelopeOverride(fixture, key) {
  const envelope = fixture?.envelope;
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) return null;
  const override = envelope[key];
  if (!override || typeof override !== "object" || Array.isArray(override)) return null;
  return override;
}

// A fixture may replace response identity. The default still echoes the request id.
function withEnvelope(body, override) {
  if (!override) return body;
  const next = { ...body };
  if (Object.prototype.hasOwnProperty.call(override, "jsonrpc")) next.jsonrpc = override.jsonrpc;
  if (override.omitId === true) delete next.id;
  else if (Object.prototype.hasOwnProperty.call(override, "id")) next.id = override.id;
  if (override.omitResult === true) delete next.result;
  if (override.omitError === true) delete next.error;
  if (Object.prototype.hasOwnProperty.call(override, "error")) next.error = override.error;
  if (Object.prototype.hasOwnProperty.call(override, "result")) next.result = override.result;
  return next;
}

function seedRpc(fixture, message) {
  if (message?.method === "initialize") {
    return withEnvelope(
      { jsonrpc: "2.0", id: message.id, result: fixture.initialize },
      envelopeOverride(fixture, "initialize"),
    );
  }
  if (message?.method === "tools/list") {
    const tools = (fixture.tools || []).map((tool) => (
      typeof tool === "string"
        ? { name: tool, description: "seed", inputSchema: { type: "object", properties: {} } }
        : tool
    ));
    return withEnvelope(
      { jsonrpc: "2.0", id: message.id, result: { tools } },
      envelopeOverride(fixture, "tools/list"),
    );
  }
  if (message?.method === "tools/call") {
    const body = fixture.absent?.error
      ? { jsonrpc: "2.0", id: message.id, error: fixture.absent.error }
      : { jsonrpc: "2.0", id: message.id, result: fixture.absent?.result ?? { isError: true } };
    return withEnvelope(body, envelopeOverride(fixture, "absent"));
  }
  return {
    jsonrpc: "2.0",
    id: message?.id,
    error: { code: -32601, message: `Method not found: ${message?.method}` },
  };
}

export function startSeedServer(fixture) {
  const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && (req.url || "").startsWith("/api/health")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "samedaydesk-seed" }));
      return;
    }
    if (req.method !== "POST" || !(req.url || "").startsWith("/mcp")) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    try {
      const message = JSON.parse(await readBody(req));
      const body = seedRpc(fixture, message);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }));
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        origin: `http://127.0.0.1:${port}`,
        port,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}
