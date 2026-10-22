import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fail } from "./failures.mjs";
import { fixtureFingerprint, sha256Bytes } from "./hash.mjs";
import { JOB_ID, PAIR_SCHEMA } from "./paths.mjs";

const SAFE_RUN_ID = /^[A-Za-z0-9._-]{1,64}$/;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function looksLikeUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

export function isSafeRunId(value) {
  return typeof value === "string" && SAFE_RUN_ID.test(value) && value !== "." && value !== "..";
}

export function resolveMaybe(baseDir, value) {
  if (typeof value !== "string" || !value) return null;
  if (isAbsolute(value)) return value;
  return resolve(baseDir, value);
}

function resolveInside(baseDir, value, label) {
  if (typeof value !== "string" || !value) {
    return fail("invalid_job_document", `${label} is not a held local file`);
  }
  if (looksLikeUrl(value)) {
    return fail("invalid_job_document", `${label} must be a local file, not a URL`);
  }
  const resolved = isAbsolute(value) ? value : resolve(baseDir, value);
  const rel = relative(baseDir, resolved);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    return fail("invalid_job_document", `${label} must stay in the job directory`);
  }
  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    return fail("invalid_job_document", `${label} is not a held local file`);
  }
  return { ok: true, path: resolved };
}

export function loadPairDocument(pairPath) {
  if (!pairPath || !existsSync(pairPath)) {
    return fail("invalid_pair", `pair file not found: ${pairPath}`, { path: pairPath });
  }
  let body;
  try {
    body = readJson(pairPath);
  } catch (err) {
    return fail("invalid_pair", err?.message || "pair is not JSON", { path: pairPath });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail("invalid_pair", "pair is not a JSON object", { path: pairPath });
  }
  if (body.schema !== PAIR_SCHEMA) {
    return fail("invalid_pair", `schema must be ${PAIR_SCHEMA}`, { path: pairPath });
  }
  if (body.jobId !== JOB_ID) {
    return fail("job_not_page_change", `jobId ${body.jobId || "(missing)"} is not ${JOB_ID}`);
  }
  if (!Array.isArray(body.runs) || body.runs.length !== 2) {
    return fail("needs_two_runs", "pair.runs must contain exactly two runs", {
      count: Array.isArray(body.runs) ? body.runs.length : 0,
    });
  }
  return { ok: true, path: resolve(pairPath), pair: body };
}

export function loadHeldJob(jobPath) {
  if (!jobPath || !existsSync(jobPath)) {
    return fail("invalid_job_document", `job file not found: ${jobPath}`, { path: jobPath });
  }
  let job;
  try {
    job = readJson(jobPath);
  } catch {
    return fail("invalid_job_document", "job is not JSON", { path: jobPath });
  }
  if (!job || typeof job !== "object" || Array.isArray(job)) {
    return fail("invalid_job_document", "job is not a JSON object", { path: jobPath });
  }
  if (typeof job.clock !== "string" || !job.clock.trim()) {
    return fail("invalid_job_document", "job.clock is required", { path: jobPath });
  }
  if (!Array.isArray(job.fields) || job.fields.length === 0) {
    return fail("invalid_job_document", "job.fields must be a non-empty array", { path: jobPath });
  }
  if (job.retryPayment === true || job.replayPayment === true || job.fetch === true || job.live === true) {
    return fail("invalid_job_document", "held job requests payment, retry, or live fetch", { path: jobPath });
  }
  const jobDir = dirname(resolve(jobPath));
  const before = resolveInside(jobDir, job.before, "job.before");
  if (before.ok !== true) return { ...before, path: jobPath };
  const after = resolveInside(jobDir, job.after, "job.after");
  if (after.ok !== true) return { ...after, path: jobPath };
  const beforeBuf = readFileSync(before.path);
  const afterBuf = readFileSync(after.path);
  const fields = job.fields.map((item) => String(item));
  const beforeSha256 = sha256Bytes(beforeBuf);
  const afterSha256 = sha256Bytes(afterBuf);
  return {
    ok: true,
    jobPath: resolve(jobPath),
    job,
    beforePath: before.path,
    afterPath: after.path,
    fields,
    beforeSha256,
    afterSha256,
    fingerprint: fixtureFingerprint({ beforeSha256, afterSha256, fields }),
  };
}

export function resolvePairRuns(loaded) {
  if (loaded.ok !== true) return loaded;
  const pairDir = dirname(loaded.path);
  const resolved = [];
  const seenIds = new Set();
  for (const [index, run] of loaded.pair.runs.entries()) {
    if (!run || typeof run !== "object" || Array.isArray(run)) {
      return fail("invalid_pair", `runs[${index}] is not an object`);
    }
    const id = typeof run.id === "string" && run.id ? run.id : `run-${index + 1}`;
    if (!isSafeRunId(id)) {
      return fail("invalid_pair", `runs[${index}].id is not a single path segment`, { runId: id });
    }
    if (seenIds.has(id)) {
      return fail("invalid_pair", `duplicate run id ${id}`, { runId: id });
    }
    seenIds.add(id);
    if (typeof run.jobPath !== "string" || !run.jobPath) {
      return fail("invalid_pair", `runs[${index}].jobPath is missing`);
    }
    if (looksLikeUrl(run.jobPath)) {
      return fail("invalid_pair", "jobPath must be a local path, not a URL", {
        path: run.jobPath,
      });
    }
    const jobPath = resolveMaybe(pairDir, run.jobPath);
    const held = loadHeldJob(jobPath);
    if (held.ok !== true) return held;
    resolved.push({
      index,
      id,
      evidenceClass: typeof run.evidenceClass === "string" ? run.evidenceClass.trim() : run.evidenceClass,
      callerIdentity: run.callerIdentity ?? null,
      demandClass: run.demandClass ?? null,
      jobPath: held.jobPath,
      job: held.job,
      beforePath: held.beforePath,
      afterPath: held.afterPath,
      fields: held.fields,
      beforeSha256: held.beforeSha256,
      afterSha256: held.afterSha256,
      fingerprint: held.fingerprint,
    });
  }
  return {
    ok: true,
    path: loaded.path,
    pair: loaded.pair,
    demandClass: loaded.pair.demandClass ?? "none",
    jobId: loaded.pair.jobId || JOB_ID,
    runs: resolved,
  };
}
