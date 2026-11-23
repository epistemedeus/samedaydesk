import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { RECEIPT_SHELLS } from "../../client/src/data/receiptPages.mjs";
import { CONSUMER_REPEAT_SHELL, DISTRIBUTION_REPAIR_SHELL, FOR_AGENTS_SHELL, RECORD_REPEAT_SHELL, USEFUL_JOBS_SHELL, X402_SHELL } from "../../client/src/data/machineEntry.mjs";

// Exact public SPA paths that must return their own crawler-readable HTML.
// Add a route by appending one catalog object; do not hand-write a full HTML document.
// /for-agents and /x402 copy lives in client/src/data/machineEntry.mjs so React pages
// cannot drift from the initial HTML.
export const ROUTE_SHELL_DIR = "route-shells";
const PUBLIC_FIRST_RENDER_DIR = ".public-first-render";
export const SITE_ORIGIN = "https://samedaydesk.com";
export const HOME_TITLE = "SameDayDesk: make your business usable by AI";
export const HOME_CANONICAL = `${SITE_ORIGIN}/`;
export const HOME_DESCRIPTION =
  "When people ask ChatGPT or Claude to book, buy or look something up, your service answers and gets paid. Fixed prices from 149 USD, working the same day.";

const PUBLIC_SHELLS = [
  {
    path: FOR_AGENTS_SHELL.path,
    title: FOR_AGENTS_SHELL.title,
    description: FOR_AGENTS_SHELL.description,
    crawlerHtml: FOR_AGENTS_SHELL.crawlerHtml,
    ogImage: "/og/for-agents.png",
  },
  {
    path: "/receipts",
    title: "Receipts: work delivered and paid for | SameDayDesk",
    description: "Every paid call settled on Base and every piece of delivered work, each with its proof.",
    crawlerHtml: "<h1>Work delivered, and paid for.</h1><p>Every line links its proof. For agents: <a href=\"/receipts.json\">/receipts.json</a>.</p>",
    ogImage: "/og/receipts.png",
  },
  {
    path: RECORD_REPEAT_SHELL.path,
    title: RECORD_REPEAT_SHELL.title,
    description: RECORD_REPEAT_SHELL.description,
    crawlerHtml: RECORD_REPEAT_SHELL.crawlerHtml,
  },
  {
    path: DISTRIBUTION_REPAIR_SHELL.path,
    title: DISTRIBUTION_REPAIR_SHELL.title,
    description: DISTRIBUTION_REPAIR_SHELL.description,
    crawlerHtml: DISTRIBUTION_REPAIR_SHELL.crawlerHtml,
  },
  {
    path: CONSUMER_REPEAT_SHELL.path,
    title: CONSUMER_REPEAT_SHELL.title,
    description: CONSUMER_REPEAT_SHELL.description,
    crawlerHtml: CONSUMER_REPEAT_SHELL.crawlerHtml,
  },
  {
    path: USEFUL_JOBS_SHELL.path,
    title: USEFUL_JOBS_SHELL.title,
    description: USEFUL_JOBS_SHELL.description,
    crawlerHtml: USEFUL_JOBS_SHELL.crawlerHtml,
  },
  {
    path: "/terms",
    title: "Terms of Service | SameDayDesk",
    description: "Read the terms that govern use of the SameDayDesk website and services.",
    crawlerHtml: "<h1>Terms of Service</h1><p>Terms for use of the SameDayDesk website and services.</p>",
  },
  {
    path: "/privacy",
    title: "Privacy Policy | SameDayDesk",
    description: "Read how SameDayDesk handles information associated with its website and services.",
    crawlerHtml: "<h1>Privacy Policy</h1><p>Privacy information for the SameDayDesk website and services.</p>",
  },
].map((route) => ({ ...route, canonical: `${SITE_ORIGIN}${route.path}` }));

