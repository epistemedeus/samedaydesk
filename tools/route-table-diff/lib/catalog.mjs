import { HOME_CANONICAL, HOME_PATH, HOME_TITLE, SCHEMA_TABLE, SITE_ORIGIN } from "./constants.mjs";
import { refuseIntegerTermsVersion } from "./digest.mjs";
import { refused } from "./errors.mjs";

const SAMPLE_MARKERS = ["sample", "samplelabel", "label", "kind", "sourcekind", "authority"];

export function extractRouteList(raw) {
  if (Array.isArray(raw)) return { envelope: { schema: SCHEMA_TABLE }, routes: raw };
  if (!raw || typeof raw !== "object") {
    refused("invalid_catalog", "Route catalog must be a JSON object or array of route records");
  }
  if (Array.isArray(raw.routes)) return { envelope: raw, routes: raw.routes };
  if (Array.isArray(raw.catalog)) return { envelope: raw, routes: raw.catalog };
  refused("invalid_catalog", "Route catalog must have a routes (or catalog) array, or be an array of records");
}

export function isSampleCatalog(envelope, locator = "") {
  const loc = String(locator || "").replaceAll("\\", "/");
  const parts = loc.split("/");
  if (parts.some((part) => /^SAMPLE$/i.test(part) || /^SAMPLE\./i.test(part))) return true;
  if (!envelope || typeof envelope !== "object") return false;
  if (envelope.sample === true || envelope.example === true || envelope.exampleMode === true) return true;
  const provenance = envelope.callerProvenance && typeof envelope.callerProvenance === "object"
    ? envelope.callerProvenance
    : null;
  if (provenance && (provenance.sampleLabel || provenance.syntheticFixture || provenance.notCustomer)) {
    const label = String(provenance.sampleLabel || "");
    if (/sample/i.test(label) || provenance.syntheticFixture === true) return true;
  }
  for (const key of SAMPLE_MARKERS) {
    const actual = envelope[key] ?? envelope[key.replace("label", "Label")];
    if (typeof actual === "string" && /sample/i.test(actual)) return true;
  }
  if (typeof envelope.sampleLabel === "string" && /sample/i.test(envelope.sampleLabel)) return true;
  if (typeof envelope.label === "string" && /sample/i.test(envelope.label)) return true;
  return false;
}

export function isPublishedClaim(envelope, options = {}) {
  if (options.published === true) return true;
  if (!envelope || typeof envelope !== "object") return false;
  if (envelope.publishedRouteTable === true || envelope.published === true) return true;
  if (String(envelope.authority || "").toLowerCase() === "published") return true;
  if (typeof envelope.claim === "string" && /published route table/i.test(envelope.claim)) return true;
  return false;
}

export function claimsHomepageRewrite(envelope, options = {}) {
  if (options.rewriteHomepage === true) return true;
  if (!envelope || typeof envelope !== "object") return false;
  if (envelope.rewritesHomepage === true || envelope.writesHomepage === true) return true;
  if (typeof envelope.claim === "string" && /homepage rewrite/i.test(envelope.claim)) return true;
  return false;
}

export function normalizePath(path) {
  if (path == null || path === "") {
    refused("pathless_record", "Path-less route records are refused", { path });
  }
  if (typeof path !== "string" || path.trim() === "") {
    refused("pathless_record", "Path-less route records are refused", { path });
  }
  const trimmed = path.trim();
  if (!trimmed.startsWith("/")) {
    refused("invalid_path", `Route path must start with /: ${trimmed}`, { path: trimmed });
  }
  return trimmed;
}

export function normalizeRoute(record, index) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    refused("invalid_record", "Catalog entry must be an object", { index });
  }
  if (!Object.prototype.hasOwnProperty.call(record, "path") || record.path == null || record.path === "") {
    refused("pathless_record", "Path-less route records are refused", { index, record });
  }
  const path = normalizePath(record.path);
  if (path === HOME_PATH) {
    refused("homepage_rewrite_refused", "Homepage path / is not a crawler shell and cannot be rewritten by this job", {
      path,
    });
  }
  if (path.endsWith("/") || path.includes("?") || path.includes("#")) {
    refused("invalid_path", "Route path must be exact and extensionless (no trailing slash, query, or hash)", {
      path,
    });
  }
  const title = record.title;
  if (typeof title !== "string" || title.trim().length === 0) {
    refused("missing_title", `Route ${path} is missing title`, { path });
  }
  const canonical = record.canonical;
  if (typeof canonical !== "string" || canonical.trim().length === 0) {
    refused("missing_canonical", `Route ${path} is missing canonical`, { path });
  }
  let canonicalUrl;
  try {
    canonicalUrl = new URL(canonical);
  } catch {
    refused("invalid_canonical", `Route ${path} canonical is not a URL`, { path, canonical });
  }
  if (canonicalUrl.href === HOME_CANONICAL || (canonicalUrl.origin === SITE_ORIGIN && canonicalUrl.pathname === HOME_PATH)) {
    refused("homepage_rewrite_refused", "Catalog claims homepage canonical; this job does not rewrite the homepage", {
      path,
      canonical: canonicalUrl.href,
    });
  }
  if (title.trim() === HOME_TITLE) {
    refused("homepage_rewrite_refused", "Catalog reuses homepage title; this job does not rewrite the homepage", {
      path,
      title,
    });
  }
  let robots = record.robots;
  if (robots == null || robots === "") robots = null;
  else if (typeof robots !== "string") {
    refused("invalid_robots", `Route ${path} robots must be a string when present`, { path, robots });
  } else robots = robots.trim() || null;

  return {
    path,
    canonical: canonicalUrl.href,
    title: title.trim(),
    robots,
  };
}

export function loadCatalogDocument(raw, locator, options = {}) {
  refuseIntegerTermsVersion(raw);
  const { envelope, routes } = extractRouteList(raw);
  refuseIntegerTermsVersion(envelope);
  if (claimsHomepageRewrite(envelope, options)) {
    refused("homepage_rewrite_refused", "Claiming homepage rewrite is refused. This job never writes index.html or spa-route-shells.js.", {
      locator,
    });
  }
  const sample = isSampleCatalog(envelope, locator);
  const publishedClaim = isPublishedClaim(envelope, options);
  if (sample && publishedClaim) {
    refused(
      "sample_not_published_route_table",
      "SAMPLE catalogs are labeled fixtures, not the published SDS route table.",
      { locator },
    );
  }
  const seen = new Set();
  const normalized = [];
  for (let i = 0; i < routes.length; i += 1) {
    const route = normalizeRoute(routes[i], i);
    if (seen.has(route.path)) refused("duplicate_path", `Duplicate path ${route.path}`, { path: route.path });
    seen.add(route.path);
    normalized.push(route);
  }
  return {
    schema: typeof envelope.schema === "string" ? envelope.schema : SCHEMA_TABLE,
    locator,
    sample,
    publishedClaim,
    publishedRouteTable: false,
    envelope,
    routes: normalized,
  };
}
