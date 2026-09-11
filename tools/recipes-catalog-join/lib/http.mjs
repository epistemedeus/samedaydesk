import http from "node:http";
import { readdirSync, readFileSync } from "node:fs";
import { PUBLISHED } from "./paths.mjs";

function send(res, status, body, type = "application/json; charset=utf-8") {
  const buf = Buffer.from(body);
  res.writeHead(status, {
    "content-type": type,
    "content-length": String(buf.length),
    "cache-control": "no-store",
  });
  res.end(buf);
}

/**
 * Loopback HTTP of the published SDS files. Not a fixture rewrite.
 */
export function servePublishedSurfaces({
  catalogPath = PUBLISHED.catalog,
  specsDir = PUBLISHED.recipeSpecsDir,
  familiesDoc = PUBLISHED.familiesDoc,
  familyDiscovery = PUBLISHED.familyDiscovery,
  matrixPath = PUBLISHED.offerMatrix,
  pageChangeJob = PUBLISHED.pageChangeJob,
} = {}) {
  const specFiles = readdirSync(specsDir).filter((n) => n.endsWith(".recipe.json")).sort();
  const catalog = readFileSync(catalogPath);
  const families = readFileSync(familiesDoc);
  const discovery = readFileSync(familyDiscovery);
  const matrix = readFileSync(matrixPath);
  const pageChange = readFileSync(pageChangeJob);
  const specBodies = new Map(specFiles.map((name) => [name, readFileSync(joinSafe(specsDir, name))]));

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (req.method !== "GET") {
      send(res, 405, JSON.stringify({ ok: false, error: "method_not_allowed" }));
      return;
    }
    if (url.pathname === "/catalog.json") {
      send(res, 200, catalog);
      return;
    }
    if (url.pathname === "/families.md") {
      send(res, 200, families, "text/markdown; charset=utf-8");
      return;
    }
    if (url.pathname === "/family-discovery.json") {
      send(res, 200, discovery);
      return;
    }
    if (url.pathname === "/matrix.json") {
      send(res, 200, matrix);
      return;
    }
    if (url.pathname === "/jobs/page-change-evidence.json") {
      send(res, 200, pageChange);
      return;
    }
    if (url.pathname === "/recipes/index.json") {
      send(res, 200, JSON.stringify({ files: specFiles }));
      return;
    }
    const recipe = url.pathname.match(/^\/recipes\/([^/]+\.recipe\.json)$/);
    if (recipe && specBodies.has(recipe[1])) {
      send(res, 200, specBodies.get(recipe[1]));
      return;
    }
    send(res, 404, JSON.stringify({ ok: false, error: "not_found" }));
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        origin: `http://127.0.0.1:${port}`,
        specFiles,
        stop: () =>
          new Promise((done, reject) => {
            server.close((err) => (err ? reject(err) : done()));
          }),
      });
    });
  });
}

function joinSafe(dir, name) {
  if (name.includes("/") || name.includes("\\") || name.includes("..")) {
    throw new Error("unsafe_spec_name");
  }
  return `${dir}/${name}`;
}