const ACCOUNT_SHELLS = [
  ["/login", "Log in | SameDayDesk", "Log in to an existing SameDayDesk account."],
  ["/signup", "Create an account | SameDayDesk", "Create a SameDayDesk account."],
  ["/dashboard", "Account dashboard | SameDayDesk", "Open the SameDayDesk account dashboard."],
  ["/checkout", "Checkout | SameDayDesk", "Complete an authenticated SameDayDesk order."],
].map(([routePath, title, description]) => ({
  path: routePath,
  title,
  description,
  canonical: `${SITE_ORIGIN}${routePath}`,
  robots: "noindex,follow",
  crawlerHtml: `<h1>${title.replace(" | SameDayDesk", "")}</h1><p>${description}</p>`,
}));

export const SPA_ROUTE_SHELLS = Object.freeze([
  Object.freeze({
    path: X402_SHELL.path,
    title: X402_SHELL.title,
    description: X402_SHELL.description,
    canonical: X402_SHELL.canonical,
    crawlerHtml: X402_SHELL.crawlerHtml,
    ogImage: "/og/x402.png",
  }),
  Object.freeze({
    path: "/x402/seller-conformance",
    title: "Seller audit: get paid by AI agents | SameDayDesk",
    description:
      "We call your paid endpoint the way a buying AI agent does and send you exactly what to fix. Live audit 0.01 USDC; fixed repair of one route 490 USD. Agent402 bought one audit and repaired 557 routes.",
    canonical: `${SITE_ORIGIN}/x402/seller-conformance`,
    crawlerHtml: `
      <h1>Find out why AI agents can't pay you, and fix it</h1>
      <p>
        We call your paid endpoint the way a buying agent does, read the payment terms it gets back,
        and send you exactly what to change. A live audit is 0.01 USDC a call. A fixed repair of one
        route is 490 USD, and it works or we keep fixing it.
      </p>
      <p>
        Agent402 bought one audit, then repaired the seller contract and deployed a catalog repair
        across 557 of 560 production routes.
      </p>
      <ul>
        <li><a href="https://samedaydesk.com/research/agent402-seller-integrity-validation-2026-08-29.json">Agent402 payment receipt</a></li>
        <li><a href="https://samedaydesk.com/x402/seller-conformance/?resolved=gentech-defi-slash-20260912">Gentech DeFi, fixed in the open</a></li>
        <li><a href="https://samedaydesk.com/x402/verified">Routes we checked</a></li>
        <li><a href="https://samedaydesk.com/x402">Paid tools for AI agents</a></li>
      </ul>
    `,
  }),
  Object.freeze({
    path: "/x402/verified",
    title: "Checked x402 routes | SameDayDesk",
    description:
      "Every SameDayDesk paid route, checked the way a buying agent meets it: live 402 terms, contract hash, OpenAPI and CDP Bazaar listing, with a machine-readable feed.",
    canonical: `${SITE_ORIGIN}/x402/verified`,
    crawlerHtml: `
      <h1>Every paid route, checked as an agent meets it</h1>
      <p>
        Each row is one of our paid routes with its live 402 terms and contract hash, whether its
        operation appears in our OpenAPI, and whether CDP Bazaar lists it within the last seven days.
        The badge reads verified, drift or unverified.
      </p>
      <ul>
        <li><a href="https://samedaydesk.com/x402/verified.json">Machine-readable feed</a></li>
        <li><a href="https://samedaydesk.com/x402/verified.schema.json">Feed schema</a></li>
        <li><a href="https://samedaydesk.com/x402/seller-conformance">Seller audit</a></li>
      </ul>
    `,
  }),
  Object.freeze({
    path: "/tools/ai-readiness",
    title: "Free AI Readiness Checker: is your site visible to ChatGPT & Perplexity? | SameDayDesk",
    description:
      "Free, no-signup AI readiness checker: see whether AI search engines (ChatGPT, Perplexity, Claude, Google AI) can crawl and understand your website. Scores AI crawler access, JSON-LD, metadata, sitemap and llms.txt, with concrete fixes.",
    canonical: `${SITE_ORIGIN}/tools/ai-readiness`,
    ogImage: "/og/ai-readiness.png",
    crawlerHtml: `
      <h1>Is your site visible to AI search?</h1>
      <p>
        ChatGPT, Perplexity, Claude and Google AI are becoming how buyers find things. This free
        check tells you whether AI engines can crawl and understand your site, and what to fix. No
        email required.
      </p>
      <p>
        It fetches your homepage and robots.txt and checks whether AI crawlers (GPTBot, ClaudeBot,
        PerplexityBot, Google-Extended) are allowed, and whether you have JSON-LD structured data, a
        clear title and meta description, Open Graph tags, an XML sitemap, and an llms.txt file.
      </p>
      <p>
        llms.txt is cheap hygiene for developer tools and has no proven effect on AI citations today.
      </p>
    `,
  }),
  ...PUBLIC_SHELLS.map(Object.freeze),
  ...ACCOUNT_SHELLS.map(Object.freeze),
]);

