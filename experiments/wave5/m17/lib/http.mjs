import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createSdsApp } from "../../../../server/app.js";
import { mountProductionClient } from "../../../../server/lib/spa-client.js";
import { writeRouteShells } from "../../../../server/lib/spa-route-shells.js";
import { QUERY_PROBE, SDS_ROOT } from "./pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const LOOPBACK_SERVER = join(here, "loopback-catalog-server.mjs");

export function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ server, port: addr.port });
    });
    server.on("error", reject);
  });
}

export async function closeServer(server) {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

export async function probe(origin, { method, path, body, headers = {} }) {
  const res = await fetch(`${origin}${path}`, {
    method,
    headers,
    body: body == null ? undefined : body,
    redirect: "manual",
  });
  const text = await res.text();
  return {
    method,
    path,
    status: res.status,
    type: res.headers.get("content-type") || "",
    location: res.headers.get("location") || "",
    body: text,
  };
}

export async function startSdsApi() {
  const app = createSdsApp();
  const { server, port } = await listen(app);
  return { server, port, origin: `http://127.0.0.1:${port}` };
}

export function builtIndexHtml() {
  const source = readFileSync(join(SDS_ROOT, "client/index.html"), "utf8");
  return source.replace(
    '<script type="module" src="/src/main.tsx"></script>',
    '<script type="module" crossorigin src="/assets/index-w5m17.js"></script>\n    <link rel="stylesheet" crossorigin href="/assets/index-w5m17.css">',
  );
}

export function writeSpaDist() {
  const dist = mkdtempSync(join(tmpdir(), "w5-m17-spa-"));
  writeFileSync(join(dist, "index.html"), builtIndexHtml());
  writeFileSync(join(dist, "skillguard.html"), "<!doctype html><title>SkillGuard</title>");
  writeRouteShells(dist);
  return dist;
}

export async function startSpaShellApp(dist = writeSpaDist()) {
  const app = express();
  mountProductionClient(app, dist);
  const { server, port } = await listen(app);
  return { server, port, origin: `http://127.0.0.1:${port}`, dist };
}

export function startLoopbackCatalogs(beforeDoc, afterDoc) {
  const dir = mkdtempSync(join(tmpdir(), "w5-m17-loop-"));
  const beforePath = join(dir, "before.json");
  const afterPath = join(dir, "after.json");
  writeFileSync(beforePath, `${JSON.stringify(beforeDoc)}\n`);
  writeFileSync(afterPath, `${JSON.stringify(afterDoc)}\n`);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [LOOPBACK_SERVER, beforePath, afterPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`loopback catalog server did not print a port: ${stdout}`));
    }, 5000);
    const onExit = (code) => {
      clearTimeout(timer);
      reject(new Error(`loopback catalog server exited ${code}`));
    };
    child.once("exit", onExit);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      const match = stdout.match(/^(\d+)/m);
      if (!match) return;
      clearTimeout(timer);
      child.removeListener("exit", onExit);
      const port = Number(match[1]);
      resolve({
        child,
        port,
        beforeUrl: `http://127.0.0.1:${port}/before.json`,
        afterUrl: `http://127.0.0.1:${port}/after.json`,
        stop() {
          if (child.exitCode !== null) return;
          child.kill("SIGTERM");
        },
      });
    });
  });
}

export const API_PROBES = Object.freeze([
  { id: "health", method: "GET", path: "/api/health", expectStatus: 200 },
  { id: "api-miss", method: "GET", path: "/api/w5-m17-missing", expectStatus: 404 },
  { id: "mcp-get", method: "GET", path: "/mcp", expectStatus: 200 },
  { id: "mcp-post-empty", method: "POST", path: "/mcp", body: "{}", headers: { "content-type": "application/json" }, expectStatus: 202 },
  {
    id: "mcp-post-initialize",
    method: "POST",
    path: "/mcp",
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    headers: { "content-type": "application/json" },
    expectStatus: 200,
  },
  { id: "mcp-query", method: "GET", path: `/mcp?cs=${QUERY_PROBE}`, expectStatus: 200 },
  { id: "mcp-options", method: "OPTIONS", path: "/mcp", expectStatus: 204 },
  { id: "agent-card", method: "GET", path: "/.well-known/agent-card.json", expectStatus: 308 },
  { id: "x402-on-api", method: "GET", path: "/x402", expectStatus: 404 },
]);

export async function observeApi(origin) {
  const observed = [];
  for (const probeDef of API_PROBES) {
    const result = await probe(origin, probeDef);
    observed.push({
      id: probeDef.id,
      method: probeDef.method,
      path: probeDef.path,
      expectStatus: probeDef.expectStatus,
      status: result.status,
      type: result.type,
      location: result.location,
      bodyPreview: result.body.slice(0, 180),
    });
  }
  return observed;
}