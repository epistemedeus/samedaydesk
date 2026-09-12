import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CONTRACT = 'samedaydesk.paid-useful-jobs.execution.v1';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// Whole stdout only. No object slicing, stderr fallback, or exit-code erasure.
export function parseProcess(proc) {
  assert.equal(proc.timedOut, false, 'process timed out');
  assert.equal(proc.signal, null, 'process was interrupted');
  const body = JSON.parse(proc.stdout);
  assert.ok(body && typeof body === 'object' && !Array.isArray(body), 'object required');
  assert.equal(proc.status, body.ok === true ? 0 : 2, 'exit code contradicts body');
  return body;
}

export function assertComplete(body, { jobId, outputs, executionId, inputHashes = {} }, root = body.runOutDir) {
  assert.equal(body.ok, true, `execution refused: ${body.code || body.transport}`);
  assert.equal(body.contract, CONTRACT);
  assert.equal(body.transport, 'ok');
  assert.equal(body.delivery?.complete, true);
  assert.equal(body.jobId, jobId);
  if (executionId) assert.equal(body.executionId, executionId);
  assert.equal(body.sold, false);
  assert.equal(body.sample, false);
  assert.ok(root, 'isolated output directory required');
  assert.equal(body.receipt?.jobId, jobId);
  assert.equal(body.receipt?.executionId, body.executionId);
  assert.equal(body.receipt?.contract, CONTRACT);
  assert.equal(body.receipt?.transport, 'ok');
  assert.equal(body.receipt?.delivery?.complete, true);
  const names = rows => rows.map(r => r.name).sort();
  assert.deepEqual(names(body.outputs), [...outputs].sort());
  assert.deepEqual(names(body.receipt.outputs), [...outputs].sort());
  assert.equal(new Set(names(body.outputs)).size, outputs.length);
  for (const row of body.outputs) {
    assert.equal(row.name.includes('/'), false);
    assert.equal(row.name.includes('\\'), false);
    assert.ok(lstatSync(join(root, row.name)).isFile());
    const bytes = readFileSync(join(root, row.name));
    assert.equal(bytes.length, row.bytes);
    assert.equal(sha256(bytes), row.sha256);
    const nested = body.receipt.outputs.find(r => r.name === row.name);
    assert.equal(nested.bytes, row.bytes);
    assert.equal(nested.sha256, row.sha256);
  }
  for (const [name, hash] of Object.entries(inputHashes)) {
    assert.equal(body.receipt.inputs.find(r => r.name === name)?.sha256, hash, `input ${name} changed`);
  }
  return body;
}

export function assertRefused(body, code) {
  assert.equal(body.ok, false);
  assert.equal(body.code, code);
  assert.notEqual(body.sold, true);
  assert.notEqual(body.delivery?.complete, true);
}

export function missing(message) {
  throw Object.assign(new Error(message), { code: 'CURRENT_SURFACE_MISSING' });
}