// One shell per tape entry (/receipts/<id>), from the same module the React page reads.
export const RECEIPT_ROUTE_SHELLS = Object.freeze(
  RECEIPT_SHELLS.map(({ id: _id, ...route }) => Object.freeze({ ...route, canonical: `${SITE_ORIGIN}${route.path}` })),
);

export const NOT_FOUND_SHELL = Object.freeze({
  path: "/404",
  title: "Not found | SameDayDesk",
  description: "The requested SameDayDesk page could not be found.",
  canonical: `${SITE_ORIGIN}/404`,
  robots: "noindex,follow",
  crawlerHtml: "<h1>Not found</h1><p>The requested page does not exist.</p>",
});

export function shellFileName(routePath) {
  if (typeof routePath !== "string" || !routePath.startsWith("/") || routePath === "/") {
    throw new Error(`route-shells: invalid path ${routePath}`);
  }
  if (routePath.endsWith("/") || routePath.includes("?") || routePath.includes("#")) {
    throw new Error(`route-shells: path must be exact and extensionless: ${routePath}`);
  }
  return `${routePath.slice(1).replaceAll("/", "__")}.html`;
}

export function shellFilePath(clientDist, routePath) {
  return path.join(clientDist, ROUTE_SHELL_DIR, shellFileName(routePath));
}

export function publicFirstRenderPath(clientDist, routePath) {
  return path.join(clientDist, ROUTE_SHELL_DIR, PUBLIC_FIRST_RENDER_DIR, routePath === "/" ? "home.html" : shellFileName(routePath));
}

// The buy page is one route whose content is chosen by ?offer=. Each offer the page sells gets its
// own first render, served only for that exact query.
export const BUY_PATH = "/care/buy";
export function buyFirstRenderPath(clientDist, offer) {
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(String(offer))) throw new Error(`route-shells: invalid offer ${offer}`);
  return path.join(clientDist, ROUTE_SHELL_DIR, PUBLIC_FIRST_RENDER_DIR, `care__buy--${offer}.html`);
}

export function assertRouteCatalog(routes = SPA_ROUTE_SHELLS) {
  const seen = new Set();
  for (const route of routes) {
    if (!route || typeof route !== "object") throw new Error("route-shells: catalog entry must be an object");
    shellFileName(route.path);
    if (seen.has(route.path)) throw new Error(`route-shells: duplicate path ${route.path}`);
    seen.add(route.path);
    for (const key of ["title", "description", "canonical", "crawlerHtml"]) {
      if (typeof route[key] !== "string" || route[key].trim().length === 0) {
        throw new Error(`route-shells: ${route.path} missing ${key}`);
      }
    }
    let canonicalUrl;
    try {
      canonicalUrl = new URL(route.canonical);
    } catch {
      throw new Error(`route-shells: ${route.path} canonical is not a URL`);
    }
    if (canonicalUrl.origin !== SITE_ORIGIN) {
      throw new Error(`route-shells: ${route.path} canonical origin must be ${SITE_ORIGIN}`);
    }
    if (canonicalUrl.pathname !== route.path || canonicalUrl.search || canonicalUrl.hash) {
      throw new Error(`route-shells: ${route.path} canonical must equal ${SITE_ORIGIN}${route.path}`);
    }
  }
  return routes;
}

