import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { replayRefuse } from './args.mjs';
import { REPO_ROOT } from './pins.mjs';
import { sha256Bytes } from './digest.mjs';
import { captureCatalogOutputs } from './compare.mjs';

export const WRAPPER_BIN = join(REPO_ROOT, 'server/paid-useful-jobs/bin/cli.mjs');
export const WRAPPER_CONTRACT = 'samedaydesk.paid-useful-jobs.execution.v1';
const sorted = (v) => Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v;
const digest = (v) => sha256Bytes(Buffer.from(JSON.stringify(sorted(v)))).slice(0, 16);
const sameNames = (rows, names) => Array.isArray(rows) && rows.length === names.length &&
  new Set(rows.map((r) => typeof r === 'string' ? r : r.name)).size === names.length &&
  names.every((name) => rows.some((r) => (typeof r === 'string' ? r : r.name) === name));

export function validateWrapperRun(run, { jobId, outputNames, inputHashes, outDir }) {
  const body = run.json;
  if (run.status !== 0 || run.error || run.signal) {
    throw replayRefuse('nonzero-engine-exit', 'Wrapper process did not exit successfully', {
      status: run.status, signal: run.signal, error: run.error,
      transport: body?.transport, analysis: body?.analysis, delivery: body?.delivery,
    });
  }
  const receipt = body?.receipt;
  if (body?.ok !== true || body.contract !== WRAPPER_CONTRACT || body.jobId !== jobId ||
      !body.executionId || body.transport !== 'ok' || receipt?.contract !== WRAPPER_CONTRACT ||
      receipt?.jobId !== jobId || receipt?.transport !== 'ok' ||
      !isDeepStrictEqual(body.analysis, receipt.analysis)) {
    throw replayRefuse('wrapper-contract-mismatch', 'Wrapper result does not bind a successful execution.v1 delivery');
  }
  for (const delivery of [body.delivery, receipt.delivery]) {
    if (delivery?.complete !== true || delivery.status !== 'complete' ||
        !sameNames(delivery.expected, outputNames) || !sameNames(delivery.present, outputNames) ||
        !Array.isArray(delivery.missing) || delivery.missing.length) {
      throw replayRefuse('missing-engine-outputs', 'Wrapper delivery is incomplete or contradictory');
    }
  }
  if (inputHashes && (!sameNames(receipt.inputs, Object.keys(inputHashes)) ||
      Object.entries(inputHashes).some(([key, value]) => {
        const actual = receipt.inputs.find((row) => row.name === key);
        return actual?.sha256 !== value.sha256 || actual?.bytes !== value.bytes;
      }))) {
    throw replayRefuse('wrapper-input-mismatch', 'Wrapper receipt does not match frozen input bytes');
  }
  if (!sameNames(body.outputs, outputNames) || !sameNames(receipt.outputs, outputNames)) {
    throw replayRefuse('missing-engine-outputs', 'Wrapper output manifest does not match the job');
  }
  if (realpathSync(body.outDir) !== realpathSync(outDir)) {
    throw replayRefuse('unexpected-output-dir', 'Wrapper published outside the requested output directory');
  }
  const captured = captureCatalogOutputs(outDir, outputNames);
  for (const file of captured) {
    if (!file.exists || !statSync(join(outDir, file.name)).isFile()) {
      throw replayRefuse('missing-engine-outputs', 'Required wrapper output is missing', { name: file.name });
    }
    for (const outputs of [body.outputs, receipt.outputs]) {
      const listed = outputs.find((row) => row.name === file.name);
      if (listed.sha256 !== file.sha256 || listed.bytes !== file.bytes.length) {
        throw replayRefuse('wrapper-output-mismatch', 'Wrapper manifest differs from captured output bytes', { name: file.name });
      }
    }
  }
  return captured;
}

// Only the two reviewed legacy envelopes have a documented path-dependent digest.
// Verify that digest and the wrapper's actual staged bytes before replacing paths.
// Never remove a report field merely because it looks like a path or a timestamp.
function bindArtifactIdentity(file, { jobId, inputHashes, runtime }) {
  if (!file.name.endsWith('.json')) return file;
  const art = JSON.parse(file.bytes.toString('utf8'));
  if (art.schema !== 's233.useful-application.artifact.v1' || art.appId !== jobId ||
      !['vendor-budget-impact', 'api-upgrade-brief'].includes(jobId)) return file;
  const digestInput = (value) => jobId === 'vendor-budget-impact'
    ? { status: value.status, actions: value.actions, counts: value.underlying?.counts, caller: value.caller }
    : { status: value.status, actions: value.actions, gaps: value.gaps, caller: value.caller };
  if (art.digest !== digest(digestInput(art))) {
    throw replayRefuse('artifact-digest-mismatch', 'Envelope digest does not match its documented fields');
  }
  for (const [slot, expected] of Object.entries(inputHashes || {})) {
    const staged = art.caller?.[slot];
    if (typeof staged !== 'string') continue;
    const real = realpathSync(staged);
    if (!real.startsWith(realpathSync(runtime) + sep)) {
      throw replayRefuse('unbound-artifact-input', 'Artifact input path is outside this wrapper process workspace', { slot });
    }
    const bytes = readFileSync(real);
    if (sha256Bytes(bytes) !== expected.sha256 || bytes.length !== expected.bytes) {
      throw replayRefuse('unbound-artifact-input', 'Artifact input path does not contain frozen bytes', { slot });
    }
    art.caller[slot] = `sha256:${expected.sha256}`;
  }
  art.digest = digest(digestInput(art));
  return { ...file, identityBytes: Buffer.from(JSON.stringify(art)) };
}

export function runWrapperJob(jobId, { files = {}, outDir, outputNames, inputHashes, wrapperBin = WRAPPER_BIN, timeoutMs = 90_000 } = {}) {
  const runtime = mkdtempSync(join(tmpdir(), 'output-replay-wrapper-'));
  const args = ['run', jobId];
  for (const [key, file] of Object.entries(files)) args.push(`--${key}`, file);
  args.push('--out-dir', outDir);
  try {
    const child = spawnSync(process.execPath, [resolve(wrapperBin), ...args], {
      encoding: 'utf8', timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024,
      cwd: REPO_ROOT, env: { ...process.env, TMPDIR: runtime },
    });
    let json = null;
    try { json = JSON.parse(child.stdout); } catch { /* validation refuses */ }
    const run = { status: child.status, signal: child.signal, error: child.error?.message,
      pid: child.pid, stdout: child.stdout || '', stderr: child.stderr || '', json, cli: resolve(wrapperBin), args };
    const captured = validateWrapperRun(run, { jobId, outputNames, inputHashes, outDir });
    run.capture = captured.map((file) => bindArtifactIdentity(file, { jobId, inputHashes, runtime }));
    return run;
  } finally {
    rmSync(runtime, { recursive: true, force: true });
  }
}
