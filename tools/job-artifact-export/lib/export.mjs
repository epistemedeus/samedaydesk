import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { detectJobId, loadCatalog, assertKnownJobId } from "./catalog.mjs";
import { createHashTermsAdapter, assertNotIntegerTermsVersion } from "./hash-terms.mjs";
import { inferProvenanceLabel, resolveLabel } from "./labels.mjs";
import {
  FILE_MAX_BYTES,
  JSONL_SCHEMA,
  SCHEMA,
  SCHEMA_VERSION,
  TERMS_SCHEMA,
  USEFUL_JOBS_ARCHIVE_SHA256,
  archivePath,
  catalogPath,
  isSha256Prefixed,
  loadKitPin,
  prefixSha256,
  sha256Prefixed,
  verifyArchiveFile,
} from "./pins.mjs";
import { refuse } from "./refuse.mjs";
import { listExportFiles, readExportFile, sha256File } from "./scan.mjs";
import { buildStoredZip } from "./zip.mjs";

function parseJsonIfPossible(buf) {
  const text = buf.toString("utf8");
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
}

function mediaType(path) {
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".jsonl")) return "application/jsonl";
  if (path.endsWith(".ics")) return "text/calendar";
  if (path.endsWith(".md")) return "text/markdown";
  if (path.endsWith(".xml")) return "application/xml";
  if (path.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

function firstJsonAppId(files) {
  for (const file of files) {
    if (file.json && typeof file.json.appId === "string") return file.json.appId;
  }
  return null;
}

export function exportJobArtifacts(options) {
  const inDir = resolve(options.inDir || "");
  const outDir = resolve(options.out || "");
  if (!options.inDir) throw refuse("missing-required-inputs", "export requires --in-dir");
  if (!options.out) throw refuse("missing-required-inputs", "export requires --out");
  if (inDir === outDir || outDir.startsWith(`${inDir}/`) || inDir.startsWith(`${outDir}/`)) {
    throw refuse("out-dir-collides-with-input", "--out collides with --in-dir");
  }

  const repoRoot = options.repoRoot;
  const catalog = loadCatalog(options.catalog || catalogPath(repoRoot));
  const kit = options.enginePin || loadKitPin(repoRoot);
  const archiveFile = options.archiveFile || archivePath(repoRoot);
  if (!options.skipArchiveVerify) {
    const verified = verifyArchiveFile(archiveFile, (kit.archiveSha256 || "").replace(/^sha256:/, "") || USEFUL_JOBS_ARCHIVE_SHA256);
    if (!verified.ok) throw refuse(verified.code, verified.message);
  }
  const archiveSha256 = prefixSha256(options.archiveSha256 || kit.archiveSha256 || USEFUL_JOBS_ARCHIVE_SHA256);
  if (!isSha256Prefixed(archiveSha256)) {
    throw refuse("invalid-archive-sha256", "archive sha256 must be 64 hex, optionally sha256-prefixed");
  }

  const hasher = createHashTermsAdapter(options.hashTerms || {});
  if (options.termsVersion !== undefined) assertNotIntegerTermsVersion(options.termsVersion);

  const listed = listExportFiles(inDir);
  const files = listed.map((entry) => {
    const data = readExportFile(entry.abs);
    const parsed = parseJsonIfPossible(data);
    return {
      ...entry,
      data,
      sha256: prefixSha256(sha256File(entry.abs)),
      text: parsed.text,
      json: parsed.json,
      mediaType: mediaType(entry.path),
    };
  });

  const inferred = inferProvenanceLabel(files);
  const labelResult = resolveLabel({
    inferred,
    requestedLabel: options.label || null,
    asCustomerDelivery: options.as === "customer-delivery" || options.as === "customer",
  });
  if (!labelResult.ok) throw refuse(labelResult.code, labelResult.message, { inferred: inferred.label });

  const jobId = options.jobId || detectJobId(files.map((f) => f.path.split("/").pop()), catalog, firstJsonAppId(files));
  assertKnownJobId(jobId, catalog);

  const engine = {
    package: kit.package,
    version: kit.version,
    node: kit.node,
    archiveSha256,
    sourceCommit: kit.sourceCommit,
    archiveFreeze: kit.archiveFreeze,
  };
  const enginePin = hasher.hashTermsVersion({
    schema: "samedaydesk.job-artifact-export.engine-pin.v1",
    schemaVersion: SCHEMA_VERSION,
    ...engine,
  });

  const fileRecords = files.map((file) => ({
    schema: JSONL_SCHEMA,
    path: file.path,
    bytes: file.bytes,
    sha256: file.sha256,
    mediaType: file.mediaType,
    label: labelResult.label,
    jobId,
    enginePin,
  }));

  const terms = {
    schema: TERMS_SCHEMA,
    schemaVersion: SCHEMA_VERSION,
    jobId,
    label: labelResult.label,
    archiveSha256,
    engine,
    files: fileRecords.map((row) => ({ path: row.path, bytes: row.bytes, sha256: row.sha256 })),
  };
  const termsVersion = hasher.hashTermsVersion(terms);
  if (!hasher.isTermsVersionHash(termsVersion)) {
    throw refuse("invalid-terms-version", "hasher did not return sha256: plus 64 hex");
  }

  const generatedAt = options.clock || new Date().toISOString();
  const manifest = {
    schema: SCHEMA,
    schemaVersion: SCHEMA_VERSION,
    jobId,
    label: labelResult.label,
    customerDelivery: false,
    notSettling: true,
    notResultReuse: true,
    fileMaxBytes: FILE_MAX_BYTES,
    archiveSha256,
    enginePin,
    engine,
    termsVersion,
    hashTermsPin: hasher.pin,
    generatedAt,
    files: fileRecords.map((row) => ({
      path: row.path,
      bytes: row.bytes,
      sha256: row.sha256,
      mediaType: row.mediaType,
      label: row.label,
    })),
  };

  const jsonl = `${fileRecords.map((row) => JSON.stringify(row)).join("\n")}\n`;
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const zipBuffer = buildStoredZip([
    { name: "manifest.json", data: Buffer.from(manifestText) },
    { name: "files.jsonl", data: Buffer.from(jsonl) },
    ...files.map((file) => ({ name: file.path, data: file.data })),
  ]);

  mkdirSync(outDir, { recursive: true });
  const zipPath = isAbsolute(options.zipName || "") ? options.zipName : join(outDir, options.zipName || "job-artifacts.zip");
  const jsonlPath = join(outDir, "files.jsonl");
  const manifestPath = join(outDir, "manifest.json");
  writeFileSync(zipPath, zipBuffer);
  writeFileSync(jsonlPath, jsonl);
  writeFileSync(manifestPath, manifestText);

  return {
    ok: true,
    jobId,
    label: labelResult.label,
    customerDelivery: false,
    notSettling: true,
    archiveSha256,
    enginePin,
    termsVersion,
    zip: zipPath,
    jsonl: jsonlPath,
    manifest: manifestPath,
    zipSha256: sha256Prefixed(zipBuffer),
    files: fileRecords.length,
  };
}
