import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { CASE_SCHEMA, CLOCK_ISO, OWNED_DIR, PR50_JOBS } from "./pins.mjs";
import { sha256Bytes, sha256File } from "./digest.mjs";

export class CaseRefuse extends Error {
  constructor(code, message, detail = null) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function resolveCasePath(filePath, { fromDir = process.cwd() } = {}) {
  if (!filePath) return null;
  if (isAbsolute(filePath) && existsSync(filePath)) return filePath;
  const fromCwd = resolve(fromDir, filePath);
  if (existsSync(fromCwd)) return fromCwd;
  const fromOwned = resolve(OWNED_DIR, filePath);
  if (existsSync(fromOwned)) return fromOwned;
  return fromCwd;
}

export function loadCaseFile(filePath) {
  const abs = resolveCasePath(filePath);
  if (!abs || !existsSync(abs)) {
    throw new CaseRefuse("missing_case", `Case file not found: ${filePath}`);
  }
  const bytes = readFileSync(abs);
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch (err) {
    throw new CaseRefuse("invalid_json", `Case is not JSON: ${err.message}`);
  }
  if (!isPlainObject(parsed)) {
    throw new CaseRefuse("invalid_shape", "Case must be a JSON object");
  }
  return {
    path: abs,
    bytes,
    text: bytes.toString("utf8"),
    object: parsed,
    digest: sha256Bytes(bytes),
  };
}

export function resolveRelative(casePath, rel) {
  if (!rel) return null;
  if (isAbsolute(rel)) return rel;
  return resolve(dirname(casePath), rel);
}

export function referencedFiles(caseObject, casePath) {
  const files = [];
  for (const job of caseObject.jobs || []) {
    if (job?.in) files.push({ role: `job:${job.artifactId}`, path: resolveRelative(casePath, job.in) });
  }
  for (const item of caseObject.optionalInputClasses || []) {
    if (item?.before) files.push({ role: `${item.id}:before`, path: resolveRelative(casePath, item.before) });
    if (item?.after) files.push({ role: `${item.id}:after`, path: resolveRelative(casePath, item.after) });
  }
  return files;
}

export function validateCaseObject(caseObject, { clockOverride = null } = {}) {
  if (caseObject.schema && caseObject.schema !== CASE_SCHEMA) {
    throw new CaseRefuse("invalid_schema", `Unsupported case schema ${caseObject.schema}`);
  }
  const clock = clockOverride || caseObject.clock;
  if (!clock) {
    throw new CaseRefuse("clock_required", "Operator clock is required on the case or --clock; do not invent time");
  }
  if (!CLOCK_ISO.test(clock)) {
    throw new CaseRefuse("clock_invalid", "--clock / case.clock must be operator ISO-8601");
  }
  const jobs = Array.isArray(caseObject.jobs) ? caseObject.jobs : [];
  if (!jobs.length) {
    throw new CaseRefuse("missing_jobs", "Case must list at least one PR50 evidence job");
  }
  for (const job of jobs) {
    if (!job || typeof job.artifactId !== "string") {
      throw new CaseRefuse("invalid_job", "Each job needs an artifactId");
    }
    if (!PR50_JOBS.includes(job.artifactId)) {
      throw new CaseRefuse("unknown_job", `Unknown PR50 job ${JSON.stringify(job.artifactId)}`);
    }
    if (!job.in) {
      throw new CaseRefuse("missing_job_input", `Job ${job.artifactId} needs an already-redacted --in file`);
    }
  }
  return { clock, jobs };
}

export function loadReferenced(caseObject, casePath) {
  const files = referencedFiles(caseObject, casePath);
  const loaded = [];
  for (const file of files) {
    if (!existsSync(file.path)) {
      throw new CaseRefuse("missing_input", `Referenced file not found: ${file.path}`);
    }
    loaded.push({
      ...file,
      digest: sha256File(file.path),
      bytes: readFileSync(file.path).length,
    });
  }
  return loaded;
}

export function wantsPaidSale(request, caseObject) {
  const intent = request?.fundingIntent || request?.funding || caseObject?.fundingIntent;
  return (
    intent === "live-sale" ||
    intent === "sale" ||
    request?.settle === true ||
    request?.sold === true ||
    request?.liveSettle === true ||
    caseObject?.sold === true ||
    caseObject?.settlement != null ||
    caseObject?.payment?.attempted === true ||
    caseObject?.purchaseAuthority === true
  );
}