export function inspectHtmlShell(html) {
  const source = String(html);
  const titleRaw = (source.match(/<title>([\s\S]*?)<\/title>/i) || [])[1];
  const noscriptRaw = (source.match(/<noscript>([\s\S]*?)<\/noscript>/i) || [])[1];
  const jsonLdRaw = [];
  const jsonLdRe = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let jsonLdMatch;
  while ((jsonLdMatch = jsonLdRe.exec(source))) jsonLdRaw.push(jsonLdMatch[1]);
  const scripts = [];
  const scriptRe = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let scriptMatch;
  while ((scriptMatch = scriptRe.exec(source))) scripts.push(scriptMatch[1]);
  const stylesheets = [];
  const linkRe = /<link\b[^>]*>/gi;
  let linkMatch;
  while ((linkMatch = linkRe.exec(source))) {
    const tag = linkMatch[0];
    if (!/\brel\s*=\s*["']stylesheet["']/i.test(tag)) continue;
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (href) stylesheets.push(href[1]);
  }
  return {
    title: unescapeHtml(titleRaw || "").trim(),
    canonical: extractLinkHref(source, "canonical"),
    description: extractMetaContent(source, "name", "description"),
    ogUrl: extractMetaContent(source, "property", "og:url"),
    ogTitle: extractMetaContent(source, "property", "og:title"),
    ogDescription: extractMetaContent(source, "property", "og:description"),
    twitterTitle: extractMetaContent(source, "name", "twitter:title"),
    twitterDescription: extractMetaContent(source, "name", "twitter:description"),
    robots: extractMetaContent(source, "name", "robots"),
    noscript: noscriptRaw || "",
    jsonLdRaw,
    scripts,
    stylesheets,
  };
}

export function applyRouteShell(indexHtml, route) {
  assertRouteCatalog([route]);
  if (typeof indexHtml !== "string" || !indexHtml.includes('<div id="root">')) {
    throw new Error("route-shells: index.html must contain #root so the React app still mounts");
  }
  const ogTitle = route.ogTitle || route.title;
  const ogDescription = route.ogDescription || route.description;
  let html = indexHtml;
  html = replaceTitle(html, route.title);
  html = replaceMetaContent(html, "name", "description", route.description);
  html = replaceCanonical(html, route.canonical);
  html = replaceMetaContent(html, "property", "og:title", ogTitle);
  html = replaceMetaContent(html, "property", "og:description", ogDescription);
  html = replaceMetaContent(html, "property", "og:url", route.canonical);
  html = replaceMetaContent(html, "name", "twitter:title", ogTitle);
  html = replaceMetaContent(html, "name", "twitter:description", ogDescription);
  if (route.ogImage) {
    html = replaceMetaContent(html, "property", "og:image", `${SITE_ORIGIN}${route.ogImage}`);
    html = replaceMetaContent(html, "name", "twitter:image", `${SITE_ORIGIN}${route.ogImage}`);
  }
  if (route.robots) html = upsertMetaContent(html, "robots", route.robots);
  html = replaceJsonLd(html, routeJsonLd(route));
  html = replaceNoscript(html, route.crawlerHtml);
  assertGeneratedShell(html, route, indexHtml);
  return html;
}

export function generateRouteShellsFromIndex(indexHtml, routes = [...SPA_ROUTE_SHELLS, ...RECEIPT_ROUTE_SHELLS, NOT_FOUND_SHELL]) {
  assertRouteCatalog(routes);
  return routes.map((route) => ({
    route,
    fileName: shellFileName(route.path),
    html: applyRouteShell(indexHtml, route),
  }));
}

export function writeRouteShells(distDir, routes = [...SPA_ROUTE_SHELLS, ...RECEIPT_ROUTE_SHELLS, NOT_FOUND_SHELL]) {
  const indexPath = path.join(distDir, "index.html");
  if (!existsSync(indexPath)) {
    throw new Error(`route-shells: missing ${indexPath}; run the Vite build first`);
  }
  const before = readFileSync(indexPath, "utf8");
  const generated = generateRouteShellsFromIndex(before, routes);
  const dir = path.join(distDir, ROUTE_SHELL_DIR);
  mkdirSync(dir, { recursive: true });
  const written = [];
  for (const item of generated) {
    const filePath = path.join(dir, item.fileName);
    writeFileSync(filePath, item.html);
    written.push({
      path: item.route.path,
      fileName: item.fileName,
      relativeFile: path.join(ROUTE_SHELL_DIR, item.fileName),
      bytes: Buffer.byteLength(item.html),
    });
  }
  const after = readFileSync(indexPath, "utf8");
  if (after !== before) {
    throw new Error("route-shells: refused to leave dist/index.html modified");
  }
  return written;
}

export function createRouteShellMiddleware(clientDist, routes = [...SPA_ROUTE_SHELLS, ...RECEIPT_ROUTE_SHELLS]) {
  assertRouteCatalog(routes);
  const map = new Map();
  const firstRender = new Map();
  for (const routePath of ["/", ...routes.filter((route) => !route.robots).map((route) => route.path)]) {
    const file = publicFirstRenderPath(clientDist, routePath);
    if (existsSync(file)) firstRender.set(routePath, file);
  }
  for (const route of routes) {
    const file = shellFilePath(clientDist, route.path);
    if (existsSync(file)) map.set(route.path, file);
  }
  const buyRenders = new Map();
  const buyRender = (offer) => {
    if (!buyRenders.has(offer)) {
      let file = null;
      try { file = buyFirstRenderPath(clientDist, offer); } catch { /* not an offer name */ }
      buyRenders.set(offer, file && existsSync(file) ? file : null);
    }
    return buyRenders.get(offer);
  };
  const missing = routes.filter((route) => !map.has(route.path)).map((route) => route.path);
  if (missing.length) {
    console.warn(`[route-shells] missing ${missing.join(", ")} under ${clientDist}`);
  }
  return function routeShellMiddleware(req, res, next) {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    // A query can select different content. Keep that request on the normal
    // shell so a canonical anonymous snapshot never masks the requested view.
    const offer = req.path === BUY_PATH && Object.keys(req.query).length === 1 && typeof req.query.offer === "string" ? req.query.offer : null;
    const file = (offer && buyRender(offer)) || (!req.originalUrl.includes("?") && firstRender.get(req.path)) || map.get(req.path);
    if (!file) return next();
    // Preserve privacy headers already set by the owning route (including Care).
    if (!res.hasHeader("Cache-Control")) res.setHeader("Cache-Control", "no-cache");
    res.sendFile(file, { dotfiles: "allow" }, (err) => (err ? next(err) : undefined));
  };
}

function routeJsonLd(route) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_ORIGIN}/#org`,
        "name": "SameDayDesk",
        "url": HOME_CANONICAL,
      },
      {
        "@type": "WebPage",
        "@id": `${route.canonical}#webpage`,
        "url": route.canonical,
        "name": route.title,
        "description": route.description,
        "isPartOf": { "@id": `${SITE_ORIGIN}/#site` },
        "publisher": { "@id": `${SITE_ORIGIN}/#org` },
      },
    ],
  };
}

