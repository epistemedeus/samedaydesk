import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import type { CorrespondenceStore } from '../src/store/types.js';
import { prepareFoundryHost } from '../src/visitor-foundry/host.js';

test('failed extension readiness closes extension and base once, preserving original error', async () => {
  let baseCloses = 0, extensionCloses = 0;
  const failure = new Error('readiness failed');
  const base = { close: async () => { baseCloses++; } } as unknown as CorrespondenceStore;
  await assert.rejects(prepareFoundryHost(base, { enabled: true, create: async () => ({
    router: express.Router(), checkReady: async () => { throw failure; },
    close: async () => { extensionCloses++; throw new Error('cleanup failed'); },
  }) }), error => error === failure);
  await assert.rejects(base.close(), /cleanup failed/);
  assert.equal(baseCloses, 1); assert.equal(extensionCloses, 1);
});

test('concurrent shutdown drains both resources once even when extension close fails', async () => {
  let baseCloses = 0, extensionCloses = 0, readyCalls = 0;
  const base = { checkReady: async () => { readyCalls++; }, close: async () => { baseCloses++; } } as unknown as CorrespondenceStore;
  await prepareFoundryHost(base, { enabled: true, create: async () => ({
    router: express.Router(), checkReady: async () => {},
    close: async () => { extensionCloses++; throw new Error('extension close'); },
  }) });
  await base.checkReady?.();
  const outcomes = await Promise.allSettled([base.close(), base.close()]);
  assert.ok(outcomes.every(outcome => outcome.status === 'rejected'));
  assert.equal(baseCloses, 1); assert.equal(extensionCloses, 1); assert.equal(readyCalls, 1);
});
