import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { catalogJob, engineProvenance, runEngineJob } from "./engine.mjs";
import { buildEnvelope } from "./envelope.mjs";
import { refuse } from "./errors.mjs";
import { addSeconds, parseClock } from "./expiry.mjs";
import { DEFAULT_TTL_SECONDS, MAX_ARTIFACT_BYTES, VENDOR_BUDGET_OUTPUTS } from "./pins.mjs";
import { fileArtifact, statBytes } from "./digest.mjs";
import { inspectSample } from "./sample.mjs";
import { writeEnvelopeFiles } from "./store.mjs";

function expectedOutputs(jobId, kit) {
  try {
    const job = catalogJob(jobId, kit);
    return job.outputs || VENDOR_BUDGET_OUTPUTS;
  } catch {
    return VENDOR_BUDGET_OUTPUTS;
  }
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
    files.push({ name, path, ...fileArtifact(name, path) });
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
  const names = expectedOutputs(jobId, engine?.kitRoot);
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
