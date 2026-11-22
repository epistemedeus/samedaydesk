import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";
import { buyFirstRenderPath, publicFirstRenderPath, shellFilePath, SPA_ROUTE_SHELLS } from "../../server/lib/spa-route-shells.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = join(root, "dist");
const manifest = JSON.parse(await readFile(join(dist, ".vite/manifest.json"), "utf8"));
const routes = new Map(SPA_ROUTE_SHELLS.map((item) => [item.path, item]));
const home = join(dist, "index.html");
const rootSlot = '<div id="root"></div>';

function declaredAsset(name) {
  if (!/^assets\/[A-Za-z0-9_./-]+$/.test(name) || name.split("/").some((p) => !p || p === "." || p === "..")) {
    throw new Error("Invalid prerender asset path");
  }
  return `/${name}`;
}

async function criticalTypeLinks() {
  const built = await readdir(join(dist, "assets"));
  return ["space-grotesk", "inter", "jetbrains-mono"].map((family) => {
    const hashPrefix = `${family}-latin-wght-normal-`;
    const variants = built.filter((name) => name.startsWith(hashPrefix) && name.endsWith(".woff2"));
    if (variants.length !== 1) throw new Error(`Missing unique Latin type asset: ${family}`);
    return `<link rel="preload" as="font" href="${declaredAsset(`assets/${variants[0]}`)}" type="font/woff2" crossorigin>`;
  }).join("\n");
}

function preloadFor(entry) {
  const seen = new Set(), sheets = new Set(), modules = new Set();
  function receive(key) {
    if (seen.has(key)) return;
    seen.add(key);
    const row = manifest[key];
    if (!row) throw new Error(`Missing browser build entry: ${key}`);
    for (const imported of row.imports ?? []) receive(imported);
    for (const css of row.css ?? []) sheets.add(declaredAsset(css));
    modules.add(declaredAsset(row.file));
  }
  receive(entry);
  return [...[...sheets].map((name) => `<link rel="stylesheet" crossorigin href="${name}">`),
    ...[...modules].map((name) => `<link rel="modulepreload" crossorigin href="${name}">`)].join("\n");
}

const scratch = await mkdtemp(join(root, ".public-render-"));
try {
  await build({ root, build: { ssr: join(root, "src/prerender.tsx"), outDir: scratch,
    emptyOutDir: false, manifest: false, copyPublicDir: false } });
  const { renderPublicPages, renderBuyPages } = await import(pathToFileURL(join(scratch, "prerender.js")).href);
  const rendered = await renderPublicPages();
  const typeLinks = await criticalTypeLinks();
  const seen = new Set();
  for (const { path, entry, html } of rendered) {
    const route = routes.get(path);
    if (!/^\/(?:[a-z0-9/-]*[a-z0-9])?$/.test(path) || seen.has(path) || (path !== "/" && (!route || route.robots))) {
      throw new Error(`Unexpected public render target: ${path}`);
    }
    seen.add(path);
    const target = publicFirstRenderPath(dist, path);
    const shell = await readFile(path === "/" ? home : shellFilePath(dist, path), "utf8");
    if (shell.split(rootSlot).length !== 2 || shell.includes('name="sdd-public-first-render"')) throw new Error(`Bad render slot: ${path}`);
    const head = `<meta name="sdd-public-first-render" content="${path}">\n${preloadFor(entry)}\n` +
      '<noscript><style>#root { display: none }</style></noscript>\n';
    // Every anonymous template shares the display, body and mono faces above
    // the fold. Discover the existing Latin subsets before stylesheet parsing,
    // including home and receipts; private/query-selected shells stay untouched.
    if (!shell.includes("</title>")) throw new Error(`Missing title slot: ${path}`);
    const fontsReady = shell.replace("</title>", `</title>\n${typeLinks}`);
    const filled = fontsReady.replace(rootSlot, () => `<div id="root">${html}</div>`).replace("</head>", `${head}</head>`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, filled);
  }
  if (!seen.has("/")) throw new Error("The public home render is required");
  // Buy pages: the home shell with the offer's title, rendered with the main entry. The client
  // renders afresh on load (a query is present), so this is the first paint, not a hydration.
  const homeShell = await readFile(home, "utf8");
  const escape = (text) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  for (const { offer, title, html } of renderBuyPages()) {
    const head = `<meta name="sdd-buy-first-render" content="${offer}">\n${preloadFor("index.html")}\n<meta name="robots" content="noindex">\n`;
    const filled = homeShell.replace(/<title>[^<]*<\/title>/, `<title>${escape(title)}</title>\n${typeLinks}`)
      .replace(rootSlot, () => `<div id="root">${html}</div>`).replace("</head>", `${head}</head>`);
    if (!filled.includes(`<title>${escape(title)}</title>`) || !filled.includes(html)) throw new Error(`Bad buy render: ${offer}`);
    const target = buyFirstRenderPath(dist, offer);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, filled);
  }
  console.log(`[public-render] ${seen.size} verified anonymous route documents`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