function assertGeneratedShell(html, route, indexHtml) {
  const info = inspectHtmlShell(html);
  const indexInfo = inspectHtmlShell(indexHtml);
  if (info.title !== route.title) {
    throw new Error(`route-shells: ${route.path} title mismatch`);
  }
  if (info.description !== route.description) {
    throw new Error(`route-shells: ${route.path} description mismatch`);
  }
  if (info.canonical !== route.canonical) {
    throw new Error(`route-shells: ${route.path} canonical mismatch`);
  }
  if (info.ogUrl !== route.canonical || info.ogTitle !== (route.ogTitle || route.title)) {
    throw new Error(`route-shells: ${route.path} Open Graph mismatch`);
  }
  if (info.ogDescription !== (route.ogDescription || route.description)) {
    throw new Error(`route-shells: ${route.path} og:description mismatch`);
  }
  if (info.title === HOME_TITLE || info.canonical === HOME_CANONICAL) {
    throw new Error(`route-shells: ${route.path} still carries homepage identity`);
  }
  if (!info.noscript.includes(route.crawlerHtml.match(/<h1>[\s\S]*?<\/h1>/)[0])) {
    throw new Error(`route-shells: ${route.path} missing crawler h1`);
  }
  if (info.noscript.includes("SameDayDesk: make your service ready for agents")) {
    throw new Error(`route-shells: ${route.path} still has homepage crawler copy`);
  }
  if (html.includes("hasOfferCatalog") || html.includes("Agent Workflow Integration")) {
    throw new Error(`route-shells: ${route.path} still has homepage offer catalog`);
  }
  if (!html.includes('<div id="root">')) {
    throw new Error(`route-shells: ${route.path} dropped #root`);
  }
  if (JSON.stringify(info.scripts) !== JSON.stringify(indexInfo.scripts)) {
    throw new Error(`route-shells: ${route.path} changed script tags`);
  }
}

