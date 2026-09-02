import {
  collectResponses,
  evaluatePortfolio,
  extractCanonical,
  extractJsonLdBlocks,
  isSameOrigin,
  originOf,
  result,
  siteUrl,
  sitemapRootName,
} from "./lib.mjs";

export const DEFAULT_SEARCH_LIMITS = {
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

function decodeXmlText(value) {
  return String(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function extractRobotsSitemaps(body) {
  const declared = [];
  for (const line of String(body).split(/\r?\n/)) {
    const match = line.match(/^\s*sitemap\s*:\s*(\S+)/i);
    if (match) declared.push(match[1].trim());
  }
  return declared;
}

export function extractSitemapLocs(body) {
  const locs = [];
  const text = String(body).replace(/^\uFEFF/, "");
  const re = /<loc\b[^>]*>\s*([^<]+?)\s*<\/loc>/gi;
  let match;
  while ((match = re.exec(text))) locs.push(decodeXmlText(match[1].trim()));
  return locs;
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

function uniqueSameOrigin(urls, origin, limit) {
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
    if (out.length >= limit) break;
  }
  return out;
}

async function ensureFetched(responses, fetchImpl, urls) {
  const seen = new Set();
  for (const url of urls) {
    if (!url || seen.has(url) || responses.has(url)) continue;
    seen.add(url);
    responses.set(url, await fetchImpl(url));
  }
}

function extraUrlsForSite(site, responses, limits) {
  const urls = [];
  const home = responseAt(responses, siteUrl(site.origin, "/"));
  const robots = responseAt(responses, siteUrl(site.origin, "/robots.txt"));
  const sitemap = responseAt(responses, siteUrl(site.origin, "/sitemap.xml"));
  const llms = responseAt(responses, siteUrl(site.origin, "/llms.txt"));
  const base = `${site.origin}/`;

  if (robots?.status === 200) {
    for (const declared of extractRobotsSitemaps(robots.body || "")) {
      try {
        urls.push(new URL(declared, base).href);
      } catch {
        // skip
      }
    }
  }

  if (sitemap?.status === 200) {
    urls.push(...uniqueSameOrigin(extractSitemapLocs(sitemap.body || ""), site.origin, limits.sitemapSampleLimit));
  }

  if (llms?.status === 200) {
    const machine = extractReferencedUrls(llms.body || "", site.origin).filter((url) => isMachineSurface(url, site.origin));
    urls.push(...uniqueSameOrigin(machine, site.origin, limits.llmsSampleLimit));
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
      if (alts.length >= limits.hreflangSampleLimit) break;
    }
    urls.push(...alts);
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

function evaluateSitemapUrls(site, responses) {
  const url = siteUrl(site.origin, "/sitemap.xml");
  const response = responseAt(responses, url);
  if (!response || (response.error && !response.status)) {
    return result("sitemap_urls", "sitemap_urls", "missing", { url, detail: "no_response" });
  }
  if (response.status === 404 || response.status === 410) {
    return result("sitemap_urls", "sitemap_urls", "missing", {
      url,
      httpStatus: response.status,
      detail: "sitemap_absent",
    });
  }
  if (response.status !== 200) {
    return result("sitemap_urls", "sitemap_urls", "invalid", {
      url,
      httpStatus: response.status,
      detail: `unexpected_status:${response.status}`,
    });
  }
  const body = response.body || "";
  const root = sitemapRootName(body);
  if (root !== "urlset" && root !== "sitemapindex") {
    return result("sitemap_urls", "sitemap_urls", "invalid", {
      url,
      httpStatus: 200,
      detail: "sitemap_unparseable",
    });
  }
  const locs = extractSitemapLocs(body);
  if (locs.length === 0) {
    return result("sitemap_urls", "sitemap_urls", "invalid", {
      url,
      httpStatus: 200,
      detail: "sitemap_empty",
      root,
    });
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
    return result("sitemap_urls", "sitemap_urls", "invalid", {
      url,
      httpStatus: 200,
      detail: `sitemap_foreign_url:${foreign[0]}`,
      urlCount: locs.length,
      uniqueCount: seen.size,
      foreignCount: foreign.length,
      duplicateCount: duplicates.length,
    });
  }
  if (duplicates.length) {
    return result("sitemap_urls", "sitemap_urls", "invalid", {
      url,
      httpStatus: 200,
      detail: `sitemap_duplicate_url:${duplicates[0]}`,
      urlCount: locs.length,
      uniqueCount: seen.size,
      foreignCount: 0,
      duplicateCount: duplicates.length,
    });
  }
  return result("sitemap_urls", "sitemap_urls", "ok", {
    url,
    httpStatus: 200,
    detail: "sitemap_urls_ok",
    urlCount: locs.length,
    uniqueCount: seen.size,
    root,
  });
}

function classifyFetchedTarget(site, target, rec) {
  const httpStatus = rec?.status || 0;
  if ((rec?.error && !httpStatus) || httpStatus === 0) {
    return { url: target, httpStatus, bucket: "missing", detail: `unreachable:${rec?.error || "no_response"}` };
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

function rollupBuckets(rows, okDetail) {
  if (rows.some((row) => row.bucket === "invalid")) return { status: "invalid", detail: rows.find((row) => row.bucket === "invalid").detail };
  if (rows.some((row) => row.bucket === "missing")) return { status: "missing", detail: rows.find((row) => row.bucket === "missing").detail };
  return { status: "ok", detail: okDetail };
}

function compactSample(rows) {
  return rows.map(({ url, httpStatus, detail }) => ({ url, httpStatus, detail }));
}

function evaluateSitemapSample(site, responses, limits) {
  const url = siteUrl(site.origin, "/sitemap.xml");
  const response = responseAt(responses, url);
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
  const root = sitemapRootName(response.body || "");
  if (root !== "urlset" && root !== "sitemapindex") {
    return result("sitemap_sample", "sitemap_sample", "not_applicable", {
      url,
      httpStatus: 200,
      detail: "sitemap_unparseable",
    });
  }
  const sample = uniqueSameOrigin(extractSitemapLocs(response.body || ""), site.origin, limits.sitemapSampleLimit);
  if (sample.length === 0) {
    return result("sitemap_sample", "sitemap_sample", "not_applicable", {
      url,
      httpStatus: 200,
      detail: "no_same_origin_locs",
    });
  }
  const rows = sample.map((target) => classifyFetchedTarget(site, target, responseAt(responses, target)));
  const rolled = rollupBuckets(rows, "sitemap_sample_ok");
  return result("sitemap_sample", "sitemap_sample", rolled.status, {
    url,
    httpStatus: 200,
    detail: rolled.status === "ok" ? "sitemap_sample_ok" : `sitemap_sample:${rolled.detail}`,
    sample: compactSample(rows),
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
  const machine = uniqueSameOrigin(
    refs.filter((item) => isMachineSurface(item, site.origin)),
    site.origin,
    limits.llmsSampleLimit,
  );
  if (machine.length === 0) {
    return result("llms_references", "llms_references", "not_applicable", {
      url,
      httpStatus: 200,
      detail: "no_same_origin_machine_refs",
      referenced: refs.length,
    });
  }
  const rows = machine.map((target) => classifyFetchedTarget(site, target, responseAt(responses, target)));
  const rolled = rollupBuckets(rows, "llms_references_ok");
  const prefix = rolled.status === "ok" ? "llms_references_ok" : "llms_ref";
  return result("llms_references", "llms_references", rolled.status, {
    url,
    httpStatus: 200,
    detail: rolled.status === "ok" ? prefix : `${prefix}:${rolled.detail}`,
    sample: compactSample(rows),
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
    if (targets.length >= limits.hreflangSampleLimit) break;
  }
  if (targets.length === 0) {
    return result("hreflang", "hreflang", "ok", {
      url,
      httpStatus: 200,
      detail: "hreflang_self_only",
      declared: declared.length,
    });
  }
  const sample = [];
  for (const target of targets) {
    const rec = responseAt(responses, target);
    const classified = classifyFetchedTarget(site, target, rec);
    if (classified.bucket !== "ok") {
      return result("hreflang", "hreflang", classified.bucket === "missing" ? "missing" : "invalid", {
        url,
        httpStatus: response.status,
        detail: `hreflang_target:${classified.detail}`,
        target,
        sample,
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
      });
    }
  }
  return result("hreflang", "hreflang", "ok", {
    url,
    httpStatus: 200,
    detail: "hreflang_reciprocal",
    declared: declared.length,
    sampled: sample.length,
  });
}

function evaluateSiteSearchReadiness(site, responses, limits) {
  return [
    evaluateCanonicalOrigin(site, responses),
    evaluateRobotsSitemap(site, responses),
    evaluateSitemapUrls(site, responses),
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
    await ensureFetched(responses, fetchImpl, extraUrlsForSite(site, responses, limits));
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
