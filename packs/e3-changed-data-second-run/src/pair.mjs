import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fail } from "./failures.mjs";
import { fixtureFingerprint, sha256Bytes } from "./hash.mjs";
import { JOB_ID, PAIR_SCHEMA } from "./paths.mjs";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function resolveMaybe(baseDir, value) {
  if (typeof value !== "string" || !value) return null;
  if (isAbsolute(value)) return value;
  return resolve(baseDir, value);
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
  if (body.jobId && body.jobId !== JOB_ID) {
    return fail("job_not_page_change", `jobId ${body.jobId} is not ${JOB_ID}`);
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
  } catch (err) {
    return fail("invalid_job_document", err?.message || "job is not JSON", { path: jobPath });
  }
  if (!job || typeof job !== "object") {
    return fail("invalid_job_document", "job is not a JSON object", { path: jobPath });
  }
  const jobDir = dirname(resolve(jobPath));
  const beforePath = resolveMaybe(jobDir, job.before);
  const afterPath = resolveMaybe(jobDir, job.after);
  if (!beforePath || !existsSync(beforePath) || !statSync(beforePath).isFile()) {
    return fail("invalid_job_document", "job.before is not a held local file", { path: jobPath });
  }
  if (!afterPath || !existsSync(afterPath) || !statSync(afterPath).isFile()) {
    return fail("invalid_job_document", "job.after is not a held local file", { path: jobPath });
  }
  const beforeBuf = readFileSync(beforePath);
  const afterBuf = readFileSync(afterPath);
  const fields = Array.isArray(job.fields) ? job.fields.map((item) => String(item)) : [];
  const beforeSha256 = sha256Bytes(beforeBuf);
  const afterSha256 = sha256Bytes(afterBuf);
  return {
    ok: true,
    jobPath: resolve(jobPath),
    job,
    beforePath,
    afterPath,
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
  for (const [index, run] of loaded.pair.runs.entries()) {
    if (!run || typeof run !== "object") {
      return fail("invalid_pair", `runs[${index}] is not an object`);
    }
    const jobPath = resolveMaybe(pairDir, run.jobPath);
    const held = loadHeldJob(jobPath);
    if (held.ok !== true) return held;
    resolved.push({
      index,
      id: typeof run.id === "string" && run.id ? run.id : `run-${index + 1}`,
      evidenceClass: run.evidenceClass,
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
