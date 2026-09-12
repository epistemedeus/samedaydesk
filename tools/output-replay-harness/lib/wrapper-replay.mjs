import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { loadPublicCatalog, findJob, catalogOutputNames, requiredInputKeys, optionalInputKeys } from './catalog.mjs';
import { assertFreshOutputDir, assertDisjointOutputDirs } from './locations.mjs';
import { inspectInputs, freezeInputs } from './snapshot.mjs';
import { runWrapperJob, WRAPPER_BIN, WRAPPER_CONTRACT } from './wrapper.mjs';
import { compareCatalogOutputs } from './compare.mjs';
import { inspectSample } from './sample.mjs';
import { hashReplayTerms } from './terms.mjs';
import { replayRefuse } from './args.mjs';

export function replayWrapper(request) {
  if (request.example) throw replayRefuse('wrapper-replay-requires-files', 'Current-wrapper replay requires explicit input files');
  const job = findJob(loadPublicCatalog(), request.job);
  const outputNames = catalogOutputNames(job);
  const required = requiredInputKeys(job);
  const allowed = [...required, ...optionalInputKeys(job)];
  const inputsA = { ...request.inputs };
  const inputsB = { ...inputsA, ...request.inputsB };
  // Directory/job-document recursion needs the runtime's materialization contract.
  if (allowed.includes('input-root') || allowed.includes('job')) {
    throw replayRefuse('unsupported-replay-input-shape', 'This consumer currently freezes flat file jobs only');
  }
  for (const inputs of [inputsA, inputsB]) {
    if (required.some((key) => !inputs[key])) throw replayRefuse('missing-required-inputs', 'Required job inputs are missing', { required });
  }
  const outA = request.outA || request['out-a'];
  const outB = request.outB || request['out-b'];
  if (!outA || !outB) throw replayRefuse('missing-out-dirs', 'Independent --out-a and --out-b are required');
  const sources = [...Object.values(inputsA), ...Object.values(inputsB)];
  assertFreshOutputDir(outA, sources);
  assertFreshOutputDir(outB, sources);
  const locations = assertDisjointOutputDirs(outA, outB);
  const inspectedA = inspectInputs(inputsA, allowed);
  const inspectedB = inspectInputs(inputsB, allowed);
  const sampleA = inspectSample({ inputs: inputsA });
  const sampleB = inspectSample({ inputs: inputsB });
  // Freeze both byte sets before any hook or child process can mutate caller paths.
  const frozenA = freezeInputs(inspectedA, join(locations.outA.real, '.replay-inputs'));
  const frozenB = freezeInputs(inspectedB, join(locations.outB.real, '.replay-inputs'));
  if (typeof request.afterInspect === 'function') request.afterInspect();
  const run = (frozen, outDir) => runWrapperJob(job.id, {
    files: frozen.files, inputHashes: frozen.hashes, outputNames, outDir,
    wrapperBin: request.paidWrapperBin || request['paid-wrapper-bin'] || WRAPPER_BIN,
  });
  const runA = run(frozenA, locations.outA.real);
  if (typeof request.betweenRuns === 'function') request.betweenRuns({ outA: locations.outA.real, outB: locations.outB.real });
  const runB = run(frozenB, locations.outB.real);
  if (runA.json.executionId === runB.json.executionId || runA.pid === runB.pid) {
    throw replayRefuse('reused-execution', 'Replay requires two independent process executions');
  }
  if (!isDeepStrictEqual(runA.json.receipt.engine, runB.json.receipt.engine)) {
    throw replayRefuse('engine-identity-changed', 'Wrapper engine provenance changed between runs');
  }
  const compared = compareCatalogOutputs({ captureA: runA.capture, captureB: runB.capture, outputNames });
  const inputsIdentical = isDeepStrictEqual(frozenA.hashes, frozenB.hashes);
  const analysisIdentical = isDeepStrictEqual(runA.json.analysis, runB.json.analysis);
  if (!inputsIdentical || !analysisIdentical) compared.classification = 'identity-break';
  const sample = sampleA.sample || sampleB.sample || runA.json.sample || runB.json.sample;
  const outcomes = [runA.json.analysis.outcome, runB.json.analysis.outcome];
  const deliveredAnalysis = outcomes.every((outcome) => !['refused', 'partial', 'not-run', 'crashed'].includes(outcome));
  const terms = {
    schema: 'samedaydesk.output-replay-harness.wrapper-terms.v1', jobId: job.id,
    contract: WRAPPER_CONTRACT, catalogOutputs: outputNames,
    inputsA: frozenA.hashes, inputsB: frozenB.hashes, engine: runA.json.receipt.engine,
    sample: Boolean(sample), purchaseAuthority: false,
  };
  const report = {
    ok: true, job: job.id, engineKind: 'd01-wrapper', contract: WRAPPER_CONTRACT,
    ...compared, inputsIdentical, analysisIdentical,
    identityVerified: !sample && deliveredAnalysis && inputsIdentical && analysisIdentical && compared.jsonIdentical && compared.classification !== 'identity-break',
    semanticCorrectnessVerified: false,
    sample: Boolean(sample), sampleReasons: [...new Set([...sampleA.reasons, ...sampleB.reasons])],
    acceptanceClass: sample ? 'fixture' : 'local-runtime', purchaseAuthority: false,
    terms, termsVersion: hashReplayTerms(terms),
    runs: [runA, runB].map((r) => ({ pid: r.pid, executionId: r.json.executionId, processExit: r.status,
      transport: r.json.transport, analysis: r.json.analysis, delivery: r.json.delivery,
      outDir: r.json.outDir, wrapperBin: r.cli, engine: r.json.receipt.engine })),
    identityRule: compared.identityRule + ' Reviewed legacy caller paths bind staged bytes; path-dependent digests are verified before normalization. Partial/refused analysis never verifies identity.',
  };
  for (const [index, r] of [runA, runB].entries()) {
    const out = index === 0 ? locations.outA.real : locations.outB.real;
    writeFileSync(join(out, 'wrapper-process.json'), JSON.stringify({ status: r.status, pid: r.pid, stdout: r.stdout, stderr: r.stderr }, null, 2) + '\n', { flag: 'wx' });
  }
  return report;
}
