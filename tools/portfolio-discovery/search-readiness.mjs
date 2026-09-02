import {
  collectResponses,
  evaluatePortfolio,
  extractCanonical,
  extractJsonLdBlocks,
  isSameOrigin,
  originOf,
  parseSitemapXml,
  result,
  siteUrl,
} from "./lib.mjs";

export { extractSitemapLocs, parseSitemapXml, sitemapRootName } from "./lib.mjs";

export const DEFAULT_SEARCH_LIMITS = {
  sitemapDeclarationLimit: 8,
  sitemapSampleLimit: 5,
  llmsSampleLimit: 8,
  hreflangSampleLimit: 3,
};

export const SEARCH_CLAIMS = {
  crawlability: "http_evaluated",
  indexing: "not_observed",
  ranking: "not_observed",
  geo_citation: "not_observed",
  traffic: "not_observed",
};

const IDENTITY_TYPES = new Set(["Organization", "Service", "ProfessionalService"]);

export function searchLimits(catalog) {
  const raw = catalog?.searchReadiness || {};
  const pick = (key) => {
    const value = Number(raw[key]);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_SEARCH_LIMITS[key];
  };
  return {
    sitemapDeclarationLimit: pick("sitemapDeclarationLimit"),
    sitemapSampleLimit: pick("sitemapSampleLimit"),
    llmsSampleLimit: pick("llmsSampleLimit"),
    hreflangSampleLimit: pick("hreflangSampleLimit"),
  };
}

export function normalizePageUrl(urlLike, base) {
  try {
    const url = new URL(urlLike, base);
    url.hash = "";
    let path = url.pathname || "/";
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    return `${url.origin}${path}${url.search}`;
  } catch {
    return null;
  }
}

export function extractRobotsSitemaps(body) {
  const declared = [];
  for (const line of String(body).split(/\r?\n/)) {
    const match = line.match(/^\s*sitemap\s*:\s*(\S+)/i);
    if (match) declared.push(match[1].trim());
  }
  return declared;
}

export function inspectRedirectAuthority(site, requestedUrl, rec) {
  const finalUrl = rec && rec.url ? rec.url : requestedUrl;
  if (!finalUrl) return { ok: false, finalUrl: finalUrl || null, detail: "final_url_absent" };
  const requestedOrigin = originOf(requestedUrl);
  const finalOrigin = originOf(finalUrl, requestedUrl);
  if (!finalOrigin) return { ok: false, finalUrl, detail: "final_url_unparseable" };
  if (requestedOrigin && finalOrigin !== requestedOrigin) {
    return { ok: false, finalUrl, detail: `redirect_foreign_origin:${finalOrigin}` };
  }
  const requestedKey = normalizePageUrl(requestedUrl, site.origin);
  const finalKey = normalizePageUrl(finalUrl, requestedUrl);
  const homeKey = normalizePageUrl(siteUrl(site.origin, "/"), site.origin);
  if (requestedKey && homeKey && requestedKey !== homeKey && finalKey === homeKey) {
    return { ok: false, finalUrl, detail: "redirect_homepage" };
  }
  if (requestedKey && finalKey && requestedKey !== finalKey) {
    return { ok: false, finalUrl, detail: `redirect_path_drift:${finalKey}` };
  }
  return { ok: true, finalUrl };
}

export function extractHreflang(html) {
  const tags = String(html).match(/<link\b[^>]*>/gi) || [];
  const out = [];
  for (const tag of tags) {
    const lang = tag.match(/\bhreflang\s*=\s*["']([^"']+)["']/i);
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (!lang || !href) continue;
    out.push({ lang: lang[1].trim(), href: href[1].trim() });
  }
  return out;
}

