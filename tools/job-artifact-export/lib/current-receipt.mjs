import { digestNamedBytes } from '../../../server/paid-useful-jobs/lib/digest.mjs';
import { loadDeliveryCatalog } from '../../../server/paid-useful-jobs/lib/delivery-catalog.mjs';
import { engineProvenance } from '../../../server/paid-useful-jobs/lib/engine.mjs';
import { assertD01ExecutionRetrievable } from '../../result-mailbox/lib/d01-receipt.mjs';
import { verifyComplete } from '../../job-output-atomicity/index.mjs';
import { sha256Hex, sha256Prefixed } from './pins.mjs';
import { refuse } from './refuse.mjs';

export function currentReceiptBinding(files) {
  const entry = files.find(f => (f.path || f.name) === 'receipt.json');
  if (!entry) return null;
  let receipt;
  try { receipt = JSON.parse(entry.data); } catch { throw refuse('invalid-receipt', 'Receipt is not complete JSON'); }
  assertD01ExecutionRetrievable(receipt);
  if (receipt.outputsDigest !== digestNamedBytes(receipt.outputs)) throw refuse("receipt-output-mismatch", "Receipt output digest differs from named bytes");
  const catalog = loadDeliveryCatalog();
  const job = catalog.jobs.find(j => j.id === receipt.jobId);
  const legacy = engineProvenance();
  const expected = job?.enginePin || { sha256: legacy.archiveSha256, bytes: legacy.archiveBytes };
  if (receipt.engine?.archiveSha256 !== expected.sha256 || receipt.engine?.archiveBytes !== expected.bytes) {
    throw refuse('receipt-engine-mismatch', 'Receipt engine does not match current wrapper identity');
  }
  const names = new Set(receipt.outputs.map(o => o.name));
  for (const file of files) {
    const name = file.path || file.name;
    if (name !== 'receipt.json' && !names.has(name)) throw refuse('foreign-output', 'Receipt bundle contains an unlisted output');
  }
  for (const output of receipt.outputs) {
    const file = files.find(f => (f.path || f.name) === output.name);
    if (!file || file.data.length !== output.bytes || sha256Hex(file.data) !== output.sha256) {
      throw refuse('receipt-output-mismatch', 'Consumed output bytes differ from the receipt');
    }
  }
  return {
    receipt, catalog, expected,
    identityKind: job?.m01 ? 'current-source-identity' : 'wrapper-archive-identity',
    execution: {
      contract: receipt.contract, jobId: receipt.jobId,
      receiptSha256: sha256Prefixed(entry.data), outputsDigest: receipt.outputsDigest,
      sample: receipt.sample === true,
    },
  };
}

export function verifyCurrentComplete(root, binding) {
  const result = verifyComplete({ root, catalog: binding.catalog,
    expectedArchiveSha256: binding.expected.sha256, expectedArchiveBytes: binding.expected.bytes });
  if (!result.ok) throw refuse('receipt-not-complete', 'Current completeness consumer refused the bundle', { code: result.code });
  return { bound: true, consumer: 'tools/job-output-atomicity/index.mjs (current source)',
    ok: true, classification: result.classification, code: result.code };
}
