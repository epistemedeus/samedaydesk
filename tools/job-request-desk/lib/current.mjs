import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { freezeRequest } from '../../../server/paid-useful-jobs/lib/input-guard.mjs';
import { engineProvenance } from '../../../server/paid-useful-jobs/lib/engine.mjs';
import { digestNamedBytes } from '../../../server/paid-useful-jobs/lib/digest.mjs';
import { EXECUTION_CONTRACT_VERSION } from '../../../server/paid-useful-jobs/lib/contract.mjs';
import { isM01JobId, m01ReceiptProvenance } from '../../../server/paid-useful-jobs/lib/delivery-catalog.mjs';
import { digest, bytesDigest, fault } from './durable.mjs';

/** Integration source of wrapper + order repairs (PR146 / 080cc62). */
export const CURRENT_CORE_BASE = 'c6f1464222169f2d32247c978dc5007d82a2aa03';
/** Repair SHA merged by PR146. Byte-identical to CURRENT_CORE_BASE trees for wrapper/order. */
export const CURRENT_REPAIR_SHA = '080cc62e7bc83f76431d916df34aea6d30875401';
/** Overlay source packed into unpublished 1.4.4 (wrapper/interrupt included). */
export const CURRENT_ARCHIVE_PIN = 'e9528c3b1195f5ab5d388b73465c31bd422f5d3d';
/** Immutable unpublished 1.4.3 identity a18ab918. Does not contain wrapper.mjs; leave byte-identical. */
export const PREVIOUS_ARCHIVE_PIN_143 = '8a811bbadba7edc6c926b319b0839cd2f01e5896';
export const CURRENT_CATALOG_VERSION = '1.4.4';
export { EXECUTION_CONTRACT_VERSION };

/** fileEntry() includes absolute path and omits kind. Compare name/kind/bytes/sha256 only. */
export function namedByteProjection(rows = []) {
  return [...rows]
    .map(entry => ({
      name: entry.name,
      kind: entry.kind || 'file',
      bytes: entry.bytes ?? null,
      sha256: entry.sha256 ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function archiveEnginePin() {
  const pin = engineProvenance();
  return {
    package: pin.package,
    version: pin.version,
    sha256: pin.archiveSha256,
    bytes: pin.archiveBytes,
    cli: pin.cli,
    purchaseAuthority: false,
    schedulerDaemon: false,
    identityKind: 'wrapper-archive-identity',
    sourceCommit: pin.sourceCommit,
    archiveSha256: pin.archiveSha256,
    archiveBytes: pin.archiveBytes,
  };
}

export function enginePinForJob(job) {
  const jobId = typeof job === 'string' ? job : job?.id;
  const m01 = Boolean(job && typeof job === 'object' && job.m01) || (jobId ? isM01JobId(jobId) : false);
  if (m01 && jobId) {
    const provenance = m01ReceiptProvenance(typeof job === 'object' && job.id ? job : { id: jobId }) || engineProvenance();
    return {
      package: provenance.package,
      version: provenance.version,
      sha256: provenance.archiveSha256,
      bytes: provenance.archiveBytes,
      cli: provenance.cli,
      purchaseAuthority: false,
      schedulerDaemon: false,
      identityKind: 'current-source-identity',
      sourceCommit: provenance.sourceCommit,
      archiveSha256: provenance.archiveSha256,
      archiveBytes: provenance.archiveBytes,
      ownedPath: provenance.ownedPath,
    };
  }
  return archiveEnginePin();
}

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
  // Admitted bytes travel with the request; original paths are provenance only.
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

export function validateExecution(result, { job, requestId, executionId, entries, outDir, fundingIntent, example }) {
  requireFact(result && typeof result === 'object' && !Array.isArray(result), 'execution-unknown');
  requireFact(result.contract === EXECUTION_CONTRACT_VERSION, 'execution-contract-mismatch');
  const receipt = result.receipt || {};
  // receipt.v1 does not require nested executionId. Wrapper may stamp receipt.contract/transport/delivery.
  if (receipt.contract != null) requireFact(receipt.contract === EXECUTION_CONTRACT_VERSION, 'execution-contract-mismatch');
  requireFact(result.executionId === executionId && result.jobId === job.id, 'execution-identity-mismatch');
  if (receipt.jobId != null) requireFact(receipt.jobId === job.id, 'execution-identity-mismatch');
  if (receipt.executionId != null) requireFact(receipt.executionId === executionId, 'execution-identity-mismatch');
  requireFact(result.sold === false && receipt.sold !== true && result.purchaseAuthority === false && receipt.purchaseAuthority !== true, 'unexpected-purchase-authority');
  requireFact(result.liveSettleAttempted !== true && receipt.payment?.liveSettleAttempted !== true, 'possible-spend');
  if (receipt.transport != null) requireFact(result.transport === receipt.transport, 'contradictory-execution');
  if (receipt.analysis != null) requireFact(same(result.analysis, receipt.analysis), 'contradictory-execution');
  if (receipt.fundingState != null) requireFact(result.fundingState === receipt.fundingState, 'contradictory-funding');
  const expectedFunding = fundingIntent || 'unfunded';
  requireFact(result.fundingState === 'rejected' || result.fundingState === expectedFunding, 'funding-identity-mismatch');
  if (result.ok !== true) {
    if ((result.outputs?.length || 0) > 0 && result.delivery?.complete === true && result.outputs.length === job.outputs.length) {
      throw fault('contradictory-execution');
    }
    return { complete: false, code: result.code || 'execution-failed', outcomeKind: result.analysis?.outcome === 'refused' ? 'analysis-refused' : result.transport, outputs: [] };
  }
  requireFact(result.transport === 'ok' && result.delivery?.complete === true && receipt.delivery?.complete === true, 'incomplete-delivery');
  for (const delivery of [result.delivery, receipt.delivery]) {
    requireFact(delivery.status === 'complete' && same([...delivery.expected].sort(), [...job.outputs].sort()) && same([...delivery.present].sort(), [...job.outputs].sort()) && delivery.missing?.length === 0, 'catalog-delivery-mismatch');
  }
  requireFact(Array.isArray(result.outputs) && Array.isArray(receipt.outputs) && result.outputs.length === job.outputs.length && new Set(result.outputs.map(o => o.name)).size === job.outputs.length, 'output-set-mismatch');
  requireFact(same(namedByteProjection(result.outputs), namedByteProjection(receipt.outputs)), 'receipt-output-mismatch');
  requireFact(receipt.outputsDigest === digestNamedBytes(namedByteProjection(result.outputs)), 'outputs-digest-mismatch');
  if (!example) {
    requireFact(Array.isArray(receipt.inputs) && same(namedByteProjection(entries), namedByteProjection(receipt.inputs)), 'input-identity-mismatch');
    requireFact(receipt.inputsDigest === digestNamedBytes(namedByteProjection(entries)), 'inputs-digest-mismatch');
  }
  const expected = enginePinForJob(job);
  requireFact(receipt.engine?.archiveSha256 === expected.archiveSha256 && receipt.engine?.archiveBytes === expected.archiveBytes && receipt.engine?.sourceCommit === expected.sourceCommit, 'engine-pin-mismatch');
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

export function verifyStoredTicket(ticket) {
  if (!ticket) return;
  if (ticket.execution?.executionId && ticket.execution.executionId !== ticket.executionId) throw fault('execution-identity-mismatch');
  if (ticket.resultDigest && ticket.execution && digest(ticket.execution) !== ticket.resultDigest) throw fault('result-digest-mismatch');
  if (ticket.executionOk) verifyStoredOutputs(ticket);
}
