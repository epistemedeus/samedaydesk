import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_CATALOG = join(dirname(fileURLToPath(import.meta.url)), "catalog.json");

export function defaultCatalogPath() {
  return DEFAULT_CATALOG;
}

export function loadCatalog(catalogPath = DEFAULT_CATALOG) {
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  if (!catalog || !Array.isArray(catalog.sites) || catalog.sites.length === 0) {
    throw new Error("catalog must contain a sites array");
  }
  return catalog;
}

export function siteUrl(origin, path) {
  return new URL(path, origin.endsWith("/") ? origin : `${origin}/`).href;
}

export function catalogRequestUrls(catalog) {
  const urls = [];
  for (const site of catalog.sites) {
    for (const check of site.checks) {
      if (check.expect === "not_applicable") continue;
      const path = check.path ?? (check.from === "home" ? "/" : null);
      if (!path) continue;
      urls.push(siteUrl(site.origin, path));
    }
  }
  return [...new Set(urls)];
}

function headerValue(headers, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") return headers.get(name) || "";
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return Array.isArray(value) ? value.join(",") : String(value);
  }
  return "";
}

function contentTypeBase(value) {
  return String(value || "").toLowerCase().split(";")[0].trim();
}

function matchesContentType(actual, expected) {
  if (!expected) return true;
  const hay = contentTypeBase(actual);
  const needles = Array.isArray(expected) ? expected : [expected];
  return needles.some((n) => hay === String(n).toLowerCase());
}

function extractCanonical(html) {
  const tags = String(html).match(/<link\b[^>]*>/gi) || [];
  for (const tag of tags) {
    if (!/\brel\s*=\s*(["']?)canonical\1/i.test(tag)) continue;
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (href) return href[1];
  }
  return null;
}

function extractTitle(html) {
  const match = String(html).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/\s+/g, " ").trim() : "";
}

function extractJsonLdBlocks(html) {
  const blocks = [];
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) blocks.push(match[1].trim());
  return blocks;
}

function collectTypes(value, into = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectTypes(item, into);
    return into;
  }
  if (!value || typeof value !== "object") return into;
  if (value["@type"]) {
    const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
    into.push(...types);
  }
  for (const nested of Object.values(value)) collectTypes(nested, into);
  return into;
}

function looksLikeHomepage(body, fingerprint) {
  if (!fingerprint || !body) return false;
  const canonical = extractCanonical(body);
  if (fingerprint.canonical && canonical === fingerprint.canonical) return true;
  const title = extractTitle(body);
  if (fingerprint.titleIncludes && title.includes(fingerprint.titleIncludes)) return true;
  return false;
}

function sitemapRootName(body) {
  const trimmed = String(body).replace(/^\uFEFF/, "").trim();
  const match = trimmed.match(/<(urlset|sitemapindex)\b/i);
  return match ? match[1].toLowerCase() : null;
}

function asStatusList(expected) {
  if (expected == null) return null;
  return Array.isArray(expected) ? expected : [expected];
}

function result(id, kind, status, extra = {}) {
  return { id, kind, status, ...extra };
}

