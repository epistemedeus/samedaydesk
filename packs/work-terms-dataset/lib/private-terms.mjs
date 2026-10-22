import { ACCESS_PRIVATE, ACCESS_PUBLIC, PRIVATE_SCRAPE_METHODS } from "./schema.mjs";

const PRIVATE_PATH_RE =
  /\/(dashboard|account|settings|admin|login|signin|private|internal|staff|employees?|members|my-jobs|my-account)(\/|$)/i;
const PRIVATE_HOST_RE =
  /^(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)$/i;
const CONFIDENTIAL_RE =
  /\b(confidential|do not distribute|internal only|not for publication|nda applies|employee only)\b/i;

function urlParts(raw) {
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function push(errors, message, path) {
  errors.push({
    code: "private_terms_scrape",
    path,
    message,
  });
}

export function detectPrivateTerms(record) {
  const errors = [];
  if (!record || typeof record !== "object") return errors;

  const access = record.access && typeof record.access === "object" ? record.access : {};
  const attribution =
    record.attribution && typeof record.attribution === "object" ? record.attribution : {};
  const provenance =
    record.provenance && typeof record.provenance === "object" ? record.provenance : {};

  if (ACCESS_PRIVATE.includes(access.class)) {
    push(errors, `access class ${access.class} is not public`, "access.class");
  }

  if (access.authRequired === true) {
    push(errors, "authenticated access is a private-terms scrape", "access.authRequired");
  }

  if (access.httpStatus === 401 || access.httpStatus === 403) {
    push(errors, `HTTP ${access.httpStatus} is not a public terms capture`, "access.httpStatus");
  }

  const method = access.scrapeMethod || access.method || provenance.method;
  if (PRIVATE_SCRAPE_METHODS.includes(method)) {
    push(errors, `method ${method} is a private or live scrape`, "access.scrapeMethod");
  }

  if (provenance.notLiveScraped === false) {
    push(errors, "live scrape of terms is refused", "provenance.notLiveScraped");
  }

  for (const key of ["cookie", "apiKey", "bearerToken", "authorizationHeader", "credentials"]) {
    if (Object.hasOwn(record, key) || Object.hasOwn(access, key) || Object.hasOwn(provenance, key)) {
      push(errors, `credential field ${key} indicates a private scrape`, key);
    }
  }

  const urls = [
    ["attribution.canonicalUrl", attribution.canonicalUrl],
    ["attribution.retrievedFrom", attribution.retrievedFrom],
    ["access.retrievedFrom", access.retrievedFrom],
  ];
  for (const [path, raw] of urls) {
    const parsed = urlParts(raw);
    if (!parsed) continue;
    if (PRIVATE_HOST_RE.test(parsed.hostname)) {
      push(errors, `host ${parsed.hostname} is not a public terms source`, path);
    }
    if (PRIVATE_PATH_RE.test(parsed.pathname)) {
      push(errors, `path ${parsed.pathname} is a private surface`, path);
    }
  }

  if (access.robotsDisallow === true) {
    push(errors, "robots disallow means this capture is not a public terms ingest", "access.robotsDisallow");
  }

  if (record.confidential === true || record.classification === "confidential") {
    push(errors, "confidential classification is a private-terms scrape", "classification");
  }

  for (const field of ["body", "fullText", "html"]) {
    if (typeof record[field] === "string") {
      push(errors, `stored ${field} is a terms scrape body and is refused`, field);
      if (CONFIDENTIAL_RE.test(record[field])) {
        push(errors, `${field} is marked confidential`, field);
      }
    }
  }

  if (Array.isArray(record.clauses)) {
    for (let i = 0; i < record.clauses.length; i += 1) {
      const clause = record.clauses[i];
      if (clause && typeof clause.quote === "string" && CONFIDENTIAL_RE.test(clause.quote)) {
        push(errors, "clause quote is marked confidential", `clauses[${i}].quote`);
      }
    }
  }

  if (
    typeof access.class === "string" &&
    !ACCESS_PUBLIC.includes(access.class) &&
    !ACCESS_PRIVATE.includes(access.class)
  ) {
    push(errors, `unknown access class ${access.class} is refused (fail closed)`, "access.class");
  }

  return errors;
}

export function isPrivateTermsRecord(record) {
  return detectPrivateTerms(record).length > 0;
}
