import { resolve, join } from "node:path";
import { isDeepStrictEqual } from 'node:util';
import { inspectInputs, freezeInputs } from './snapshot.mjs';
import { replayWrapper } from './wrapper-replay.mjs';
import { parseArgs, replayRefuse, ReplayRefuse, usage } from "./args.mjs";
import {
  assertPublicCatalogMatchesKit,
  catalogOutputNames,
  findJob,
  loadKitCatalog,
  loadPublicCatalog,
  requiredInputKeys,
  optionalInputKeys,
} from "./catalog.mjs";
import { captureCatalogOutputs, compareCatalogOutputs } from "./compare.mjs";
import { assertEngineOk, defaultRunJob } from "./engine.mjs";
import { ensureUsefulJobsKit } from "./kit.mjs";
import { actualOutputDir, assertDisjointOutputDirs, assertFreshOutputDir } from "./locations.mjs";
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
  if (request.engine === 'd01-wrapper' || request.paidWrapperBin || request['paid-wrapper-bin']) return replayWrapper(request);
  if (request.engine && request.engine !== 'catalog') throw replayRefuse('unknown-engine', 'Engine must be catalog or d01-wrapper');
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

  const sources = [...Object.values(inputsA), ...Object.values(inputsB)];
  assertFreshOutputDir(outA, sources);
  assertFreshOutputDir(outB, sources);
  const locations = assertDisjointOutputDirs(outA, outB);
  const allowed = [...requiredInputKeys(job), ...optionalInputKeys(job)];
  const inspectedA = example ? null : inspectInputs(inputsA, allowed);
  const inspectedB = example ? null : inspectInputs(inputsB, allowed);
  const frozenA = example ? { files: {}, hashes: {} } : freezeInputs(inspectedA, join(locations.outA.real, '.replay-inputs'));
  const frozenB = example ? { files: {}, hashes: {} } : freezeInputs(inspectedB, join(locations.outB.real, '.replay-inputs'));
  const inputsIdentical = isDeepStrictEqual(frozenA.hashes, frozenB.hashes);
  if (typeof request.afterInspect === 'function') request.afterInspect();

  const runA = adapters.runJob(jobId, {
    files: frozenA.files,
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
    files: inputsIdentical ? frozenA.files : frozenB.files,
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
  if (!inputsIdentical) compared.classification = 'identity-break';

  const terms = buildReplayTerms({
    jobId,
    catalogOutputs: outputNames,
    inputs: example ? {} : inputsA,
    inputHashes: Object.fromEntries(Object.entries(frozenA.hashes).map(([key, value]) => [key, `sha256:${value.sha256}`])),
    inputHashesB: Object.fromEntries(Object.entries(frozenB.hashes).map(([key, value]) => [key, `sha256:${value.sha256}`])),
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
    inputsIdentical,
    semanticCorrectnessVerified: false,
    terms,
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
      engine: args.engine,
      paidWrapperBin: args.paidWrapperBin,
    },
    adapterOverrides,
  );
}
