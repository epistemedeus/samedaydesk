import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { freezeRequest } from '../../../server/paid-useful-jobs/lib/input-guard.mjs';
import { engineProvenance } from '../../../server/paid-useful-jobs/lib/engine.mjs';
import { digestNamedBytes } from '../../../server/paid-useful-jobs/lib/digest.mjs';
import { EXECUTION_CONTRACT_VERSION } from '../../../server/paid-useful-jobs/lib/contract.mjs';
import { digest, bytesDigest, fault } from './durable.mjs';

export const CURRENT_CORE_BASE = '76f0fab6250cb8d9aaddaaaa3e4e3373ca2cc5be';
export { EXECUTION_CONTRACT_VERSION };
export function freezeConsumerRequest(request) {
  const frozen = freezeRequest({ ...request, jobId: request.engineId || request.jobId, inputs: request.inputs || request.files || {} });
  const entries = Object.entries(frozen.inputs).filter(([, v]) => v !== undefined && v !== null && v !== false && v !== '').map(([name, value]) => {
    if (name === 'input-root' || name === 'job') throw fault('unbound-input-shape', 'Directory and rewritten job-document inputs need a consumer snapshot contract');
    const declared = value && typeof value === 'object' && typeof value.path === 'string' ? value : null;
    let buf = frozen.fileBytes[name];
    if (declared) {
      buf = readFileSync(declared.path);
      if (declared.sha256 && declared.sha256 !== bytesDigest(buf)) throw fault('digest-mismatch');
      frozen.inputs[name] = declared.path;
    }
    if (!buf) {
      if (typeof value === 'string' && !/^[\s]*[\[{]/.test(value)) throw fault('input-missing-file');
      buf = Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
    }
    if (buf.length > 1_048_576) throw fault('input-oversize');
    frozen.fileBytes[name] = Buffer.from(buf);
    return { name, flag: `--${name}`, bytes: buf.length, sha256: bytesDigest(buf) };
  }).sort((a, b) => a.name.localeCompare(b.name));
  // All admitted bytes are carried to the core; the original paths are provenance only.
  return { frozen, entries };
}

export function runCurrent(request, { executionOrigin } = {}) {
  const spawned = spawnSync(process.execPath, [fileURLToPath(new URL('../bin/execute-current.mjs', import.meta.url)), ...(executionOrigin ? [executionOrigin] : [])], {
    input: JSON.stringify(request), encoding: 'utf8', timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024, killSignal: 'SIGKILL',
  });
  if (spawned.error || spawned.status !== 0) throw fault('execution-unknown', spawned.error?.message || spawned.stderr.slice(0, 500) || 'Execution process did not return a receipt');
  try { return JSON.parse(spawned.stdout); } catch { throw fault('execution-unknown', 'Execution process returned unreadable JSON'); }
}

function same(a, b) { return digest(a) === digest(b); }
function requireFact(condition, code) { if (!condition) throw fault(code); }
function summaries(rows) { return [...rows].map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })).sort((a, b) => a.name.localeCompare(b.name)); }
export function validateExecution(result, { job, requestId, executionId, entries, outDir, fundingIntent, example }) {
  requireFact(result?.contract === EXECUTION_CONTRACT_VERSION && result.receipt?.contract === EXECUTION_CONTRACT_VERSION, 'execution-contract-mismatch');
  requireFact(result.executionId === executionId && result.jobId === job.id && result.receipt.jobId === job.id, 'execution-identity-mismatch');
  const receipt = result.receipt;
  requireFact(result.sold === false && receipt.sold === false && result.purchaseAuthority === false && receipt.purchaseAuthority === false, 'unexpected-purchase-authority');
  requireFact(result.liveSettleAttempted !== true && receipt.payment?.liveSettleAttempted !== true, 'possible-spend');
  requireFact(result.transport === receipt.transport && same(result.analysis, receipt.analysis), 'contradictory-execution');
  requireFact(result.fundingState === receipt.fundingState, 'contradictory-funding');
  const expectedFunding = fundingIntent || 'unfunded';
  requireFact(result.fundingState === 'rejected' || result.fundingState === expectedFunding, 'funding-identity-mismatch');
  if (result.ok !== true) return { complete: false, code: result.code || 'execution-failed', outcomeKind: result.analysis?.outcome === 'refused' ? 'analysis-refused' : result.transport, outputs: [] };
  requireFact(result.transport === 'ok' && result.delivery?.complete === true && receipt.delivery?.complete === true, 'incomplete-delivery');
  for (const delivery of [result.delivery, receipt.delivery]) {
    requireFact(delivery.status === 'complete' && same([...delivery.expected].sort(), [...job.outputs].sort()) && same([...delivery.present].sort(), [...job.outputs].sort()) && delivery.missing?.length === 0, 'catalog-delivery-mismatch');
  }
  requireFact(Array.isArray(result.outputs) && Array.isArray(receipt.outputs) && result.outputs.length === job.outputs.length && new Set(result.outputs.map(o => o.name)).size === job.outputs.length, 'output-set-mismatch');
  requireFact(same(summaries(result.outputs), summaries(receipt.outputs)), 'receipt-output-mismatch');
  requireFact(receipt.outputsDigest === digestNamedBytes(result.outputs), 'outputs-digest-mismatch');
  if (!example) {
    requireFact(Array.isArray(receipt.inputs) && same(summaries(entries), summaries(receipt.inputs)), 'input-identity-mismatch');
    requireFact(receipt.inputsDigest === digestNamedBytes(entries), 'inputs-digest-mismatch');
  }
  const pin = engineProvenance();
  requireFact(receipt.engine?.archiveSha256 === pin.archiveSha256 && receipt.engine?.archiveBytes === pin.archiveBytes && receipt.engine?.sourceCommit === pin.sourceCommit, 'engine-pin-mismatch');
  const outputs = job.outputs.map(name => {
    requireFact(/^[a-zA-Z0-9._-]+$/.test(name), 'unsafe-output-name');
    const declared = result.outputs.find(o => o.name === name);
    const path = join(outDir, name);
    requireFact(declared && lstatSync(path).isFile(), 'missing-output');
    const bytes = readFileSync(path);
    requireFact(declared.bytes === bytes.length && declared.sha256 === bytesDigest(bytes), 'output-bytes-mismatch');
    return { name, path, bytes: bytes.length, sha256: bytesDigest(bytes), requestId, executionId };
  });
  return { complete: true, outputs, outcomeKind: result.analysis.outcome === 'refused' ? 'analysis-refused' : 'analysis-completed', analysisOutcome: result.analysis.status };
}

export function verifyStoredOutputs(ticket) {
  for (const out of ticket.outputs || []) {
    if (out.requestId !== ticket.requestId || out.executionId !== ticket.executionId || !lstatSync(out.path).isFile()) throw fault('stored-output-identity-mismatch');
    const buf = readFileSync(out.path);
    if (buf.length !== out.bytes || bytesDigest(buf) !== out.sha256) throw fault('stored-output-bytes-mismatch');
  }
}
