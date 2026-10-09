import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { basename, join } from "node:path";
import { catalogPath, coveragePath, invalidationsPath, recordsDir, versionsPath } from "./paths.mjs";
import { validateCatalog, validateRecord } from "./validate.mjs";
import { COVERAGE_STATEMENT } from "./schema.mjs";

export function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function listRecordFiles(root) {
  const dir = recordsDir(root);
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => join(dir, name));
}

export function documentKey(record) {
  return `${record.platformId}::${record.documentKind}`;
}

export function loadStore(root) {
  const catalog = loadJson(catalogPath(root));
  const files = listRecordFiles(root);
  const records = files.map((filePath) => ({
    filePath,
    file: basename(filePath),
    record: loadJson(filePath),
  }));
  return { root, catalog, records };
}

export function indexVersions(records) {
  const byKey = new Map();
  for (const item of records) {
    const record = item.record;
    const key = documentKey(record);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(item);
  }
  for (const group of byKey.values()) {
    group.sort((a, b) => a.record.version.observedAt.localeCompare(b.record.version.observedAt));
  }
  return byKey;
}

export function currentRecords(records) {
  return records.filter((item) => item.record.status === "current").map((item) => item.record);
}

export function validateStore(store) {
  const errors = [];
  const catalogResult = validateCatalog(store.catalog);
  errors.push(...catalogResult.errors.map((item) => ({ ...item, path: `catalog.${item.path}` })));

  const expectedFiles = new Set(store.catalog.recordFiles);
  const actualFiles = new Set(store.records.map((item) => `records/${item.file}`));
  for (const name of expectedFiles) {
    if (!actualFiles.has(name)) {
      errors.push({ code: "missing_record_file", path: name, message: "catalog lists a missing record file" });
    }
  }
  for (const name of actualFiles) {
    if (!expectedFiles.has(name)) {
      errors.push({ code: "unlisted_record_file", path: name, message: "record file is not listed in catalog" });
    }
  }

  const ids = new Set();
  const versionIds = new Set();
  for (const item of store.records) {
    const result = validateRecord(item.record);
    for (const err of result.errors) {
      errors.push({ ...err, path: `${item.file}:${err.path}` });
    }
    if (ids.has(item.record.id)) {
      errors.push({ code: "duplicate_id", path: item.file, message: `duplicate record id ${item.record.id}` });
    }
    ids.add(item.record.id);
    if (item.record.version && versionIds.has(item.record.version.id)) {
      errors.push({
        code: "duplicate_version",
        path: `${item.file}:version.id`,
        message: `duplicate version id ${item.record.version.id}`,
      });
    }
    if (item.record.version) versionIds.add(item.record.version.id);
  }

  const byKey = indexVersions(store.records);
  for (const [key, group] of byKey) {
    const current = group.filter((item) => item.record.status === "current");
    if (current.length > 1) {
      errors.push({
        code: "multiple_current_versions",
        path: key,
        message: `${key} has ${current.length} current versions`,
      });
    }
    for (const item of group) {
      const supersedes = item.record.version?.supersedes;
      if (supersedes && !ids.has(supersedes)) {
        errors.push({
          code: "missing_version",
          path: `${item.file}:version.supersedes`,
          message: `supersedes unknown record ${supersedes}`,
        });
      }
    }
  }

  const platformIds = new Set(store.records.map((item) => item.record.platformId));
  if (store.catalog.coverage?.includedPlatformCount !== platformIds.size) {
    errors.push({
      code: "invalid_shape",
      path: "catalog.coverage.includedPlatformCount",
      message: `catalog count ${store.catalog.coverage?.includedPlatformCount} != ${platformIds.size} platforms in records`,
    });
  }

  const named = new Set((store.catalog.platforms || []).map((p) => p.id));
  for (const id of platformIds) {
    if (!named.has(id)) {
      errors.push({ code: "unlisted_platform", path: id, message: "record platform is not named in catalog" });
    }
  }

  if (store.catalog.coverage?.universal === true) {
    errors.push({
      code: "universal_coverage_claim",
      path: "catalog.coverage.universal",
      message: "catalog claims universal coverage",
    });
  }

  if (existsSync(coveragePath(store.root))) {
    const text = readFileSync(coveragePath(store.root), "utf8");
    if (!text.includes(COVERAGE_STATEMENT)) {
      errors.push({
        code: "universal_coverage_claim",
        path: "COVERAGE.txt",
        message: "coverage file must include the canonical non-universal statement",
      });
    }
  }

  return { ok: errors.length === 0, errors, store };
}

export function versionsIndex(store) {
  const byKey = indexVersions(store.records);
  const documents = [];
  for (const [key, group] of byKey) {
    const [platformId, documentKind] = key.split("::");
    documents.push({
      key,
      platformId,
      documentKind,
      versions: group.map((item) => ({
        recordId: item.record.id,
        versionId: item.record.version.id,
        label: item.record.version.label,
        observedAt: item.record.version.observedAt,
        status: item.record.status,
        supersedes: item.record.version.supersedes,
        republicationRight: item.record.republication.right,
        attributionUrl: item.record.attribution.canonicalUrl,
        invalidation: item.record.invalidation,
      })),
    });
  }
  documents.sort((a, b) => a.key.localeCompare(b.key));
  return {
    schema: "samedaydesk.work-terms.versions.v1",
    universalCoverage: false,
    documents,
  };
}

export function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function appendInvalidation(root, event) {
  const filePath = invalidationsPath(root);
  mkdirSync(root, { recursive: true });
  const line = `${JSON.stringify(event)}\n`;
  writeFileSync(filePath, existsSync(filePath) ? `${readFileSync(filePath, "utf8")}${line}` : line);
}

export function writeRecord(root, record) {
  mkdirSync(recordsDir(root), { recursive: true });
  const file = `${record.id}.json`;
  const filePath = join(recordsDir(root), file);
  writeJson(filePath, record);
  return filePath;
}

export function writeVersions(root, store) {
  writeJson(versionsPath(root), versionsIndex(store));
}