function evaluateCheck(site, check, responses) {
  if (check.expect === "not_applicable") {
    return result(check.id, check.kind, "not_applicable", { detail: "catalog marks this check not_applicable" });
  }

  const path = check.path ?? (check.from === "home" ? "/" : null);
  const url = path ? siteUrl(site.origin, path) : null;
  const response = url ? responses.get(url) : null;

  if (!response) {
    return result(check.id, check.kind, "missing", { url, detail: "no_response" });
  }

  if (response.error && !response.status) {
    return result(check.id, check.kind, "missing", {
      url,
      httpStatus: 0,
      detail: `unreachable:${response.error}`,
    });
  }

  const httpStatus = response.status;
  const contentType = headerValue(response.headers, "content-type");
  const body = response.body || "";
  const expect = check.expect || {};
  const expectedStatuses = asStatusList(expect.status);

  if (check.kind === "not_found") {
    if (expectedStatuses && expectedStatuses.includes(httpStatus)) {
      return result(check.id, check.kind, "ok", { url, httpStatus, contentType, detail: "truthful_not_found" });
    }
    if (httpStatus >= 200 && httpStatus < 300) {
      const homepage = expect.mustNotLookLikeHomepage && looksLikeHomepage(body, site.homeFingerprint);
      return result(check.id, check.kind, "invalid", {
        url,
        httpStatus,
        contentType,
        detail: homepage ? "soft_404_homepage" : "expected_not_found_got_success",
      });
    }
    if (httpStatus >= 300 && httpStatus < 400) {
      return result(check.id, check.kind, "invalid", {
        url,
        httpStatus,
        contentType,
        detail: "redirect_instead_of_not_found",
      });
    }
    return result(check.id, check.kind, "missing", {
      url,
      httpStatus,
      contentType,
      detail: "not_found_status_not_observed",
    });
  }

  if (expectedStatuses && !expectedStatuses.includes(httpStatus)) {
    const status = httpStatus === 404 || httpStatus === 410 ? "missing" : "invalid";
    return result(check.id, check.kind, status, {
      url,
      httpStatus,
      contentType,
      detail: `unexpected_status:${httpStatus}`,
    });
  }

  if (expect.contentTypePrefix && !matchesContentType(contentType, expect.contentTypePrefix)) {
    return result(check.id, check.kind, "invalid", {
      url,
      httpStatus,
      contentType,
      detail: `unexpected_content_type:${contentType || "empty"}`,
    });
  }

  if (check.kind === "jsonld") {
    const blocks = extractJsonLdBlocks(body);
    if (blocks.length === 0) {
      return result(check.id, check.kind, "missing", { url, httpStatus, detail: "no_jsonld_script" });
    }
    const parsed = [];
    for (const block of blocks) {
      try {
        parsed.push(JSON.parse(block));
      } catch {
        return result(check.id, check.kind, "invalid", { url, httpStatus, detail: "jsonld_unparseable" });
      }
    }
    if (expect.mustHaveType) {
      const types = parsed.flatMap((value) => collectTypes(value));
      if (!types.includes(expect.mustHaveType)) {
        return result(check.id, check.kind, "invalid", {
          url,
          httpStatus,
          detail: `jsonld_missing_type:${expect.mustHaveType}`,
        });
      }
    }
    return result(check.id, check.kind, "ok", { url, httpStatus, detail: `jsonld_blocks:${blocks.length}` });
  }

  if (expect.canonical) {
    const canonical = extractCanonical(body);
    if (!canonical) {
      return result(check.id, check.kind, "missing", { url, httpStatus, detail: "canonical_absent" });
    }
    if (canonical !== expect.canonical) {
      return result(check.id, check.kind, "invalid", {
        url,
        httpStatus,
        detail: `canonical_mismatch:${canonical}`,
      });
    }
  }

  if (Array.isArray(expect.mustInclude)) {
    const missingToken = expect.mustInclude.find((token) => !body.includes(token));
    if (missingToken) {
      return result(check.id, check.kind, "invalid", {
        url,
        httpStatus,
        detail: `missing_token:${missingToken}`,
      });
    }
  }

  if (expect.rootLocalName) {
    const root = sitemapRootName(body);
    if (!root) {
      return result(check.id, check.kind, "invalid", { url, httpStatus, detail: "sitemap_root_absent" });
    }
    if (root !== expect.rootLocalName) {
      return result(check.id, check.kind, "invalid", { url, httpStatus, detail: `sitemap_root:${root}` });
    }
  }

  return result(check.id, check.kind, "ok", { url, httpStatus, contentType });
}

export function evaluatePortfolio(catalog, responses) {
  const sites = catalog.sites.map((site) => {
    const checks = site.checks.map((check) => evaluateCheck(site, check, responses));
    const counts = { ok: 0, missing: 0, invalid: 0, not_applicable: 0 };
    for (const check of checks) counts[check.status] += 1;
    return {
      id: site.id,
      origin: site.origin,
      role: site.role,
      label: site.label,
      checks,
      counts,
    };
  });
  const totals = { ok: 0, missing: 0, invalid: 0, not_applicable: 0 };
  for (const site of sites) {
    for (const key of Object.keys(totals)) totals[key] += site.counts[key];
  }
  return {
    ok: totals.missing === 0 && totals.invalid === 0,
    totals,
    sites,
  };
}

export function createFixtureFetch(fixture) {
  const map = new Map();
  const responses = fixture.responses || fixture;
  for (const [origin, paths] of Object.entries(responses)) {
    for (const [path, rec] of Object.entries(paths)) {
      map.set(siteUrl(origin, path), rec);
    }
  }
  return async (url) => {
    const rec = map.get(url);
    if (!rec) {
      return { status: 0, headers: {}, body: "", url, error: "fixture_miss" };
    }
    return {
      status: rec.status,
      headers: rec.headers || { "content-type": rec.contentType || "text/plain" },
      body: rec.body || "",
      url,
    };
  };
}

export async function collectResponses(catalog, fetchImpl) {
  const responses = new Map();
  for (const url of catalogRequestUrls(catalog)) {
    responses.set(url, await fetchImpl(url));
  }
  return responses;
}

export async function liveFetch(url, { timeoutMs = 15000, userAgent = "samedaydesk-portfolio-discovery/1.0" } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ac.signal,
      headers: { "user-agent": userAgent, accept: "*/*" },
    });
    return {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") || "" },
      body: await res.text(),
      url: res.url,
    };
  } catch (error) {
    return { status: 0, headers: {}, body: "", url, error: error.name === "AbortError" ? "timeout" : error.message };
  } finally {
    clearTimeout(timer);
  }
}

export async function runPortfolioDiscovery(catalog, fetchImpl) {
  const responses = await collectResponses(catalog, fetchImpl);
  return evaluatePortfolio(catalog, responses);
}
