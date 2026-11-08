import { BoundedFetchError, createRequestBudget, fetchPublicBounded } from "./bounded-fetch.js";
import { normalizeHostInput } from "./probe.js";
import { consumeClient } from "./rate-limit.js";
import { classifyRetrieval, contentTypeOf, isHtmlDocument } from "./retrieval.js";
import { classifySitemap, parseRobotsSitemaps } from "./sitemap-discovery.js";
import { summarizeStaticHtml } from "./static-summary.js";

const TEXT_TYPES = new Set(["text/plain", "text/markdown"]);
const SITEMAP_PATHS = ["/sitemap.xml", "/sitemap-index.xml"];

function outcome(response) {
  return classifyRetrieval({ ...response, truncated: response.oversize }).kind;
}

function check(id, status, reason, fix) {
  return { id, status, reason, ...(fix ? { fix } : {}) };
}

function homepage(response) {
  if (outcome(response) === "absent") {
    return check("homepage", "fail", "GET / did not find a page.", "Serve a public documentation entry page at the tested origin.");
  }
  if (outcome(response) !== "retrieved") return check("homepage", "unknown", "The homepage could not be read within this check.");
  if (!isHtmlDocument(response)) {
    return check("homepage", "unknown", "The homepage was not HTML. This check only assesses HTML text without scripts.");
  }
  const body = response.body.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1] ?? "";
  const { wordCount } = summarizeStaticHtml(body);
  return wordCount > 0
    ? check("homepage", "pass", "The HTML body contains text without executing scripts. Documentation completeness was not checked.")
    : check("homepage", "warn", "No text was found in the HTML body without executing scripts.", "Expose the introductory text and a link to the docs in the initial HTML.");
}

function llmsIndex(response) {
  if (outcome(response) === "absent") {
    return check("llms-index", "warn", "No /llms.txt was found. This file is optional.", "If a concise index would help readers, publish /llms.txt with links to the relevant documentation.");
  }
  if (outcome(response) !== "retrieved") return check("llms-index", "unknown", "The index could not be read. This does not establish that it is missing.");
  if (!TEXT_TYPES.has(contentTypeOf(response)) || isHtmlDocument(response) || !/^#[ \t]+\S/.test(response.body.replace(/^\uFEFF/, ""))) {
    return check("llms-index", "warn", "The response is not a plain-text or Markdown index starting with an H1.", "Serve the actual /llms.txt as plain text or Markdown, with an H1 naming the site.");
  }
  return check("llms-index", "pass", "A text index with an H1 was received. Its links were not followed.");
}

function sitemapShape(response) {
  if (outcome(response) !== "retrieved" || isHtmlDocument(response)) return null;
  const root = /^\s*(?:<\?xml[^>]*\?>\s*)?<(sitemapindex|urlset)\b/i.exec(response.body)?.[1]?.toLowerCase();
  if (!root || !response.body.trimEnd().toLowerCase().endsWith(`</${root}>`)) return null;
  const { kind, locs } = classifySitemap(response.body);
  return kind === (root === "sitemapindex" ? "index" : "urlset") && locs.length > 0 ? kind : null;
}

async function sitemap(origin, robots, get) {
  const readable = outcome(robots) === "retrieved" && contentTypeOf(robots) === "text/plain" && !isHtmlDocument(robots);
  const advertised = readable ? parseRobotsSitemaps(robots.body) : [];
  const local = [...new Set(advertised.flatMap((line) => {
    try {
      const url = new URL(line);
      return url.origin === origin && !url.username && !url.password && !url.search && !url.hash ? [url.pathname] : [];
    } catch { return []; }
  }))].slice(0, 2);
  const declared = await Promise.all(local.map(async (path) => ({ path, shape: sitemapShape(await get(path)) })));
  const found = declared.find((row) => row.shape);
  if (found) {
    return check("sitemap-discovery", "pass", `robots.txt advertises a readable ${found.shape} sitemap document at ${found.path}. Sitemap entries were not followed.`);
  }
  const fallback = await Promise.all(SITEMAP_PATHS.filter((path) => !local.includes(path)).map(async (path) => ({ path, shape: sitemapShape(await get(path)) })));
  const existing = fallback.find((row) => row.shape);
  if (existing && readable && advertised.length === 0) {
    return check("sitemap-discovery", "warn", `A readable ${existing.shape} sitemap document exists at ${existing.path}, but robots.txt does not advertise a sitemap.`, `Advertise the existing file in robots.txt: Sitemap: ${origin}${existing.path}`);
  }
  return check("sitemap-discovery", "unknown", existing
    ? `A readable ${existing.shape} sitemap document exists at ${existing.path}; the advertised route was not verified.`
    : "No readable sitemap document was confirmed on the checked routes. This is not proof the site has no sitemap.");
}

export async function runDocumentationReadiness(rawHost, options = {}) {
  if (options.clientKey) consumeClient(options.clientKey);
  const { host, protocol } = normalizeHostInput(rawHost);
  const origin = `${protocol}://${host}`;
  const budget = createRequestBudget(12_000);
  const evidence = new Map();
  const get = (path) => {
    if (!evidence.has(path)) {
      evidence.set(path, fetchPublicBounded(origin + path, {
        allowedOrigin: origin, maxRedirects: 2, maxBytes: 256_000, timeoutMs: 5_000, budget,
        ...(options.lookup ? { lookup: options.lookup } : {}),
      }).catch((error) => {
        if (!(error instanceof BoundedFetchError)) throw error;
        return { status: 0, error: error.code };
      }));
    }
    return evidence.get(path);
  };
  try {
    const [home, llms, robots] = await Promise.all([get("/"), get("/llms.txt"), get("/robots.txt")]);
    const checks = [homepage(home), await sitemap(origin, robots, get), llmsIndex(llms)];
    return {
      schema: "agent-readiness.documentation.v1",
      host, origin, free: true, generatedAt: new Date().toISOString(),
      checks,
      topFixes: checks.filter((row) => row.fix).map(({ id, fix }) => ({ id, fix })),
      evidence: await Promise.all([...evidence].map(async ([path, pending]) => {
        const response = await pending;
        return { path, httpStatus: response.status || null, outcome: outcome(response), contentType: contentTypeOf(response) || null };
      })),
    };
  } finally { budget.dispose(); }
}
