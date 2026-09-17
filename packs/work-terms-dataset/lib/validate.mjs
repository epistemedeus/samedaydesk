import {
  ACCESS_KEYS,
  ACCESS_PUBLIC,
  ATTRIBUTION_KEYS,
  CLAUSE_KEYS,
  COVERAGE_KEYS,
  CATALOG_SCHEMA,
  DEFAULT_EXCERPT_MAX,
  DOCUMENT_KINDS,
  FORBIDDEN_RECORD_KEYS,
  HTTPS_RE,
  ID_RE,
  isRfc3339Utc,
  INVALIDATION_ACTORS,
  INVALIDATION_KEYS,
  INVALIDATION_REASONS,
  NOTE_RE,
  PLATFORM_RE,
  PROVENANCE_KEYS,
  PROVENANCE_METHODS,
  QUOTE_RE,
  RECORD_KEYS,
  RECORD_SCHEMA,
  REPUBLICATION_KEYS,
  REPUBLICATION_RIGHTS,
  ROBOTS_KEYS,
  STATEMENT_RE,
  STATUSES,
  TEXT_RE,
  VERSION_KEYS,
} from "./schema.mjs";
import { detectH04Leak } from "./h04.mjs";
import { detectPrivateTerms } from "./private-terms.mjs";

function error(code, path, message) {
  return { code, path, message };
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function ownKeys(value) {
  return Object.getOwnPropertyNames(value);
}

function allowKeys(obj, allowed, path, errors) {
  const allowedSet = new Set(allowed);
  for (const key of ownKeys(obj)) {
    if (!allowedSet.has(key)) {
      errors.push(error("additional_property", `${path}.${key}`, `property ${key} is not allowed`));
    }
  }
}

function requireKeys(obj, required, path, errors) {
  for (const key of required) {
    if (!Object.hasOwn(obj, key)) {
      errors.push(error("invalid_shape", path, `missing ${key}`));
    }
  }
}

function expectString(value, re, path, errors, code = "invalid_shape") {
  if (typeof value !== "string" || !re.test(value)) {
    errors.push(error(code, path, "invalid string"));
    return false;
  }
  return true;
}

function expectEnum(value, allowed, path, errors, code = "invalid_shape") {
  if (!allowed.includes(value)) {
    errors.push(error(code, path, `expected one of ${allowed.join(", ")}`));
    return false;
  }
  return true;
}

function expectBoolean(value, path, errors) {
  if (typeof value !== "boolean") {
    errors.push(error("invalid_shape", path, "expected boolean"));
    return false;
  }
  return true;
}

function expectHttps(value, path, errors, optional = false) {
  if (value === null) {
    if (optional) return true;
    errors.push(error("invalid_shape", path, "url required"));
    return false;
  }
  return expectString(value, HTTPS_RE, path, errors, "invalid_url");
}

function expectRfc3339(value, path, errors, code = "invalid_shape") {
  if (!isRfc3339Utc(value)) {
    errors.push(error(code, path, "invalid RFC3339 UTC timestamp"));
    return false;
  }
  return true;
}

export function validateRecord(record) {
  const errors = [];
  if (!isPlainObject(record)) {
    return { ok: false, errors: [error("invalid_shape", "", "record must be a plain object")] };
  }

  for (const key of FORBIDDEN_RECORD_KEYS) {
    if (Object.hasOwn(record, key)) {
      errors.push(error("forbidden_field", key, `field ${key} is not allowed on a work-terms record`));
    }
  }

  allowKeys(record, RECORD_KEYS, "", errors);
  requireKeys(record, RECORD_KEYS, "", errors);

  if (record.schema !== RECORD_SCHEMA) {
    errors.push(error("invalid_schema", "schema", `expected ${RECORD_SCHEMA}`));
  }
  expectString(record.id, ID_RE, "id", errors);
  expectString(record.platformId, PLATFORM_RE, "platformId", errors);
  expectEnum(record.documentKind, DOCUMENT_KINDS, "documentKind", errors);
  expectEnum(record.status, STATUSES, "status", errors);

  errors.push(...detectPrivateTerms(record));
  errors.push(...detectH04Leak(record));
  errors.push(...validateVersion(record.version));
  errors.push(...validateAttribution(record.attribution));
  errors.push(...validateAccess(record.access));
  errors.push(...validateRepublication(record.republication));
  errors.push(...validateCoverage(record.coverage, "coverage"));
  errors.push(...validateProvenance(record.provenance));
  errors.push(...validateClauses(record.clauses, record.republication));
  errors.push(...validateInvalidation(record.status, record.invalidation));

  if (record.coverage && record.coverage.universal === true) {
    errors.push(error("universal_coverage_claim", "coverage.universal", "universal coverage is forbidden"));
  }

  if (record.republication && record.republication.mayCommerciallyResell === true) {
    errors.push(
      error(
        "commercial_resale_forbidden",
        "republication.mayCommerciallyResell",
        "this dataset does not grant commercial resale of third-party terms",
      ),
    );
  }

  if (
    record.attribution &&
    record.republication &&
    record.republication.mustLinkCanonical === true &&
    typeof record.attribution.canonicalUrl !== "string"
  ) {
    errors.push(error("missing_canonical", "attribution.canonicalUrl", "canonical URL required"));
  }

  return { ok: errors.length === 0, errors };
}

function validateVersion(version) {
  const errors = [];
  if (!isPlainObject(version)) {
    errors.push(error("missing_version", "version", "version must be explicit"));
    return errors;
  }
  allowKeys(version, VERSION_KEYS, "version", errors);
  requireKeys(version, VERSION_KEYS, "version", errors);
  expectString(version.id, ID_RE, "version.id", errors, "missing_version");
  expectString(version.label, /^[\x20-\x7E]{1,80}$/, "version.label", errors, "missing_version");
  expectRfc3339(version.observedAt, "version.observedAt", errors, "missing_version");
  if (version.effectiveDate !== null) {
    expectRfc3339(version.effectiveDate, "version.effectiveDate", errors);
  }
  if (version.lastUpdatedLabel !== null) {
    expectString(version.lastUpdatedLabel, /^[\x20-\x7E]{1,80}$/, "version.lastUpdatedLabel", errors);
  }
  if (version.supersedes !== null) {
    expectString(version.supersedes, ID_RE, "version.supersedes", errors);
  }
  return errors;
}

function validateAttribution(attribution) {
  const errors = [];
  if (!isPlainObject(attribution)) {
    errors.push(error("missing_attribution", "attribution", "attribution must be explicit"));
    return errors;
  }
  allowKeys(attribution, ATTRIBUTION_KEYS, "attribution", errors);
  requireKeys(attribution, ATTRIBUTION_KEYS, "attribution", errors);
  expectString(attribution.publisher, /^[\x20-\x7E]{2,120}$/, "attribution.publisher", errors, "missing_attribution");
  expectHttps(attribution.canonicalUrl, "attribution.canonicalUrl", errors);
  expectHttps(attribution.retrievedFrom, "attribution.retrievedFrom", errors);
  expectString(attribution.licenseNote, NOTE_RE, "attribution.licenseNote", errors);
  return errors;
}

function validateAccess(access) {
  const errors = [];
  if (!isPlainObject(access)) {
    errors.push(error("invalid_shape", "access", "access must be an object"));
    return errors;
  }
  allowKeys(access, ACCESS_KEYS, "access", errors);
  requireKeys(access, ACCESS_KEYS, "access", errors);
  expectEnum(access.class, ACCESS_PUBLIC, "access.class", errors);
  if (access.authRequired !== false) {
    errors.push(error("private_terms_scrape", "access.authRequired", "public ingest requires authRequired false"));
  }
  if (access.httpStatus !== 200 && access.httpStatus !== null) {
    errors.push(error("invalid_shape", "access.httpStatus", "httpStatus must be 200 or null for metadata-only"));
  }
  if (!isPlainObject(access.robots)) {
    errors.push(error("invalid_shape", "access.robots", "robots must be an object"));
    return errors;
  }
  allowKeys(access.robots, ROBOTS_KEYS, "access.robots", errors);
  requireKeys(access.robots, ["userAgentStar", "sourceUrl"], "access.robots", errors);
  expectEnum(access.robots.userAgentStar, ["allow", "disallow", "unknown", "none_found"], "access.robots.userAgentStar", errors);
  if (access.robots.sourceUrl !== null) {
    expectHttps(access.robots.sourceUrl, "access.robots.sourceUrl", errors);
  }
  if (Object.hasOwn(access.robots, "notes") && access.robots.notes !== null) {
    expectString(access.robots.notes, NOTE_RE, "access.robots.notes", errors);
  }
  if (access.robots.userAgentStar === "disallow") {
    errors.push(error("private_terms_scrape", "access.robots.userAgentStar", "robots Disallow is not a public ingest"));
  }
  return errors;
}

function validateRepublication(republication) {
  const errors = [];
  if (!isPlainObject(republication)) {
    errors.push(error("missing_republication", "republication", "republication rights must be explicit"));
    return errors;
  }
  allowKeys(republication, REPUBLICATION_KEYS, "republication", errors);
  requireKeys(republication, REPUBLICATION_KEYS, "republication", errors);
  expectEnum(republication.right, REPUBLICATION_RIGHTS, "republication.right", errors, "missing_republication");
  expectBoolean(republication.mayStoreFullBody, "republication.mayStoreFullBody", errors);
  expectBoolean(republication.mayCommerciallyResell, "republication.mayCommerciallyResell", errors);
  expectBoolean(republication.mustAttribute, "republication.mustAttribute", errors);
  expectBoolean(republication.mustLinkCanonical, "republication.mustLinkCanonical", errors);
  if (typeof republication.excerptMaxChars !== "number" || !Number.isInteger(republication.excerptMaxChars) || republication.excerptMaxChars < 0 || republication.excerptMaxChars > DEFAULT_EXCERPT_MAX) {
    errors.push(error("invalid_shape", "republication.excerptMaxChars", `excerptMaxChars must be 0..${DEFAULT_EXCERPT_MAX}`));
  }
  expectString(republication.statement, STATEMENT_RE, "republication.statement", errors, "missing_republication");
  if (republication.mustAttribute !== true) {
    errors.push(error("attribution_required", "republication.mustAttribute", "attribution is required for every record"));
  }
  if (republication.mustLinkCanonical !== true && republication.right !== "no_republication") {
    errors.push(error("canonical_link_required", "republication.mustLinkCanonical", "canonical link is required unless no_republication"));
  }
  if (["metadata_only", "no_republication", "unknown_counsel"].includes(republication.right) && republication.excerptMaxChars !== 0) {
    errors.push(error("excerpt_not_allowed", "republication.excerptMaxChars", "this republication right forbids excerpts"));
  }
  if (republication.mayStoreFullBody === true) {
    errors.push(error("full_body_without_republication_right", "republication.mayStoreFullBody", "this dataset never stores full terms bodies"));
  }
  return errors;
}

function validateCoverage(coverage, path) {
  const errors = [];
  if (!isPlainObject(coverage)) {
    errors.push(error("universal_coverage_claim", path, "coverage must be explicit and non-universal"));
    return errors;
  }
  allowKeys(coverage, COVERAGE_KEYS, path, errors);
  requireKeys(coverage, COVERAGE_KEYS, path, errors);
  if (coverage.universal !== false) {
    errors.push(error("universal_coverage_claim", `${path}.universal`, "universal coverage is forbidden"));
  }
  if (coverage.namedSourceOnly !== true) {
    errors.push(error("universal_coverage_claim", `${path}.namedSourceOnly`, "named-source-only must be true"));
  }
  return errors;
}

function validateProvenance(provenance) {
  const errors = [];
  if (!isPlainObject(provenance)) {
    errors.push(error("invalid_shape", "provenance", "provenance must be an object"));
    return errors;
  }
  allowKeys(provenance, PROVENANCE_KEYS, "provenance", errors);
  requireKeys(provenance, PROVENANCE_KEYS, "provenance", errors);
  expectEnum(provenance.method, PROVENANCE_METHODS, "provenance.method", errors);
  if (provenance.notLiveScraped !== true) {
    errors.push(error("private_terms_scrape", "provenance.notLiveScraped", "live scrapes are refused"));
  }
  expectString(provenance.sourceNote, TEXT_RE, "provenance.sourceNote", errors);
  return errors;
}

function validateClauses(clauses, republication) {
  const errors = [];
  if (!Array.isArray(clauses)) {
    errors.push(error("invalid_shape", "clauses", "clauses must be an array"));
    return errors;
  }
  const max = republication && typeof republication.excerptMaxChars === "number" ? republication.excerptMaxChars : 0;
  const quotesAllowed = republication && ["cite_and_link", "short_excerpt", "public_license"].includes(republication.right);
  for (let i = 0; i < clauses.length; i += 1) {
    const clause = clauses[i];
    const path = `clauses[${i}]`;
    if (!isPlainObject(clause)) {
      errors.push(error("invalid_shape", path, "clause must be an object"));
      continue;
    }
    allowKeys(clause, CLAUSE_KEYS, path, errors);
    requireKeys(clause, CLAUSE_KEYS, path, errors);
    expectString(clause.id, ID_RE, `${path}.id`, errors);
    expectString(clause.summary, NOTE_RE, `${path}.summary`, errors);
    if (clause.quote !== null) {
      if (!quotesAllowed || max === 0) {
        errors.push(error("excerpt_not_allowed", `${path}.quote`, "this republication right forbids quotes"));
      } else if (typeof clause.quote !== "string" || clause.quote.length === 0 || clause.quote.length > max || !QUOTE_RE.test(clause.quote)) {
        errors.push(error("excerpt_too_long", `${path}.quote`, `quote must be 1..${max} printable chars`));
      }
    }
    if (clause.quoteSourceUrl !== null) {
      expectHttps(clause.quoteSourceUrl, `${path}.quoteSourceUrl`, errors);
    }
  }
  return errors;
}

function validateInvalidation(status, invalidation) {
  const errors = [];
  if (status === "invalidated") {
    if (!isPlainObject(invalidation)) {
      errors.push(error("invalidation_required", "invalidation", "invalidated records need an invalidation block"));
      return errors;
    }
    allowKeys(invalidation, INVALIDATION_KEYS, "invalidation", errors);
    requireKeys(invalidation, INVALIDATION_KEYS, "invalidation", errors);
    expectRfc3339(invalidation.at, "invalidation.at", errors);
    expectEnum(invalidation.reason, INVALIDATION_REASONS, "invalidation.reason", errors);
    expectString(invalidation.note, NOTE_RE, "invalidation.note", errors);
    expectEnum(invalidation.actor, INVALIDATION_ACTORS, "invalidation.actor", errors);
  } else if (invalidation !== null) {
    errors.push(error("invalid_shape", "invalidation", "invalidation must be null unless status is invalidated"));
  }
  return errors;
}

export function validateCatalog(catalog) {
  const errors = [];
  if (!isPlainObject(catalog)) {
    return { ok: false, errors: [error("invalid_shape", "", "catalog must be a plain object")] };
  }
  const keys = [
    "schema",
    "pack",
    "coverage",
    "disjointFrom",
    "liveScrape",
    "platforms",
    "coverageGaps",
    "recordFiles",
  ];
  allowKeys(catalog, keys, "", errors);
  requireKeys(catalog, keys, "", errors);
  if (catalog.schema !== CATALOG_SCHEMA) {
    errors.push(error("invalid_schema", "schema", `expected ${CATALOG_SCHEMA}`));
  }
  if (catalog.pack !== "work-terms-dataset") {
    errors.push(error("invalid_shape", "pack", "pack must be work-terms-dataset"));
  }
  if (catalog.liveScrape !== false) {
    errors.push(error("private_terms_scrape", "liveScrape", "this pack does not scrape"));
  }
  errors.push(...validateCatalogCoverage(catalog.coverage));
  if (!Array.isArray(catalog.disjointFrom) || !catalog.disjointFrom.includes("H04 licensed regression packs")) {
    errors.push(error("h04_regression_pack_leak", "disjointFrom", "catalog must be disjoint from H04"));
  }
  if (!Array.isArray(catalog.platforms) || catalog.platforms.length === 0) {
    errors.push(error("invalid_shape", "platforms", "named platforms required"));
  } else {
    for (let i = 0; i < catalog.platforms.length; i += 1) {
      const platform = catalog.platforms[i];
      const path = `platforms[${i}]`;
      if (!isPlainObject(platform)) {
        errors.push(error("invalid_shape", path, "platform must be an object"));
        continue;
      }
      if (typeof platform.id !== "string" || !PLATFORM_RE.test(platform.id)) {
        errors.push(error("invalid_shape", `${path}.id`, "platform id required"));
      }
      if (!Array.isArray(platform.documents) || platform.documents.length === 0) {
        errors.push(error("invalid_shape", `${path}.documents`, "named documents required"));
      } else {
        for (let j = 0; j < platform.documents.length; j += 1) {
          if (!DOCUMENT_KINDS.includes(platform.documents[j])) {
            errors.push(error("invalid_shape", `${path}.documents[${j}]`, "unknown document kind"));
          }
        }
      }
    }
  }
  if (!Array.isArray(catalog.coverageGaps) || catalog.coverageGaps.length === 0) {
    errors.push(error("universal_coverage_claim", "coverageGaps", "gaps must be listed; silence would imply universal coverage"));
  }
  if (!Array.isArray(catalog.recordFiles) || catalog.recordFiles.length === 0) {
    errors.push(error("invalid_shape", "recordFiles", "recordFiles required"));
  }
  return { ok: errors.length === 0, errors };
}

function validateCatalogCoverage(coverage) {
  const errors = [];
  if (!isPlainObject(coverage)) {
    errors.push(error("universal_coverage_claim", "coverage", "coverage must be explicit"));
    return errors;
  }
  const keys = ["universal", "namedSourceOnly", "statement", "includedPlatformCount"];
  allowKeys(coverage, keys, "coverage", errors);
  requireKeys(coverage, keys, "coverage", errors);
  if (coverage.universal !== false) {
    errors.push(error("universal_coverage_claim", "coverage.universal", "universal coverage is forbidden"));
  }
  if (coverage.namedSourceOnly !== true) {
    errors.push(error("universal_coverage_claim", "coverage.namedSourceOnly", "named-source-only must be true"));
  }
  if (typeof coverage.statement !== "string" || !/not a complete or universal/i.test(coverage.statement)) {
    errors.push(error("universal_coverage_claim", "coverage.statement", "statement must deny universal coverage"));
  }
  if (typeof coverage.includedPlatformCount !== "number" || coverage.includedPlatformCount < 1) {
    errors.push(error("invalid_shape", "coverage.includedPlatformCount", "count required"));
  }
  return errors;
}

export function codesOf(result) {
  return result.errors.map((item) => item.code);
}
