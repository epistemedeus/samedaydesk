import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { engineProvenance, runEngineJob } from "./engine.mjs";
import { buildEnvelope } from "./envelope.mjs";
import { refuse } from "./errors.mjs";
import { addSeconds, parseClock } from "./expiry.mjs";
import {
  DEFAULT_TTL_SECONDS,
  MAX_ARTIFACT_BYTES,
  USEFUL_JOBS_CATALOG_PATH,
} from "./pins.mjs";
import { fileArtifact, statBytes } from "./digest.mjs";
import { inspectSample } from "./sample.mjs";
import { writeEnvelopeFiles } from "./store.mjs";

function expectedOutputs(jobId) {
  const catalog = JSON.parse(readFileSync(USEFUL_JOBS_CATALOG_PATH, "utf8"));
  const job = (catalog.jobs || []).find((j) => j.id === jobId);
  if (!job) throw refuse("unknown-job", `unknown useful-job ${jobId}`);
  if (!Array.isArray(job.outputs) || job.outputs.length < 1) {
    throw refuse("missing-engine-output", `job ${jobId} declares no outputs`);
  }
  return job.outputs;
}

function collectOutputs(outDir, names) {
  const files = [];
  for (const name of names) {
    const path = join(outDir, name);
    if (!existsSync(path)) {
      throw refuse("missing-engine-output", `engine out-dir is missing ${name}`);
    }
    const bytes = statBytes(path);
    if (bytes > MAX_ARTIFACT_BYTES) {
      throw refuse("artifact-too-large", `${name} exceeds 1 MiB`);
    }
    const listed = fileArtifact(name, path);
    files.push({ name, path, buf: readFileSync(path), ...listed });
  }
  return files;
}

export function seedFromOutDir({
  mailbox,
  requestId,
  jobId,
  outDir,
  clock,
  expiresAt,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  sample = false,
  sampleReasons = [],
  engine = null,
  engineResult = null,
  payment = null,
}) {
  parseClock(clock, "clock");
  const exp = expiresAt || addSeconds(clock, ttlSeconds);
  const names = expectedOutputs(jobId);
  const files = collectOutputs(resolve(outDir), names);
  const sampleInfo = inspectSample({
    example: sample,
    files: files.map((f) => f.path),
    engineJson: engineResult,
  });
  const isSample = sample || sampleInfo.sample;
  const envelope = buildEnvelope({
    requestId,
    jobId,
    completedAt: clock,
    expiresAt: exp,
    sample: isSample,
    sampleReasons: sampleReasons.length ? sampleReasons : sampleInfo.reasons,
    deliveredToBuyer: false,
    artifacts: files,
    engine: engine || engineProvenance(),
    engineResult,
    payment,
  });
  const written = writeEnvelopeFiles({ mailbox, envelope, files });
  return {
    ok: true,
    status: "seeded",
    deliveredToBuyer: false,
    sample: envelope.sample,
    requestId: envelope.requestId,
    jobId,
    envelopePath: written.envelopePath,
    artifactsDir: written.artifactsDir,
    envelope,
    evidenceClass: "local-runtime",
  };
}

export function seedBySpawningEngine({
  mailbox,
  requestId,
  jobId,
  files = {},
  example = false,
  outDir,
  clock,
  expiresAt,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  payment = null,
}) {
  const engine = runEngineJob(jobId, { files, example, outDir });
  if (engine.status !== 0 || !engine.json || engine.json.ok === false) {
    throw refuse(
      engine.json?.code || "engine-refused",
      engine.json?.error || engine.stderr || "useful-jobs engine refused",
      { detail: { status: engine.status, stdout: engine.stdout?.slice(0, 800) } },
    );
  }
  const resolvedOut = engine.json.outDir || outDir;
  if (!resolvedOut) {
    throw refuse("missing-engine-output", "engine did not return outDir");
  }
  return seedFromOutDir({
    mailbox,
    requestId,
    jobId,
    outDir: resolvedOut,
    clock,
    expiresAt,
    ttlSeconds,
    sample: example || engine.json?.caller?.exampleMode === true,
    engine: engine.provenance,
    engineResult: engine.json,
    payment,
  });
}
