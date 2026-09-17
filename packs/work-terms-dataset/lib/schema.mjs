export const RECORD_SCHEMA = "samedaydesk.work-terms.record.v1";
export const CATALOG_SCHEMA = "samedaydesk.work-terms.catalog.v1";
export const PIN_SCHEMA = "samedaydesk.work-terms-dataset.pin.v1";

export const DOCUMENT_KINDS = Object.freeze([
  "terms",
  "acceptable_use",
  "charter",
  "agent_rules",
  "contributor_terms",
  "placeholder_stub",
]);

export const ACCESS_PUBLIC = Object.freeze([
  "public_url",
  "public_api",
  "public_machine_doc",
]);

export const ACCESS_PRIVATE = Object.freeze([
  "private",
  "auth_gated",
  "nda",
  "internal",
  "confidential",
  "paywalled",
]);

export const REPUBLICATION_RIGHTS = Object.freeze([
  "cite_and_link",
  "short_excerpt",
  "public_license",
  "metadata_only",
  "no_republication",
  "unknown_counsel",
]);

export const STATUSES = Object.freeze(["current", "superseded", "invalidated"]);

export const INVALIDATION_ACTORS = Object.freeze(["operator", "ingest-supersede", "policy"]);

export const REPUBLICATION_FORBIDDEN = Object.freeze([
  "metadata_only",
  "no_republication",
  "unknown_counsel",
]);

export const INVALIDATION_REASONS = Object.freeze([
  "rights_withdrawn",
  "access_became_private",
  "no_longer_public",
  "placeholder_not_operative",
  "operator_error",
  "robots_disallow",
  "source_requested_removal",
]);

export const PROVENANCE_METHODS = Object.freeze([
  "operator_supplied_public_metadata",
  "committed_first_party_source",
]);

export const PRIVATE_SCRAPE_METHODS = Object.freeze([
  "authenticated_session",
  "cookie",
  "bearer",
  "basic_auth",
  "api_key",
  "vpn",
  "private_network",
  "ssh_tunnel",
  "logged_in_scrape",
  "live_scrape",
  "html_scrape",
]);

export const RECORD_KEYS = Object.freeze([
  "schema",
  "id",
  "platformId",
  "documentKind",
  "version",
  "attribution",
  "access",
  "republication",
  "status",
  "invalidation",
  "clauses",
  "coverage",
  "provenance",
]);

export const VERSION_KEYS = Object.freeze([
  "id",
  "label",
  "observedAt",
  "effectiveDate",
  "lastUpdatedLabel",
  "supersedes",
]);

export const ATTRIBUTION_KEYS = Object.freeze([
  "publisher",
  "canonicalUrl",
  "retrievedFrom",
  "licenseNote",
]);

export const ACCESS_KEYS = Object.freeze([
  "class",
  "authRequired",
  "httpStatus",
  "robots",
]);

export const ROBOTS_KEYS = Object.freeze(["userAgentStar", "sourceUrl", "notes"]);

export const REPUBLICATION_KEYS = Object.freeze([
  "right",
  "mayStoreFullBody",
  "mayCommerciallyResell",
  "excerptMaxChars",
  "mustAttribute",
  "mustLinkCanonical",
  "statement",
]);

export const COVERAGE_KEYS = Object.freeze(["universal", "namedSourceOnly"]);

export const PROVENANCE_KEYS = Object.freeze([
  "method",
  "notLiveScraped",
  "sourceNote",
]);

export const CLAUSE_KEYS = Object.freeze([
  "id",
  "summary",
  "quote",
  "quoteSourceUrl",
]);

export const INVALIDATION_KEYS = Object.freeze(["at", "reason", "note", "actor"]);

export const FORBIDDEN_RECORD_KEYS = Object.freeze([
  "body",
  "fullText",
  "html",
  "hiddenAnswers",
  "evaluatorAnswers",
  "goldAnswers",
  "regressionPack",
  "licensedEval",
  "cookie",
  "apiKey",
  "bearerToken",
  "authorizationHeader",
  "credentials",
]);

export const H04_MARKERS = Object.freeze([
  "hiddenAnswers",
  "evaluatorAnswers",
  "goldAnswers",
  "regressionPack",
  "licensedEval",
  "evaluatorOracle",
]);

export const ID_RE = /^[a-z][a-z0-9-]{2,95}$/;
export const PLATFORM_RE = /^[a-z][a-z0-9-]{1,63}$/;
export const RFC3339_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;

export function isRfc3339Utc(value) {
  if (typeof value !== "string") return false;
  const match = RFC3339_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const dt = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day &&
    dt.getUTCHours() === hour &&
    dt.getUTCMinutes() === minute &&
    dt.getUTCSeconds() === second
  );
}
export const HTTPS_RE = /^https:\/\/[A-Za-z0-9][A-Za-z0-9.-]{0,253}(?::\d{1,5})?(?:\/[\x21-\x7E]*)?$/;
export const TEXT_RE = /^[\x20-\x7E\n]{1,800}$/;
export const STATEMENT_RE = /^[\x20-\x7E]{16,400}$/;
export const QUOTE_RE = /^[\x20-\x7E]{1,280}$/;
export const NOTE_RE = /^[\x20-\x7E]{1,400}$/;

export const DEFAULT_EXCERPT_MAX = 280;

export const COVERAGE_STATEMENT =
  "This dataset covers only the named public sources below. It is not a complete or universal corpus of work terms.";

export const DISJOINT_FROM = Object.freeze([
  "H04 licensed regression packs",
]);