export function extractReferencedUrls(text, baseOrigin) {
  const found = [];
  const seen = new Set();
  const base = baseOrigin.endsWith("/") ? baseOrigin : `${baseOrigin}/`;
  const add = (href) => {
    if (!href) return;
    const trimmed = String(href).trim().replace(/[.,;]+$/, "");
    if (!trimmed || trimmed.startsWith("#")) return;
    const lower = trimmed.toLowerCase();
    if (lower.startsWith("mailto:") || lower.startsWith("javascript:")) return;
    try {
      const abs = new URL(trimmed, base).href;
      if (seen.has(abs)) return;
      seen.add(abs);
      found.push(abs);
    } catch {
      // skip unparseable hrefs
    }
  };
  const markdown = /\[(?:[^\]]*)\]\(([^)\s]+)\)/g;
  let match;
  while ((match = markdown.exec(text))) add(match[1]);
  const bare = /https?:\/\/[^\s)\]>'"]+/gi;
  while ((match = bare.exec(text))) add(match[0]);
  return found;
}

export function isMachineSurface(urlLike, origin) {
  if (!isSameOrigin(urlLike, origin)) return false;
  let path;
  try {
    path = new URL(urlLike, origin.endsWith("/") ? origin : `${origin}/`).pathname;
  } catch {
    return false;
  }
  if (path.includes("/.well-known/")) return true;
  if (path.includes("/api/")) return true;
  return /\.(json|txt|xml|md|ya?ml|csv)$/i.test(path);
}

function typeList(node) {
  const value = node?.["@type"];
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).map(String);
}

function topLevelNodes(parsed) {
  if (Array.isArray(parsed)) return parsed.flatMap(topLevelNodes);
  if (!parsed || typeof parsed !== "object") return [];
  if (Array.isArray(parsed["@graph"])) {
    return parsed["@graph"].filter((node) => node && typeof node === "object" && !Array.isArray(node));
  }
  return [parsed];
}

function nodeNames(node) {
  const value = node?.name;
  if (value == null) return [];
  const asName = (item) => {
    if (item == null) return [];
    if (typeof item === "object" && item["@value"] != null) return [String(item["@value"])];
    return [String(item)];
  };
  return Array.isArray(value) ? value.flatMap(asName) : asName(value);
}