function replaceTitle(html, title) {
  if (!/<title>[\s\S]*?<\/title>/i.test(html)) throw new Error("route-shells: missing <title>");
  return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
}

function replaceCanonical(html, href) {
  const tagRe = /<link\b[^>]*>/gi;
  let count = 0;
  const next = html.replace(tagRe, (tag) => {
    if (!/\brel\s*=\s*(["']?)canonical\1/i.test(tag)) return tag;
    count += 1;
    if (/\bhref\s*=\s*(["'])[\s\S]*?\1/i.test(tag)) {
      return tag.replace(/\bhref\s*=\s*(["'])[\s\S]*?\1/i, `href="${escapeHtml(href)}"`);
    }
    return tag.replace(/\s*\/?>$/, ` href="${escapeHtml(href)}" />`);
  });
  if (count !== 1) throw new Error(`route-shells: expected 1 canonical link, found ${count}`);
  return next;
}

function replaceMetaContent(html, attrName, attrValue, content) {
  const tagRe = /<meta\b[^>]*>/gi;
  let count = 0;
  const attr = new RegExp(`\\b${attrName}\\s*=\\s*(["'])${escapeRegExp(attrValue)}\\1`, "i");
  const next = html.replace(tagRe, (tag) => {
    if (!attr.test(tag)) return tag;
    count += 1;
    if (/\bcontent\s*=\s*(["'])[\s\S]*?\1/i.test(tag)) {
      return tag.replace(/\bcontent\s*=\s*(["'])[\s\S]*?\1/i, `content="${escapeHtml(content)}"`);
    }
    return tag.replace(/\s*\/?>$/, ` content="${escapeHtml(content)}" />`);
  });
  if (count !== 1) {
    throw new Error(`route-shells: expected 1 <meta ${attrName}="${attrValue}">, found ${count}`);
  }
  return next;
}

function upsertMetaContent(html, name, content) {
  if (new RegExp(`<meta\\b[^>]*\\bname=["']${escapeRegExp(name)}["']`, "i").test(html)) {
    return replaceMetaContent(html, "name", name, content);
  }
  return html.replace(/<\/head>/i, `    <meta name="${escapeHtml(name)}" content="${escapeHtml(content)}">\n  </head>`);
}

function replaceJsonLd(html, json) {
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/i;
  if (!re.test(html)) throw new Error("route-shells: missing JSON-LD script");
  return html.replace(
    re,
    `<script type="application/ld+json">\n${JSON.stringify(json, null, 2)}\n    </script>`,
  );
}

function replaceNoscript(html, inner) {
  const re = /<noscript>[\s\S]*?<\/noscript>/i;
  if (!re.test(html)) throw new Error("route-shells: missing <noscript>");
  return html.replace(re, `<noscript>\n${inner.trim()}\n    </noscript>`);
}

function extractMetaContent(html, attrName, attrValue) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  const attr = new RegExp(`\\b${attrName}\\s*=\\s*(["'])${escapeRegExp(attrValue)}\\1`, "i");
  for (const tag of tags) {
    if (!attr.test(tag)) continue;
    const content = tag.match(/\bcontent\s*=\s*(["'])([\s\S]*?)\1/i);
    if (content) return unescapeHtml(content[2]);
  }
  return null;
}

function extractLinkHref(html, rel) {
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  const relRe = new RegExp(`\\brel\\s*=\\s*(["']?)${escapeRegExp(rel)}\\1`, "i");
  for (const tag of tags) {
    if (!relRe.test(tag)) continue;
    const href = tag.match(/\bhref\s*=\s*(["'])([\s\S]*?)\1/i);
    if (href) return unescapeHtml(href[2]);
  }
  return null;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function unescapeHtml(value) {
  return String(value)
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
