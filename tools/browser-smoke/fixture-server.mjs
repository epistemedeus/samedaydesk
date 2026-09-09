import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  injectMockedRoot,
  mimeFor,
  rewriteSiteAnchors,
  stripCssModulesGlobal,
  unusedPort,
} from "./lib.mjs";
import { SPA_ROUTE_SHELLS, applyRouteShell } from "../../server/lib/spa-route-shells.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const clientDir = join(repoRoot, "client");
const publicDir = join(clientDir, "public");
const pagesDir = join(repoRoot, "tools/recurring-job-recipes/fixtures/pages");
const sourceIndex = readFileSync(join(clientDir, "index.html"), "utf8");

const CSS_FILES = Object.freeze({
  "/fixture-css/tokens.css": join(clientDir, "src/styles/tokens.css"),
  "/fixture-css/global.css": join(clientDir, "src/styles/global.css"),
  "/fixture-css/drafting.css": join(clientDir, "src/styles/drafting.css"),
  "/fixture-css/nav.css": join(clientDir, "src/components/Nav.module.css"),
  "/fixture-css/mcp.css": join(clientDir, "src/pages/Mcp.module.css"),
});

const CSS_HREFS = Object.keys(CSS_FILES);

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, headers);
  res.end(payload);
}

function safeJoin(root, requestPath) {
  const decoded = decodeURIComponent(requestPath);
  const abs = resolve(root, `.${decoded}`);
  const rel = relative(root, abs);
  if (rel.startsWith("..") || rel.startsWith(sep) || normalize(rel).includes(`..${sep}`)) return null;
  return abs;
}

function shellForPath(pathname) {
  return SPA_ROUTE_SHELLS.find((route) => route.path === pathname) ?? null;
}

export async function createMockedSdsOrigin({ port: requestedPort } = {}) {
  const port = requestedPort ?? (await unusedPort());
  const base = `http://127.0.0.1:${port}`;
  const shells = new Map();
  for (const route of SPA_ROUTE_SHELLS) {
    const applied = applyRouteShell(sourceIndex, route);
    const mocked = injectMockedRoot(applied, { crawlerHtml: route.crawlerHtml, cssHrefs: CSS_HREFS });
    shells.set(route.path, rewriteSiteAnchors(mocked, base));
  }
  const home = injectMockedRoot(sourceIndex, {
    crawlerHtml: sourceIndex.match(/<noscript>([\s\S]*?)<\/noscript>/i)?.[1] ?? "<h1>SameDayDesk</h1>",
    cssHrefs: CSS_HREFS,
  });
  shells.set("/", rewriteSiteAnchors(home, base));

  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", base);
    const pathname = url.pathname;

    if (pathname === "/healthz") {
      return send(res, 200, { ok: true, fixture: true, product: "samedaydesk", viewportLane: "browser-smoke" }, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
    }

    if (CSS_FILES[pathname]) {
      const css = stripCssModulesGlobal(readFileSync(CSS_FILES[pathname], "utf8"));
      return send(res, 200, css, { "content-type": "text/css; charset=utf-8", "cache-control": "no-store" });
    }

    if (pathname.startsWith("/fixture/pages/")) {
      const name = pathname.slice("/fixture/pages/".length);
      if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) {
        return send(res, 400, { error: "invalid_fixture_name" }, { "content-type": "application/json; charset=utf-8" });
      }
      const file = join(pagesDir, name);
      if (!existsSync(file)) {
        return send(res, 404, { error: "fixture_not_found", name }, { "content-type": "application/json; charset=utf-8" });
      }
      return send(res, 200, readFileSync(file), { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    }

    if (shells.has(pathname)) {
      return send(res, 200, shells.get(pathname), { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    }

    const publicFile = safeJoin(publicDir, pathname);
    if (publicFile && existsSync(publicFile) && statSync(publicFile).isFile()) {
      return send(res, 200, readFileSync(publicFile), { "content-type": mimeFor(publicFile), "cache-control": "no-store" });
    }

    send(res, 404, { error: "not_found", path: pathname }, { "content-type": "application/json; charset=utf-8" });
  });

  await new Promise((resolve, reject) => {
    server.listen(port, "127.0.0.1", resolve);
    server.once("error", reject);
  });

  return {
    base,
    port,
    repoRoot,
    routes: {
      health: `${base}/healthz`,
      forAgents: `${base}/for-agents`,
      x402: `${base}/x402`,
      sellerConformance: `${base}/x402/seller-conformance`,
      verified: `${base}/x402/verified`,
      aiReadiness: `${base}/tools/ai-readiness`,
      fixturePage: `${base}/fixture/pages/example-a.html`,
      fixturePartial: `${base}/fixture/pages/example-b-partial.html`,
    },
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = process.env.PORT ? Number(process.env.PORT) : undefined;
  const origin = await createMockedSdsOrigin({ port });
  process.stdout.write(`${JSON.stringify({ ok: true, ...origin.routes, port: origin.port, base: origin.base }, null, 2)}\n`);
  const stop = () => origin.close().finally(() => process.exit(0));
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
