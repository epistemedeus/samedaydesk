import { createReadStream, existsSync, statSync } from "node:fs";
import http from "node:http";
import { join, normalize, resolve, sep } from "node:path";
import { PUBLIC_DIR } from "./repo.mjs";

function safeJoin(root, urlPath) {
  const rel = decodeURIComponent(urlPath).replace(/^\/+/, "");
  const abs = normalize(join(root, rel));
  if (!abs.startsWith(root)) return null;
  return abs;
}

/**
 * Serve committed public files. This is the published catalog origin layout,
 * not a second paid-job HTTP API (D14 owns a thin HTTP consumer).
 */
export function startPublicOrigin({ root = PUBLIC_DIR } = {}) {
  const publicRoot = resolve(root);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      res.end("method not allowed");
      return;
    }
    const abs = safeJoin(publicRoot, url.pathname);
    if (
      !abs ||
      (abs !== publicRoot && !abs.startsWith(publicRoot + sep)) ||
      !existsSync(abs) ||
      !statSync(abs).isFile()
    ) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("missing");
      return;
    }
    const type = abs.endsWith(".json") ? "application/json" : "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(abs).pipe(res);
  });
  return new Promise((resolveP) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolveP({
        origin: `http://127.0.0.1:${port}`,
        port,
        root: publicRoot,
        stop: () =>
          new Promise((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

export async function httpGetJson(origin, path) {
  const url = `${origin}${path}`;
  const res = await fetch(url);
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { url, status: res.status, body, text };
}
