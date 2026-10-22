import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { sha256Bytes } from "./hash.mjs";
import { repoPaths } from "./paths.mjs";
import { refuse } from "./refuse.mjs";

function send(res, status, body, contentType = "application/json; charset=utf-8") {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), "utf8");
  res.writeHead(status, {
    "content-type": contentType,
    "content-length": buf.length,
    "x-content-sha256": sha256Bytes(buf),
  });
  res.end(buf);
}

export function createDiscoveryServer({ discoveryBytes, extraFiles = {} } = {}) {
  if (!discoveryBytes) throw refuse("missing-discovery", "HTTP discovery server requires discovery bytes");
  const discoveryBuf = Buffer.isBuffer(discoveryBytes) ? discoveryBytes : Buffer.from(discoveryBytes);
  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method !== "GET" && req.method !== "HEAD") {
      send(res, 405, `${JSON.stringify({ ok: false, code: "method-not-allowed" })}\n`);
      return;
    }
    if (url.pathname === "/discovery.json" || url.pathname === "/" || url.pathname === "/offer") {
      send(res, 200, discoveryBuf);
      return;
    }
    if (url.pathname === "/health") {
      send(res, 200, `${JSON.stringify({ ok: true, liveSettlement: "out-of-scope" })}\n`);
      return;
    }
    const hosted = extraFiles[url.pathname];
    if (hosted && existsSync(hosted)) {
      send(res, 200, readFileSync(hosted));
      return;
    }
    send(res, 404, `${JSON.stringify({ ok: false, code: "not-found" })}\n`);
  });
  return { server, discoverySha256: sha256Bytes(discoveryBuf), discoveryBytes: discoveryBuf.length };
}

export function listenDiscoveryServer(server, { host = "127.0.0.1", port = 0 } = {}) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const addr = server.address();
      resolve({ host: addr.address, port: addr.port, origin: `http://${addr.address}:${addr.port}` });
    });
  });
}

export function hostedEvidenceFiles(repoRoot) {
  const paths = repoPaths(repoRoot);
  const dir = paths.remoteEvidence;
  return {
    "/hosted/openapi.json": join(dir, "openapi.json"),
    "/hosted/mcp-version.json": join(dir, "mcp-version.json"),
    "/hosted/lockfile-challenge.json": join(dir, "lockfile-challenge.json"),
    "/hosted/capture.json": join(dir, "capture.json"),
  };
}
