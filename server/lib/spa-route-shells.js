import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// Exact public SPA paths that must return their own crawler-readable HTML.
// Add a route by appending one catalog object; do not hand-write a full HTML document.
export const ROUTE_SHELL_DIR = "route-shells";
export const SITE_ORIGIN = "https://samedaydesk.com";
export const HOME_TITLE = "SameDayDesk: agent commerce, built and shipped";
export const HOME_CANONICAL = `${SITE_ORIGIN}/`;
export const HOME_DESCRIPTION =
  "Agent-ready workflows, MCP servers, x402 and MPP payment routes, and machine storefronts. Bounded scope, working code, tests, and deployment handoff.";

const PUBLIC_SHELLS = [
  {
    path: "/for-agents",
    title: "Agent payment infrastructure | SameDayDesk",
    description: "Connect agents to SameDayDesk machine services through documented x402, MPP, MCP, and HTTP interfaces.",
    crawlerHtml: "<h1>SameDayDesk interfaces for agents</h1><p>Discover the live machine catalog, inspect payment requirements, and call documented services through the agent gateway.</p>",
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
    path: "/x402",
    title: "Agent Payment Infrastructure: x402 and MPP | SameDayDesk",
    description:
      "Twenty-two pay-per-call machine tools accepting both x402 and native MPP on Base, plus one alternate x402-only Circle Gateway route.",
    canonical: `${SITE_ORIGIN}/x402`,
    crawlerHtml: `
      <h1>Agents discover a service, call it, pay, and continue</h1>
      <p>
        Twenty-two deterministic tools for discovery, purchase safety, settlement evidence, security,
        research, and DeFi decisions. No API key, subscription, or account is required. Every canonical
        paid action accepts either x402 or native MPP, settles the same exact Base USDC amount, and
        returns a machine-readable result.
      </p>
      <p>
        The live catalog, x402 manifest, MPP OpenAPI, MCP tools, and A2A card describe the same
        twenty-two canonical actions. One Circle Gateway alternate exists for payment preflight; it is
        an alternate access path, not a twenty-third dual-rail product. Discovery is not authorization,
        settlement, demand, or revenue.
      </p>
      <ul>
        <li><a href="https://agents.samedaydesk.com/.well-known/x402">x402 resource manifest</a></li>
        <li><a href="https://samedaydesk.com/x402/seller-conformance">Seller conformance proof</a></li>
        <li><a href="https://samedaydesk.com/docs/x402-sdk/">x402 SDK integration reference</a></li>
      </ul>
    `,
  }),
  Object.freeze({
    path: "/x402/seller-conformance",
    title: "Seller conformance proof | SameDayDesk",
    description:
      "Inspect SameDayDesk seller-conformance evidence, including one recruited Agent402 payment that led to deployed upstream repairs, without confusing validation with organic or repeat demand.",
    canonical: `${SITE_ORIGIN}/x402/seller-conformance`,
    crawlerHtml: `
      <h1>Seller-conformance proof is inspection, not a guarantee</h1>
      <p>
        Existing SameDayDesk seller-conformance proof: inspect unpaid 402 terms, pin the integrity
        Action SHA, and separate release verification from marketplace listing, merged contract
        projection, deployment, settlement, demand, and revenue. This page is human-auditable
        inspection evidence. It is not a product, certificate, or runtime monitor.
      </p>
      <p>
        One recruited Agent402 payment led to deployed upstream repairs. That receipt does not prove
        organic demand, repeat use, or a repair sale.
      </p>
      <ul>
        <li><a href="https://samedaydesk.com/research/agent402-seller-integrity-validation-2026-08-29.json">Agent402 validation receipt</a></li>
        <li><a href="https://samedaydesk.com/x402">Agent payment infrastructure</a></li>
      </ul>
    `,
  }),
  Object.freeze({
    path: "/tools/ai-readiness",
    title: "Free AI Readiness Checker — is your site visible to ChatGPT & Perplexity? | SameDayDesk",
    description:
      "Free, no-signup AI readiness checker: see whether AI search engines (ChatGPT, Perplexity, Claude, Google AI) can crawl and understand your website. Scores AI crawler access, JSON-LD, metadata, sitemap and llms.txt, with concrete fixes.",
    canonical: `${SITE_ORIGIN}/tools/ai-readiness`,
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
  if (route.robots) html = upsertMetaContent(html, "robots", route.robots);
  html = replaceJsonLd(html, routeJsonLd(route));
  html = replaceNoscript(html, route.crawlerHtml);
  assertGeneratedShell(html, route, indexHtml);
  return html;
}

export function generateRouteShellsFromIndex(indexHtml, routes = [...SPA_ROUTE_SHELLS, NOT_FOUND_SHELL]) {
  assertRouteCatalog(routes);
  return routes.map((route) => ({
    route,
    fileName: shellFileName(route.path),
    html: applyRouteShell(indexHtml, route),
  }));
}

export function writeRouteShells(distDir, routes = [...SPA_ROUTE_SHELLS, NOT_FOUND_SHELL]) {
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

export function createRouteShellMiddleware(clientDist, routes = SPA_ROUTE_SHELLS) {
  assertRouteCatalog(routes);
  const map = new Map();
  for (const route of routes) {
    const file = shellFilePath(clientDist, route.path);
    if (existsSync(file)) map.set(route.path, file);
  }
  const missing = routes.filter((route) => !map.has(route.path)).map((route) => route.path);
  if (missing.length) {
    console.warn(`[route-shells] missing ${missing.join(", ")} under ${clientDist}`);
  }
  return function routeShellMiddleware(req, res, next) {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const file = map.get(req.path);
    if (!file) return next();
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(file, (err) => (err ? next(err) : undefined));
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
