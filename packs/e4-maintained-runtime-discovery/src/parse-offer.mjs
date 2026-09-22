import { fail } from "./failures.mjs";
import {
  CATALOG_SCHEMA,
  DISCOVERY_SCHEMA,
  LLMS_REQUIRED_POINTERS,
  PACKAGE_ID,
  SITE_ORIGIN,
  SURFACES,
} from "./surfaces.mjs";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function textHasExactUrl(text, url) {
  let from = 0;
  while (from < text.length) {
    const i = text.indexOf(url, from);
    if (i === -1) return false;
    const next = text[i + url.length];
    if (!next || !/[A-Za-z0-9/_-]/.test(next)) return true;
    from = i + 1;
  }
  return false;
}

function maintainedHttpsUrl(value, { exactPath = null, pathPrefixes = null } = {}) {
  if (typeof value !== "string" || !value.trim()) return false;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || parsed.origin !== SITE_ORIGIN) return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.search || parsed.hash) return false;
  if (exactPath != null) return parsed.pathname === exactPath;
  if (pathPrefixes) {
    return pathPrefixes.some((prefix) => parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`));
  }
  return true;
}

function jobsFrom(doc) {
  if (!doc) return null;
  if (Array.isArray(doc.jobs)) return doc.jobs;
  return null;
}

function jobIdsFromDiscovery(jobs) {
  if (!Array.isArray(jobs)) return [];
  return jobs.map((job) => (typeof job === "string" ? job : job && job.id)).filter((id) => id != null);
}

function archiveFrom(doc) {
  if (!isPlainObject(doc)) return null;
  if (isPlainObject(doc.archive)) return doc.archive;
  return null;
}

/**
 * Parse an existing useful-jobs discovery document.
 * A 2xx/readable body with no offer is silent_empty_success, never ok:true.
 */
export function parseDiscoveryDocument(raw, { httpStatus = null, source = "discovery" } = {}) {
  const twoXx = httpStatus == null || (httpStatus >= 200 && httpStatus < 300);
  if (!twoXx) {
    return fail("http_error", `HTTP ${httpStatus} from ${source}`, { httpStatus, source });
  }

  if (raw == null || String(raw).trim() === "") {
    return fail("silent_empty_success", "2xx empty body is not an offer", {
      httpStatus,
      source,
      seeded: "silent_empty_success",
    });
  }

  let doc;
  try {
    doc = JSON.parse(String(raw));
  } catch (err) {
    return fail("invalid_json", err?.message || "invalid JSON", { source });
  }

  if (!isPlainObject(doc)) {
    return fail("invalid_document", "discovery body must be a JSON object", { source });
  }

  if (doc.ok === false || doc.error) {
    return fail("explicit_document_error", String(doc.error || doc.message || "document declared failure"), {
      source,
      documentError: doc.error || doc.message || true,
    });
  }

  if (doc.schema != null && doc.schema !== DISCOVERY_SCHEMA) {
    return fail("invalid_schema", `schema ${JSON.stringify(doc.schema)} is not ${DISCOVERY_SCHEMA}`, {
      source,
      schema: doc.schema,
    });
  }

  if (doc.package != null && doc.package !== PACKAGE_ID) {
    return fail("wrong_package", `package ${JSON.stringify(doc.package)} is not ${PACKAGE_ID}`, {
      source,
      package: doc.package,
    });
  }

  const jobs = jobsFrom(doc);
  const ids = jobIdsFromDiscovery(jobs);
  const archive = archiveFrom(doc);
  const version = typeof doc.version === "string" && doc.version.trim() ? doc.version.trim() : null;

  if (!Array.isArray(jobs) || jobs.length === 0) {
    return fail(
      "silent_empty_success",
      "2xx JSON looks successful but names no useful-jobs offer (empty object, ok:true, or empty jobs)",
      {
        httpStatus,
        source,
        seeded: "silent_empty_success",
        keys: Object.keys(doc),
        jobCount: ids.length,
        okField: doc.ok,
      },
    );
  }

  if (doc.schema !== DISCOVERY_SCHEMA) {
    return fail("invalid_schema", `missing schema ${DISCOVERY_SCHEMA}`, { source });
  }
  if (doc.package !== PACKAGE_ID) {
    return fail("wrong_package", "missing package useful-jobs", { source });
  }
  if (!version) {
    return fail("invalid_document", "version is missing or blank", { source });
  }
  for (const id of ids) {
    if (typeof id !== "string" || !id.trim()) {
      return fail("empty_job_id", "each job id must be a non-empty string", { source });
    }
  }
  if (ids.length !== jobs.length) {
    return fail("empty_job_id", "jobs array contains a non-id entry", { source });
  }
  if (new Set(ids).size !== ids.length) {
    return fail("empty_job_id", "duplicate job id", { source, jobs: ids });
  }

  if (!isPlainObject(archive)) {
    return fail("missing_archive", "jobs named but archive sha256/bytes/url missing", {
      httpStatus,
      source,
      jobCount: ids.length,
    });
  }
  if (!/^[0-9a-f]{64}$/i.test(String(archive.sha256 || ""))) {
    return fail("missing_archive", "archive.sha256 must be 64 hex chars", { source });
  }
  if (!Number.isInteger(archive.bytes) || archive.bytes <= 0) {
    return fail("missing_archive", "archive.bytes must be a positive integer", { source });
  }
  const archiveUrl = archive.url || doc.archiveUrl || null;
  const archivePath = typeof archive.path === "string" && archive.path.trim() ? archive.path.trim() : null;
  if (!archiveUrl && !archivePath) {
    return fail("missing_archive", "archive.url or archive.path required", { source });
  }
  const archivePrefixes = ["/for-agents/useful-jobs", "/kit"];
  if (archiveUrl && !maintainedHttpsUrl(archiveUrl, { pathPrefixes: archivePrefixes })) {
    return fail("invalid_document", "archive.url is not a maintained SameDayDesk https URL", {
      source,
      archiveUrl,
    });
  }
  if (archivePath && !archivePrefixes.some((prefix) => archivePath === prefix || archivePath.startsWith(`${prefix}/`))) {
    return fail("invalid_document", "archive.path is not a maintained useful-jobs path", {
      source,
      archivePath,
    });
  }

  if (doc.paidHostedClaim === true) {
    return fail("paid_hosted_claim_not_this_offer", "useful-jobs is a free offline package", { source });
  }

  if (typeof doc.page === "string" && doc.page.trim() && !maintainedHttpsUrl(doc.page.trim(), { exactPath: SURFACES.page.path })) {
    return fail("invalid_document", "page is not the maintained useful-jobs URL", { source, page: doc.page });
  }
  if (
    typeof doc.jobsCatalogUrl === "string" &&
    doc.jobsCatalogUrl.trim() &&
    !maintainedHttpsUrl(doc.jobsCatalogUrl.trim(), { exactPath: SURFACES.catalog.path })
  ) {
    return fail("invalid_document", "jobsCatalogUrl is not the maintained catalog URL", {
      source,
      jobsCatalogUrl: doc.jobsCatalogUrl,
    });
  }

  const page = typeof doc.page === "string" && doc.page.trim() ? doc.page.trim() : SURFACES.page.url;
  const catalogUrl =
    typeof doc.jobsCatalogUrl === "string" && doc.jobsCatalogUrl.trim() ? doc.jobsCatalogUrl.trim() : SURFACES.catalog.url;

  return {
    ok: true,
    offer: {
      package: PACKAGE_ID,
      schema: DISCOVERY_SCHEMA,
      version,
      title: typeof doc.title === "string" ? doc.title : null,
      summary: typeof doc.summary === "string" ? doc.summary : null,
      page,
      discoveryPath: SURFACES.discovery.path,
      discoveryUrl: SURFACES.discovery.url,
      catalogUrl,
      archive: {
        path: archivePath,
        url: archiveUrl,
        kitPath: archive.kitPath || null,
        sha256: String(archive.sha256).toLowerCase(),
        bytes: archive.bytes,
      },
      jobs: ids,
      purchaseAuthority: doc.purchaseAuthority === true,
      paidHostedClaim: false,
      schedulerDaemon: doc.schedulerDaemon === true,
      freeOffline: doc.freeOffline !== false,
      firstOffer: ids[0],
    },
    document: doc,
  };
}

export function parseCatalogDocument(raw, expectedJobIds, { source = "catalog" } = {}) {
  if (raw == null || String(raw).trim() === "") {
    return fail("catalog_invalid", "catalog body is empty", { source });
  }
  let doc;
  try {
    doc = JSON.parse(String(raw));
  } catch (err) {
    return fail("catalog_invalid", err?.message || "catalog is not JSON", { source });
  }
  if (!isPlainObject(doc)) {
    return fail("catalog_invalid", "catalog must be a JSON object", { source });
  }
  if (doc.schema !== CATALOG_SCHEMA) {
    return fail("catalog_invalid", `catalog schema is not ${CATALOG_SCHEMA}`, { source, schema: doc.schema });
  }
  if (doc.package !== PACKAGE_ID) {
    return fail("catalog_invalid", "catalog package is not useful-jobs", { source });
  }
  if (!Array.isArray(doc.jobs) || doc.jobs.length === 0) {
    return fail("silent_empty_success", "catalog jobs array is empty", {
      source,
      seeded: "silent_empty_success",
    });
  }
  const ids = doc.jobs.map((job) => (typeof job === "string" ? job : job && job.id));
  for (const id of ids) {
    if (typeof id !== "string" || !id.trim()) {
      return fail("empty_job_id", "catalog job missing id", { source });
    }
  }
  if (new Set(ids).size !== ids.length) {
    return fail("empty_job_id", "duplicate catalog job id", { source, jobs: ids });
  }
  const expected = [...expectedJobIds];
  const sameLength = ids.length === expected.length;
  const sameSet =
    sameLength && expected.every((id) => ids.includes(id)) && ids.every((id) => expected.includes(id));
  if (!sameSet) {
    return fail("catalog_job_mismatch", "catalog job ids do not match discovery jobs", {
      source,
      discoveryJobs: expected,
      catalogJobs: ids,
    });
  }
  const firstOffer = typeof doc.firstOffer === "string" && doc.firstOffer.trim() ? doc.firstOffer.trim() : ids[0];
  if (!ids.includes(firstOffer)) {
    return fail("catalog_job_mismatch", "catalog firstOffer is not in catalog jobs", {
      source,
      firstOffer,
      catalogJobs: ids,
    });
  }
  return {
    ok: true,
    catalog: {
      schema: doc.schema,
      package: doc.package,
      version: doc.version || null,
      firstOffer,
      jobs: ids,
    },
    document: doc,
  };
}

export function parseLlmsPointer(raw, { source = "llms" } = {}) {
  const text = String(raw || "");
  if (!text.trim()) {
    return fail("llms_pointer_missing", "llms.txt body is empty", { source });
  }
  const missing = LLMS_REQUIRED_POINTERS.filter((needle) => !textHasExactUrl(text, needle));
  if (missing.length) {
    return fail("llms_pointer_missing", `llms.txt missing ${missing.join(", ")}`, { source, missing });
  }
  return {
    ok: true,
    llms: {
      pointerFound: true,
      pointers: [...LLMS_REQUIRED_POINTERS],
    },
  };
}
