import { SCHEMA_TABLE } from "./constants.mjs";
import { refuseIntegerTermsVersion } from "./digest.mjs";
import { refused } from "./errors.mjs";
import { findExpressCollisions, frameworkConfigOf, normalizeExpressRoute } from "./express.mjs";
import { assertNotHomeTitle, canonicalIdentity, normalizeRoutePath } from "./identity.mjs";

const SAMPLE_MARKERS = ["sample", "samplelabel", "label", "kind", "sourcekind", "authority"];

function looksLikeOpenApi(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  if (typeof raw.openapi === "string" || typeof raw.swagger === "string") return true;
  return raw.paths != null && typeof raw.paths === "object" && !Array.isArray(raw.paths);
}

export function refuseUnsupportedCatalog(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const hasSdsList = Array.isArray(raw.routes) || Array.isArray(raw.catalog);
  if (hasSdsList) return;
  if (looksLikeOpenApi(raw)) {
    refused(
      "unsupported_catalog",
      "OpenAPI path maps are not SDS route catalogs. This job compares {path, canonical, title, robots?} records only and does not force unlike schemas equal.",
      { format: "openapi" },
    );
  }
  if (raw.pages && typeof raw.pages === "object" && !Array.isArray(raw.pages)) {
    refused(
      "unsupported_catalog",
      "Framework page maps are not SDS route catalogs. Provide routes or catalog arrays of {path, canonical, title, robots?} records.",
      { format: "pages-map" },
    );
  }
}

export function extractRouteList(raw) {
  refuseUnsupportedCatalog(raw);
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
  return normalizeRoutePath(path);
}

function isFrameworkRecord(record) {
  if (!record || typeof record !== "object") return false;
  const hasSdsFields = typeof record.canonical === "string" || typeof record.title === "string";
  if (hasSdsFields) return false;
  return (
    Object.prototype.hasOwnProperty.call(record, "method") ||
    Object.prototype.hasOwnProperty.call(record, "handler") ||
    Object.prototype.hasOwnProperty.call(record, "operationId") ||
    Object.prototype.hasOwnProperty.call(record, "component")
  );
}

export function normalizeRoute(record, index, framework = null) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    refused("invalid_record", "Catalog entry must be an object", { index });
  }
  if (framework?.kind === "express") return normalizeExpressRoute(record, index, framework);
  if (isFrameworkRecord(record)) {
    refused(
      "unsupported_catalog",
      "Framework route records need an SDS adapter. This job does not invent canonical or title from method, handler, or operationId fields.",
      { index, path: record.path ?? null },
    );
  }
  if (!Object.prototype.hasOwnProperty.call(record, "path") || record.path == null || record.path === "") {
    refused("pathless_record", "Path-less route records are refused", { index, record });
  }
  const path = normalizeRoutePath(record.path);
  const title = record.title;
  if (typeof title !== "string" || title.trim().length === 0) {
    refused("missing_title", `Route ${path} is missing title`, { path });
  }
  assertNotHomeTitle(title, path);
  const canonical = canonicalIdentity(record.canonical, { path });
  let robots = record.robots;
  if (robots == null || robots === "") robots = null;
  else if (typeof robots !== "string") {
    refused("invalid_robots", `Route ${path} robots must be a string when present`, { path, robots });
  } else robots = robots.trim() || null;

  return {
    path,
    canonical,
    title: title.trim(),
    robots,
    index,
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
  const framework = frameworkConfigOf(envelope);
  const byPath = new Map();
  const records = [];
  const unique = [];
  const collisions = [];
  for (let i = 0; i < routes.length; i += 1) {
    const route = normalizeRoute(routes[i], i, framework);
    records.push(route);
    const identity = route.matchKey ?? route.path;
    if (!byPath.has(identity)) {
      byPath.set(identity, [route]);
      unique.push(route);
    } else {
      byPath.get(identity).push(route);
    }
  }
  if (framework?.kind === "express") {
    collisions.push(...findExpressCollisions(records));
  } else {
    for (const [path, group] of byPath) {
      if (group.length > 1) {
        collisions.push({
          kind: "path",
          path,
          indexes: group.map((route) => route.index),
          records: group.map((route) => ({
            path: route.path,
            canonical: route.canonical,
            title: route.title,
            robots: route.robots,
          })),
        });
      }
    }
    const byCanonical = new Map();
    for (const route of unique) {
      const group = byCanonical.get(route.canonical) || [];
      group.push(route);
      byCanonical.set(route.canonical, group);
    }
    for (const [canonical, group] of byCanonical) {
      if (group.length > 1) {
        collisions.push({
          kind: "canonical",
          canonical,
          paths: group.map((route) => route.path),
          indexes: group.map((route) => route.index),
        });
      }
    }
  }
  return {
    schema: typeof envelope.schema === "string" ? envelope.schema : SCHEMA_TABLE,
    locator,
    sample,
    publishedClaim,
    publishedRouteTable: false,
    kind: framework?.kind ?? "sds",
    framework,
    envelope,
    records,
    routes: unique,
    collisions,
  };
}
