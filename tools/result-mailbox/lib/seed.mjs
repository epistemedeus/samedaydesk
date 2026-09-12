import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildEnvelope } from "./envelope.mjs";
import { refuse } from "./errors.mjs";
import { addSeconds, parseClock } from "./expiry.mjs";
import {
  DEFAULT_TTL_SECONDS,
  MAX_ARTIFACT_BYTES,
  USEFUL_JOBS_CATALOG_PATH,
  kitEngineProvenance,
} from "./pins.mjs";
import { fileArtifact, statBytes } from "./digest.mjs";
import { inspectSample } from "./sample.mjs";
import { writeEnvelopeFiles } from "./store.mjs";

function expectedOutputs(jobId, catalog = null) {
  const source =
    catalog && typeof catalog === "object"
      ? catalog
      : JSON.parse(readFileSync(typeof catalog === "string" ? catalog : USEFUL_JOBS_CATALOG_PATH, "utf8"));
  const job = (source.jobs || []).find((j) => j.id === jobId);
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
  catalog = null,
  expectedOutputNames = null,
  preloadedFiles = null,
  extraEnvelope = null,
}) {
  parseClock(clock, "clock");
  const exp = expiresAt || addSeconds(clock, ttlSeconds);
  const names =
    Array.isArray(expectedOutputNames) && expectedOutputNames.length
      ? expectedOutputNames
      : expectedOutputs(jobId, catalog);
  const files = Array.isArray(preloadedFiles) && preloadedFiles.length
    ? preloadedFiles.map((file) => ({
        name: file.name,
        path: file.path,
        buf: file.buf,
        bytes: file.bytes,
        sha256: file.sha256,
      }))
    : collectOutputs(resolve(outDir), names);
  const sampleInfo = inspectSample({
    example: sample,
    files: files.map((f) => f.path),
    engineJson: engineResult,
  });
  const isSample = sample || sampleInfo.sample;
  const envelope = {
    ...buildEnvelope({
      requestId,
      jobId,
      completedAt: clock,
      expiresAt: exp,
      sample: isSample,
      sampleReasons: sampleReasons.length ? sampleReasons : sampleInfo.reasons,
      deliveredToBuyer: false,
      artifacts: files,
      engine: engine || kitEngineProvenance(),
      engineResult,
      payment,
    }),
    ...(extraEnvelope && typeof extraEnvelope === "object" ? extraEnvelope : {}),
  };
  const written = writeEnvelopeFiles({ mailbox, envelope, files });
  return {
    ok: true,
    status: "seeded",
    deliveredToBuyer: false,
    replayed: written.replayed === true,
    sample: (written.envelope || envelope).sample,
    requestId: (written.envelope || envelope).requestId,
    jobId,
    envelopePath: written.envelopePath,
    artifactsDir: written.artifactsDir,
    envelope: written.envelope || envelope,
    evidenceClass: "local-runtime",
  };
}
