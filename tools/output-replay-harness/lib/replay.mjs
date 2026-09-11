import { resolve } from "node:path";
import { parseArgs, replayRefuse, ReplayRefuse, usage } from "./args.mjs";
import {
  assertPublicCatalogMatchesKit,
  catalogOutputNames,
  findJob,
  loadKitCatalog,
  loadPublicCatalog,
  requiredInputKeys,
} from "./catalog.mjs";
import { captureCatalogOutputs, compareCatalogOutputs } from "./compare.mjs";
import { assertEngineOk, defaultRunJob } from "./engine.mjs";
import { ensureUsefulJobsKit } from "./kit.mjs";
import { actualOutputDir, assertDisjointOutputDirs } from "./locations.mjs";
import {
  USEFUL_JOBS_ARCHIVE_BYTES,
  USEFUL_JOBS_ARCHIVE_SHA256,
  USEFUL_JOBS_PURCHASE_AUTHORITY,
} from "./pins.mjs";
import { inspectSample } from "./sample.mjs";
import {
  buildReplayTerms,
  defaultHashTermsVersion,
  hashReplayTerms,
} from "./terms.mjs";

export { parseArgs, usage, ReplayRefuse, replayRefuse };
export { assertDisjointOutputDirs, resolveOutputDir, actualOutputDir } from "./locations.mjs";
export { captureCatalogOutputs } from "./compare.mjs";

export function defaultAdapters(overrides = {}) {
  return {
    ensureKit: overrides.ensureKit || ensureUsefulJobsKit,
    runJob: overrides.runJob || defaultRunJob,
    hashTermsVersion: overrides.hashTermsVersion || defaultHashTermsVersion,
    loadPublicCatalog: overrides.loadPublicCatalog || loadPublicCatalog,
  };
}

function resolveInputs(inputs = {}) {
  const out = {};
  for (const [key, value] of Object.entries(inputs)) {
    if (value == null || value === false || value === "") continue;
    out[key] = resolve(String(value));
  }
  return out;
}

function mergeInputs(base, overlay) {
  return { ...base, ...overlay };
}

/**
 * Re-run the same catalog job twice, byte-compare catalog outputs, classify.
 */
export function replay(request = {}, adapterOverrides = {}) {
  const adapters = defaultAdapters(adapterOverrides);
  const example = request.example === true || request.example === "true";
  const jobId = request.job;
  if (!jobId) throw replayRefuse("missing-job", "--job is required");
  const outA = request.outA || request["out-a"];
  const outB = request.outB || request["out-b"];
  if (!outA || !outB) throw replayRefuse("missing-out-dirs", "--out-a and --out-b are required");

  const kit = request.kit || adapters.ensureKit({ archivePath: request.archive });
  const kitCatalog = loadKitCatalog(kit);
  const publicCatalog = adapters.loadPublicCatalog();
  assertPublicCatalogMatchesKit(publicCatalog, kitCatalog);
  const job = findJob(kitCatalog, jobId);
  const outputNames = catalogOutputNames(job);

  const inputsA = resolveInputs(request.inputs || {});
  const inputsB = mergeInputs(inputsA, resolveInputs(request.inputsB || {}));
  const sampleA = inspectSample({ example, inputs: inputsA });
  const sampleB = inspectSample({ example, inputs: inputsB });
  const sample = sampleA.sample || sampleB.sample;
  const sampleReasons = [...new Set([...sampleA.reasons, ...sampleB.reasons])];

  if (!example) {
    const missing = requiredInputKeys(job).filter((k) => !inputsA[k]);
    if (missing.length) {
      throw replayRefuse(
        "missing-required-inputs",
        `Caller replay requires ${requiredInputKeys(job).map((k) => `--${k}`).join(", ")}; use --example for labeled fixtures`,
        { missing, requiredKeys: requiredInputKeys(job) },
      );
    }
  }

  const locations = assertDisjointOutputDirs(outA, outB);

  const runA = adapters.runJob(jobId, {
    files: example ? {} : inputsA,
    example,
    outDir: locations.outA.real,
    kit,
  });
  assertEngineOk(runA, "run-a");
  const usedA = actualOutputDir(runA, locations.outA.real);
  const captureA = captureCatalogOutputs(usedA, outputNames);

  if (typeof request.betweenRuns === "function") {
    request.betweenRuns({
      inputs: inputsA,
      inputsB,
      outA: locations.outA.real,
      outB: locations.outB.real,
      runA,
      kit,
      captureA,
    });
  }

  const runB = adapters.runJob(jobId, {
    files: example ? {} : inputsB,
    example,
    outDir: locations.outB.real,
    kit,
  });
  assertEngineOk(runB, "run-b");
  const usedB = actualOutputDir(runB, locations.outB.real);
  const captureB = captureCatalogOutputs(usedB, outputNames);
  assertDisjointOutputDirs(usedA, usedB);

  const compared = compareCatalogOutputs({
    captureA,
    captureB,
    outputNames,
  });

  const terms = buildReplayTerms({
    jobId,
    catalogOutputs: outputNames,
    inputs: example ? {} : inputsA,
    sample,
    example,
  });
  const termsVersion = hashReplayTerms(terms, adapters.hashTermsVersion);

  const identityVerified = !sample && compared.jsonIdentical && compared.classification !== "identity-break";

  return {
    ok: true,
    job: jobId,
    classification: compared.classification,
    identityVerified,
    jsonIdentical: compared.jsonIdentical,
    allBytesEqual: compared.allBytesEqual,
    sample,
    sampleReasons,
    example,
    purchaseAuthority: USEFUL_JOBS_PURCHASE_AUTHORITY,
    acceptanceClass: sample || example ? "fixture" : "local-runtime",
    catalogOutputs: outputNames,
    files: compared.files,
    identityRule: compared.identityRule,
    termsVersion,
    schemaVersion: 1,
    engine: {
      archiveSha256: USEFUL_JOBS_ARCHIVE_SHA256,
      archiveBytes: USEFUL_JOBS_ARCHIVE_BYTES,
      digestA: runA.json?.digest || null,
      digestB: runB.json?.digest || null,
      outA: usedA,
      outB: usedB,
      requestedOutA: locations.outA.real,
      requestedOutB: locations.outB.real,
    },
    laterBindings: {
      hashTermsVersion: "I01 Neo PR54 packs/funded-task-terms (pinned isolated dependency)",
      usefulJobsCli: "PR51 useful-jobs CLI from in-repo archive",
      paidWrappers: "F08 PR52 aeef964f not consumed; wrappers are not replay identity",
      integrator: "W5-D01",
    },
  };
}

export function replayFromArgv(argv, adapterOverrides = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    return { ok: true, help: true, usage: usage() };
  }
  return replay(
    {
      job: args.job,
      outA: args.outA,
      outB: args.outB,
      example: args.example,
      inputs: args.inputs,
      inputsB: args.inputsB,
      kit: args.kit,
      archive: args.archive,
    },
    adapterOverrides,
  );
}
