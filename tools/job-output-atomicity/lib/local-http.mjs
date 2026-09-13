import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { join, normalize, relative, resolve, sep } from "node:path";
import { isInsideRoot } from "./paths.mjs";

function contentType(filePath) {
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".md")) return "text/markdown; charset=utf-8";
  return "application/octet-stream";
}

/**
 * Real local HTTP directory server. Serves only files inside `root`.
 * Not a stand-in for an external mailbox.
 */
export function serveDirectory(root, { host = "127.0.0.1" } = {}) {
  const realRoot = resolve(root);
  const server = createServer((req, res) => {
    const urlPath = decodeURIComponent(String(req.url || "/").split("?")[0]);
    const rel = urlPath.replace(/^\/+/, "");
    if (rel.includes("..") || rel.startsWith(`..${sep}`)) {
      res.writeHead(400).end("bad path");
      return;
    }
    const filePath = rel ? join(realRoot, rel) : join(realRoot, "receipt.json");
    const normalized = normalize(filePath);
    if (!isInsideRoot(realRoot, normalized)) {
      res.writeHead(403).end("escape");
      return;
    }
    if (!existsSync(normalized) || !statSync(normalized).isFile()) {
      res.writeHead(404).end("missing");
      return;
    }
    res.writeHead(200, { "content-type": contentType(normalized) });
    createReadStream(normalized).pipe(res);
  });
  return new Promise((resolveListen) => {
    server.listen(0, host, () => {
      const addr = server.address();
      resolveListen({
        server,
        host,
        port: addr.port,
        origin: `http://${host}:${addr.port}`,
        close: () =>
          new Promise((resolveClose, reject) => {
            server.close((err) => (err ? reject(err) : resolveClose()));
          }),
      });
    });
  });
}

export { relative };