function resolveHttpOrigin(value, base) {
  if (typeof value !== "string" || !value) return null;
  const href = value.split("#")[0];
  if (!href) return null;
  try {
    const url = new URL(href, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function responseAt(responses, url) {
  return responses.get(url) || null;
}

function uniqueSameOriginAll(urls, origin) {
  const out = [];
  const seen = new Set();
  const base = origin.endsWith("/") ? origin : `${origin}/`;
  for (const item of urls) {
    if (!isSameOrigin(item, origin)) continue;
    let abs;
    try {
      abs = new URL(item, base).href;
    } catch {
      continue;
    }
    const key = normalizePageUrl(abs, origin) || abs;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(abs);
  }
  return out;
}

function boundSample(items, limit) {
  const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : items.length;
  const sampledItems = items.slice(0, cap);
  return {
    total: items.length,
    items: sampledItems,
    sampled: sampledItems.length,
    unobserved: items.length - sampledItems.length,
  };
}

async function ensureFetched(responses, fetchImpl, urls) {
  const seen = new Set();
  for (const url of urls) {
    if (!url || seen.has(url) || responses.has(url)) continue;
    seen.add(url);
    responses.set(url, await fetchImpl(url));
  }
}

function sameOriginDeclaredSitemaps(site, responses) {
  const robots = responseAt(responses, siteUrl(site.origin, "/robots.txt"));
  if (robots?.status !== 200) return [];
  const declared = [];
  const base = `${site.origin}/`;
  for (const item of extractRobotsSitemaps(robots.body || "")) {
    try {
      declared.push(new URL(item, base).href);
    } catch {
      // skip unparseable declarations; robots_sitemap reports those
    }
  }
  return uniqueSameOriginAll(declared, site.origin);
}

function sitemapDocumentPlan(site, responses, limits) {
  const conventional = siteUrl(site.origin, "/sitemap.xml");
  const declared = sameOriginDeclaredSitemaps(site, responses);
  const union = uniqueSameOriginAll([conventional, ...declared], site.origin);
  return boundSample(union, limits.sitemapDeclarationLimit);
}

function locsFromSitemapDocuments(site, responses, documentUrls) {
  const locs = [];
  for (const url of documentUrls) {
    const rec = responseAt(responses, url);
    if (rec?.status !== 200) continue;
    if (!inspectRedirectAuthority(site, url, rec).ok) continue;
    const parsed = parseSitemapXml(rec.body || "");
    if (!parsed.ok) continue;
    locs.push(...parsed.locs);
  }
  return locs;
}

function extraSampleUrlsForSite(site, responses, limits, sitemapDocuments) {
  const urls = [];
  const home = responseAt(responses, siteUrl(site.origin, "/"));
  const llms = responseAt(responses, siteUrl(site.origin, "/llms.txt"));
  const base = `${site.origin}/`;

  urls.push(
    ...boundSample(
      uniqueSameOriginAll(locsFromSitemapDocuments(site, responses, sitemapDocuments), site.origin),
      limits.sitemapSampleLimit,
    ).items,
  );

  if (llms?.status === 200) {
    const machine = uniqueSameOriginAll(
      extractReferencedUrls(llms.body || "", site.origin).filter((url) => isMachineSurface(url, site.origin)),
      site.origin,
    );
    urls.push(...boundSample(machine, limits.llmsSampleLimit).items);
  }

  if (home?.status === 200) {
    const sourceKey = normalizePageUrl(siteUrl(site.origin, "/"), site.origin);
    const alts = [];
    const seen = new Set();
    for (const alt of extractHreflang(home.body || "")) {
      let abs;
      try {
        abs = new URL(alt.href, base).href;
      } catch {
        continue;
      }
      const key = normalizePageUrl(abs, site.origin) || abs;
      if (key === sourceKey || seen.has(key)) continue;
      seen.add(key);
      alts.push(abs);
    }
    urls.push(...boundSample(alts, limits.hreflangSampleLimit).items);
  }

  return urls;
}

function evaluateCanonicalOrigin(site, responses) {
  const url = siteUrl(site.origin, "/");
  const response = responseAt(responses, url);
  if (!response || (response.error && !response.status)) {
    return result("canonical_origin", "canonical_origin", "missing", { url, detail: "no_response" });
  }
  const canonical = extractCanonical(response.body || "");
  if (!canonical) {
    return result("canonical_origin", "canonical_origin", "missing", {
      url,
      httpStatus: response.status,
      detail: "canonical_absent",
    });
  }
  const pageOrigin = originOf(url);
  const canonicalOrigin = originOf(canonical, url);
  if (!canonicalOrigin) {
    return result("canonical_origin", "canonical_origin", "invalid", {
      url,
      httpStatus: response.status,
      canonical,
      detail: "canonical_unparseable",
    });
  }
  if (canonicalOrigin !== pageOrigin) {
    return result("canonical_origin", "canonical_origin", "invalid", {
      url,
      httpStatus: response.status,
      canonical,
      canonicalOrigin,
      detail: `canonical_wrong_origin:${canonicalOrigin}`,
    });
  }
  return result("canonical_origin", "canonical_origin", "ok", {
    url,
    httpStatus: response.status,
    canonical,
    canonicalOrigin,
    detail: "canonical_origin_ok",
  });
}

function evaluateRobotsSitemap(site, responses) {
  const url = siteUrl(site.origin, "/robots.txt");
  const response = responseAt(responses, url);
  if (!response || (response.error && !response.status)) {
    return result("robots_sitemap", "robots_sitemap", "missing", { url, detail: "no_response" });
  }
  if (response.status === 404 || response.status === 410) {
    return result("robots_sitemap", "robots_sitemap", "missing", {
      url,
      httpStatus: response.status,
      detail: "robots_absent",
    });
  }
  if (response.status !== 200) {
    return result("robots_sitemap", "robots_sitemap", "invalid", {
      url,
      httpStatus: response.status,
      detail: `unexpected_status:${response.status}`,
    });
  }
  const declared = extractRobotsSitemaps(response.body || "");
  if (declared.length === 0) {
    return result("robots_sitemap", "robots_sitemap", "invalid", {
      url,
      httpStatus: 200,
      detail: "sitemap_declaration_absent",
    });
  }
  const same = [];
  for (const item of declared) {
    try {
      const abs = new URL(item, `${site.origin}/`).href;
      if (!isSameOrigin(abs, site.origin)) {
        return result("robots_sitemap", "robots_sitemap", "invalid", {
          url,
          httpStatus: 200,
          detail: `sitemap_declaration_foreign:${abs}`,
          declared,
        });
      }
      same.push(abs);
    } catch {
      return result("robots_sitemap", "robots_sitemap", "invalid", {
        url,
        httpStatus: 200,
        detail: "sitemap_declaration_unparseable",
        declared,
      });
    }
  }
  return result("robots_sitemap", "robots_sitemap", "ok", {
    url,
    httpStatus: 200,
    detail: "sitemap_declared",
    declared: same,
  });
}

function evaluateOneSitemapDocument(site, url, rec) {
  if (!rec || (rec.error && !rec.status)) {
    return { url, httpStatus: rec?.status || 0, bucket: "missing", detail: "no_response" };
  }
  const authority = inspectRedirectAuthority(site, url, rec);
  if (!authority.ok) {
    return {
      url,
      httpStatus: rec.status || 0,
      finalUrl: authority.finalUrl,
      bucket: "invalid",
      detail: authority.detail,
    };
  }
  if (rec.status === 404 || rec.status === 410) {
    return { url, httpStatus: rec.status, bucket: "missing", detail: "sitemap_absent" };
  }
  if (rec.status !== 200) {
    return {
      url,
      httpStatus: rec.status,
      bucket: "invalid",
      detail: `unexpected_status:${rec.status}`,
    };
  }
  const parsed = parseSitemapXml(rec.body || "");
  if (!parsed.ok || (parsed.root !== "urlset" && parsed.root !== "sitemapindex")) {
    return { url, httpStatus: 200, bucket: "invalid", detail: "sitemap_unparseable", root: parsed.root || null };
  }
  const locs = parsed.locs;
  if (locs.length === 0) {
    return { url, httpStatus: 200, bucket: "invalid", detail: "sitemap_empty", root: parsed.root };
  }
  const foreign = [];
  const seen = new Map();
  for (const loc of locs) {
    if (!isSameOrigin(loc, site.origin)) foreign.push(loc);
    const key = normalizePageUrl(loc, `${site.origin}/`) || loc;
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  const duplicates = [...seen.entries()].filter(([, count]) => count > 1).map(([key]) => key);
  if (foreign.length) {
    return {
      url,
      httpStatus: 200,
      bucket: "invalid",
      detail: `sitemap_foreign_url:${foreign[0]}`,
      urlCount: locs.length,
      uniqueCount: seen.size,
      foreignCount: foreign.length,
      duplicateCount: duplicates.length,
      root: parsed.root,
    };
  }
  if (duplicates.length) {
    return {
      url,
      httpStatus: 200,
      bucket: "invalid",
      detail: `sitemap_duplicate_url:${duplicates[0]}`,
      urlCount: locs.length,
      uniqueCount: seen.size,
      foreignCount: 0,
      duplicateCount: duplicates.length,
      root: parsed.root,
    };
  }
  return {
    url,
    httpStatus: 200,
    bucket: "ok",
    detail: "sitemap_urls_ok",
    urlCount: locs.length,
    uniqueCount: seen.size,
    foreignCount: 0,
    duplicateCount: 0,
    root: parsed.root,
  };
}

function compactSitemapSource(src) {
  const row = {
    url: src.url,
    httpStatus: src.httpStatus,
    status: src.bucket,
    detail: src.detail,
  };
  if (src.finalUrl && src.finalUrl !== src.url) row.finalUrl = src.finalUrl;
  if (src.root) row.root = src.root;
  if (src.urlCount != null) {
    row.urlCount = src.urlCount;
    row.uniqueCount = src.uniqueCount;
    row.foreignCount = src.foreignCount || 0;
    row.duplicateCount = src.duplicateCount || 0;
  }
  return row;
}

function evaluateSitemapUrls(site, responses, limits) {
  const conventional = siteUrl(site.origin, "/sitemap.xml");
  const plan = sitemapDocumentPlan(site, responses, limits);
  const sources = plan.items.map((url) => evaluateOneSitemapDocument(site, url, responseAt(responses, url)));
  const rolled = rollupBuckets(sources, "sitemap_urls_ok", {
    unobserved: plan.unobserved,
    unobservedDetail: "sitemap_declaration_unobserved",
  });
  const payload = {
    url: conventional,
    detail: rolled.status === "ok" ? "sitemap_urls_ok" : rolled.detail,
    sources: sources.map(compactSitemapSource),
    total: plan.total,
    sampled: plan.sampled,
    unobserved: plan.unobserved,
  };
  if (sources.length === 1) {
    const src = sources[0];
    payload.url = src.url;
    payload.httpStatus = src.httpStatus;
    if (src.finalUrl && src.finalUrl !== src.url) payload.finalUrl = src.finalUrl;
    if (src.root) payload.root = src.root;
    if (src.urlCount != null) {
      payload.urlCount = src.urlCount;
      payload.uniqueCount = src.uniqueCount;
      payload.foreignCount = src.foreignCount || 0;
      payload.duplicateCount = src.duplicateCount || 0;
    }
  }
  return result("sitemap_urls", "sitemap_urls", rolled.status, payload);
}

function classifyFetchedTarget(site, target, rec) {
  const httpStatus = rec?.status || 0;
  if ((rec?.error && !httpStatus) || httpStatus === 0) {
    return { url: target, httpStatus, bucket: "missing", detail: `unreachable:${rec?.error || "no_response"}` };
  }
  const authority = inspectRedirectAuthority(site, target, rec);
  if (!authority.ok) {
    return {
      url: target,
      httpStatus,
      finalUrl: authority.finalUrl,
      bucket: "invalid",
      detail: authority.detail,
    };
  }
  if (httpStatus >= 200 && httpStatus < 300) {
    const homeKey = normalizePageUrl(siteUrl(site.origin, "/"), site.origin);
    const key = normalizePageUrl(target, site.origin);
    const canonical = extractCanonical(rec.body || "");
    const homeCanonical = site.homeFingerprint?.canonical;
    // Inner URLs that still canonicalize to the homepage are SPA fallbacks.
    // Do not use title substring matching here; brand names appear on real inner pages.
    if (key !== homeKey && homeCanonical && canonical === homeCanonical) {
      return { url: target, httpStatus, bucket: "invalid", detail: "soft_404_homepage" };
    }
    return { url: target, httpStatus, bucket: "ok", detail: "ok" };
  }
  if (httpStatus === 404 || httpStatus === 410) {
    return { url: target, httpStatus, bucket: "invalid", detail: "not_found" };
  }
  return { url: target, httpStatus, bucket: "invalid", detail: `unexpected_status:${httpStatus}` };
}

function rollupBuckets(rows, okDetail, extra = {}) {
  const unobserved = extra.unobserved || 0;
  const invalid = rows.find((row) => row.bucket === "invalid");
  if (invalid) return { status: "invalid", detail: invalid.detail };
  const missing = rows.find((row) => row.bucket === "missing");
  if (missing) return { status: "missing", detail: missing.detail };
  if (unobserved > 0) return { status: "missing", detail: extra.unobservedDetail || "sample_unobserved" };
  return { status: "ok", detail: okDetail };
}

function compactSample(rows) {
  return rows.map(({ url, httpStatus, detail, finalUrl }) => {
    const row = { url, httpStatus, detail };
    if (finalUrl && finalUrl !== url) row.finalUrl = finalUrl;
    return row;
  });
}

function samplingFields(bounded) {
  return { total: bounded.total, sampled: bounded.sampled, unobserved: bounded.unobserved };
}

function evaluateSitemapSample(site, responses, limits) {
  const url = siteUrl(site.origin, "/sitemap.xml");
  const plan = sitemapDocumentPlan(site, responses, limits);
  const response = responseAt(responses, url);
  const authority = response ? inspectRedirectAuthority(site, url, response) : { ok: true, finalUrl: url };

  if (response && !authority.ok) {
    return result("sitemap_sample", "sitemap_sample", "invalid", {
      url,
      httpStatus: response.status || 0,
      finalUrl: authority.finalUrl,
      detail: authority.detail,
      ...samplingFields({ total: 0, sampled: 0, unobserved: 0 }),
    });
  }

  const uniqueLocs = uniqueSameOriginAll(locsFromSitemapDocuments(site, responses, plan.items), site.origin);
  const bounded = boundSample(uniqueLocs, limits.sitemapSampleLimit);
  if (bounded.total === 0) {
    if (!response || (response.error && !response.status)) {
      return result("sitemap_sample", "sitemap_sample", "missing", { url, detail: "no_response" });
    }
    if (response.status !== 200) {
      const status = response.status === 404 || response.status === 410 ? "missing" : "invalid";
      return result("sitemap_sample", "sitemap_sample", status, {
        url,
        httpStatus: response.status,
        detail: "sitemap_unavailable",
      });
    }
    const parsed = parseSitemapXml(response.body || "");
    if (!parsed.ok || (parsed.root !== "urlset" && parsed.root !== "sitemapindex")) {
      return result("sitemap_sample", "sitemap_sample", "not_applicable", {
        url,
        httpStatus: 200,
        detail: "sitemap_unparseable",
      });
    }
    return result("sitemap_sample", "sitemap_sample", "not_applicable", {
      url,
      httpStatus: 200,
      detail: "no_same_origin_locs",
      ...samplingFields(bounded),
    });
  }
  const rows = bounded.items.map((target) => classifyFetchedTarget(site, target, responseAt(responses, target)));
  const rolled = rollupBuckets(rows, "sitemap_sample_ok", {
    unobserved: bounded.unobserved,
    unobservedDetail: "sitemap_sample_unobserved",
  });
  const detail =
    rolled.status === "ok"
      ? "sitemap_sample_ok"
      : rolled.detail === "sitemap_sample_unobserved"
        ? "sitemap_sample_unobserved"
        : `sitemap_sample:${rolled.detail}`;
  return result("sitemap_sample", "sitemap_sample", rolled.status, {
    url,
    httpStatus: response?.status || 200,
    detail,
    sample: compactSample(rows),
    ...samplingFields(bounded),
  });
}

function evaluateJsonLdIdentity(site, responses) {
  const url = siteUrl(site.origin, "/");
  const response = responseAt(responses, url);
  if (!response || (response.error && !response.status)) {
    return result("jsonld_identity", "jsonld_identity", "missing", { url, detail: "no_response" });
  }
  if (response.status !== 200) {
    const status = response.status === 404 || response.status === 410 ? "missing" : "invalid";
    return result("jsonld_identity", "jsonld_identity", status, {
      url,
      httpStatus: response.status,
      detail: `unexpected_status:${response.status}`,
    });
  }
  const blocks = extractJsonLdBlocks(response.body || "");
  if (blocks.length === 0) {
    return result("jsonld_identity", "jsonld_identity", "missing", {
      url,
      httpStatus: 200,
      detail: "no_jsonld_script",
    });
  }
  const parsed = [];
  for (const block of blocks) {
    try {
      parsed.push(JSON.parse(block));
    } catch {
      return result("jsonld_identity", "jsonld_identity", "invalid", {
        url,
        httpStatus: 200,
        detail: "jsonld_unparseable",
      });
    }
  }
  const identityNodes = parsed.flatMap(topLevelNodes).filter((node) => typeList(node).some((type) => IDENTITY_TYPES.has(type)));
  if (identityNodes.length === 0) {
    return result("jsonld_identity", "jsonld_identity", "missing", {
      url,
      httpStatus: 200,
      detail: "jsonld_identity_undeclared",
    });
  }
  const pageOrigin = originOf(url);
  for (const node of identityNodes) {
    for (const field of ["url", "@id"]) {
      const declaredOrigin = resolveHttpOrigin(node[field], url);
      if (declaredOrigin && declaredOrigin !== pageOrigin) {
        return result("jsonld_identity", "jsonld_identity", "invalid", {
          url,
          httpStatus: 200,
          detail: `jsonld_identity_wrong_origin:${declaredOrigin}`,
          field,
        });
      }
    }
  }
  const expectedName = site.identity?.organizationName;
  if (expectedName) {
    const organizations = identityNodes.filter((node) => typeList(node).includes("Organization"));
    if (organizations.length === 0) {
      return result("jsonld_identity", "jsonld_identity", "invalid", {
        url,
        httpStatus: 200,
        detail: "jsonld_identity_organization_absent",
      });
    }
    const names = organizations.flatMap(nodeNames);
    if (names.length === 0) {
      return result("jsonld_identity", "jsonld_identity", "invalid", {
        url,
        httpStatus: 200,
        detail: "jsonld_identity_name_absent",
      });
    }
    if (!names.includes(expectedName)) {
      return result("jsonld_identity", "jsonld_identity", "invalid", {
        url,
        httpStatus: 200,
        detail: `jsonld_identity_name:${names[0]}`,
      });
    }
  }
  return result("jsonld_identity", "jsonld_identity", "ok", {
    url,
    httpStatus: 200,
    detail: `jsonld_identity_ok:${identityNodes.length}`,
  });
}

function evaluateLlmsReferences(site, responses, limits) {
  const url = siteUrl(site.origin, "/llms.txt");
  const response = responseAt(responses, url);
  if (!response || (response.error && !response.status)) {
    return result("llms_references", "llms_references", "missing", { url, detail: "no_response" });
  }
  if (response.status === 404 || response.status === 410) {
    return result("llms_references", "llms_references", "missing", {
      url,
      httpStatus: response.status,
      detail: "llms_absent",
    });
  }
  if (response.status !== 200) {
    return result("llms_references", "llms_references", "invalid", {
      url,
      httpStatus: response.status,
      detail: `unexpected_status:${response.status}`,
    });
  }
  const refs = extractReferencedUrls(response.body || "", site.origin);
  const machine = uniqueSameOriginAll(
    refs.filter((item) => isMachineSurface(item, site.origin)),
    site.origin,
  );
  const bounded = boundSample(machine, limits.llmsSampleLimit);
  if (bounded.total === 0) {
    return result("llms_references", "llms_references", "not_applicable", {
      url,
      httpStatus: 200,
      detail: "no_same_origin_machine_refs",
      referenced: refs.length,
      ...samplingFields(bounded),
    });
  }
  const rows = bounded.items.map((target) => classifyFetchedTarget(site, target, responseAt(responses, target)));
  const rolled = rollupBuckets(rows, "llms_references_ok", {
    unobserved: bounded.unobserved,
    unobservedDetail: "llms_references_unobserved",
  });
  const detail =
    rolled.status === "ok"
      ? "llms_references_ok"
      : rolled.detail === "llms_references_unobserved"
        ? "llms_references_unobserved"
        : `llms_ref:${rolled.detail}`;
  return result("llms_references", "llms_references", rolled.status, {
    url,
    httpStatus: 200,
    detail,
    sample: compactSample(rows),
    referenced: refs.length,
    ...samplingFields(bounded),
  });
}

function evaluateHreflang(site, responses, limits) {
  const url = siteUrl(site.origin, "/");
  const response = responseAt(responses, url);
  if (!response || (response.error && !response.status)) {
    return result("hreflang", "hreflang", "missing", { url, detail: "no_response" });
  }
  if (response.status !== 200) {
    return result("hreflang", "hreflang", "not_applicable", {
      url,
      httpStatus: response.status,
      detail: "home_unavailable",
    });
  }
  const declared = extractHreflang(response.body || "");
  if (declared.length === 0) {
    return result("hreflang", "hreflang", "not_applicable", {
      url,
      httpStatus: 200,
      detail: "no_hreflang_declared",
    });
  }
  const sourceKey = normalizePageUrl(url, site.origin);
  const targets = [];
  const seen = new Set();
  for (const alt of declared) {
    let abs;
    try {
      abs = new URL(alt.href, url).href;
    } catch {
      return result("hreflang", "hreflang", "invalid", {
        url,
        httpStatus: 200,
        detail: "hreflang_unparseable",
        lang: alt.lang,
      });
    }
    const key = normalizePageUrl(abs, url) || abs;
    if (key === sourceKey || seen.has(key)) continue;
    seen.add(key);
    targets.push(abs);
  }
  if (targets.length === 0) {
    return result("hreflang", "hreflang", "ok", {
      url,
      httpStatus: 200,
      detail: "hreflang_self_only",
      declared: declared.length,
      total: 0,
      sampled: 0,
      unobserved: 0,
    });
  }
  const bounded = boundSample(targets, limits.hreflangSampleLimit);
  const sample = [];
  for (const target of bounded.items) {
    const rec = responseAt(responses, target);
    const classified = classifyFetchedTarget(site, target, rec);
    if (classified.bucket !== "ok") {
      return result("hreflang", "hreflang", classified.bucket === "missing" ? "missing" : "invalid", {
        url,
        httpStatus: response.status,
        detail: `hreflang_target:${classified.detail}`,
        target,
        sample,
        ...samplingFields(bounded),
      });
    }
    const back = extractHreflang(rec.body || "");
    const backKeys = new Set(back.map((alt) => normalizePageUrl(alt.href, target)).filter(Boolean));
    sample.push({ url: target, httpStatus: classified.httpStatus, returnLink: backKeys.has(sourceKey) });
    if (!backKeys.has(sourceKey)) {
      return result("hreflang", "hreflang", "invalid", {
        url,
        httpStatus: 200,
        detail: "hreflang_not_reciprocal",
        target,
        sample,
        ...samplingFields(bounded),
      });
    }
  }
  if (bounded.unobserved > 0) {
    return result("hreflang", "hreflang", "missing", {
      url,
      httpStatus: 200,
      detail: "hreflang_unobserved",
      declared: declared.length,
      sample,
      ...samplingFields(bounded),
    });
  }
  return result("hreflang", "hreflang", "ok", {
    url,
    httpStatus: 200,
    detail: "hreflang_reciprocal",
    declared: declared.length,
    sample,
    ...samplingFields(bounded),
  });
}

function evaluateSiteSearchReadiness(site, responses, limits) {
  return [
    evaluateCanonicalOrigin(site, responses),
    evaluateRobotsSitemap(site, responses),
    evaluateSitemapUrls(site, responses, limits),
    evaluateSitemapSample(site, responses, limits),
    evaluateJsonLdIdentity(site, responses),
    evaluateLlmsReferences(site, responses, limits),
    evaluateHreflang(site, responses, limits),
  ];
}

function recount(checks) {
  const counts = { ok: 0, missing: 0, invalid: 0, not_applicable: 0 };
  for (const check of checks) {
    if (Object.prototype.hasOwnProperty.call(counts, check.status)) counts[check.status] += 1;
  }
  return counts;
}

export async function runSearchReadiness(catalog, fetchImpl) {
  const responses = await collectResponses(catalog, fetchImpl);
  const discovery = evaluatePortfolio(catalog, responses);
  const limits = searchLimits(catalog);
  const sites = [];
  for (const [index, site] of catalog.sites.entries()) {
    const documents = sitemapDocumentPlan(site, responses, limits);
    await ensureFetched(responses, fetchImpl, documents.items);
    await ensureFetched(responses, fetchImpl, extraSampleUrlsForSite(site, responses, limits, documents.items));
    const checks = [...discovery.sites[index].checks, ...evaluateSiteSearchReadiness(site, responses, limits)];
    sites.push({
      id: site.id,
      origin: site.origin,
      role: site.role,
      label: site.label,
      checks,
      counts: recount(checks),
    });
  }
  const totals = { ok: 0, missing: 0, invalid: 0, not_applicable: 0 };
  for (const site of sites) {
    for (const key of Object.keys(totals)) totals[key] += site.counts[key];
  }
  return {
    ok: totals.missing === 0 && totals.invalid === 0,
    mode: "search-readiness",
    searchClaims: { ...SEARCH_CLAIMS },
    limits,
    probeCount: responses.size,
    totals,
    sites,
  };
}
