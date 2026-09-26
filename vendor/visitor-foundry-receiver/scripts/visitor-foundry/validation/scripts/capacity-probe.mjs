import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { candidate, defaultPolicy, harness } from '../fixtures/example-config.mjs';
const results = [];
for (const offered of [1, 8, 32, 128]) {
  const start = performance.now();
  const policies = Array.from({ length: 8 }, (_, i) => ({ ...defaultPolicy, id: `policy:scope-${i}`, scope: `scope:probe-${i}` }));
  const h = harness({ policies, limits: { maxOutstanding: 16, maxPerScope: 4, maxRunning: 2, maxRunningPerScope: 1, maxRecords: 256, maxCommands: 2048, maxCpuMs: 16000, maxWallMs: 160000, maxCost: { currency: 'USD_MICROS', units: '16000' } } });
  let admitted = 0; const refusals = {}; const scopesServed = []; let peakRunning = 0;
  for (let i = 0; i < offered; i++) {
    const result = h.command('contributor', 'submit', candidate(`probe-${i}`, { scope: policies[i % policies.length].scope }));
    if (result.ok) admitted++; else refusals[result.code] = (refusals[result.code] ?? 0) + 1;
  }
  assert.equal(admitted, Math.min(offered, 16));
  assert.equal(h.service.snapshot().charged.cpuMs, 0);
  while (Object.values(h.service.snapshot().candidates).some(c => c.stage === 'queued')) {
    const batch = [];
    for (;;) {
      const next = h.command('operator', 'assign', {});
      if (!next.ok) { assert.ok(['queue_empty', 'running_capacity'].includes(next.code)); break; }
      batch.push(next.result.assignment);
      scopesServed.push(h.service.snapshot().candidates[next.result.assignment.candidateId].candidate.scope);
    }
    peakRunning = Math.max(peakRunning, batch.length);
    assert.ok(batch.length > 0 && batch.length <= 2);
    for (const assignment of batch) assert.equal(h.command('runner', 'receipt', h.receipt(assignment)).ok, true);
  }
  const state = h.service.snapshot();
  assert.equal(Object.values(state.candidates).filter(c => c.acceptance === 'accepted').length, admitted);
  assert.equal(state.charged.costUnits, String(admitted * 1000));
  assert.equal(new Set(scopesServed.slice(0, Math.min(8, admitted))).size, Math.min(8, admitted));
  results.push({ offeredCandidates: offered, admitted, refused: offered - admitted, refusals, accepted: admitted, peakRunning, firstRoundScopes: scopesServed.slice(0, 8), charged: state.charged, measuredWallMs: Math.round((performance.now() - start) * 1000) / 1000 });
}
console.log(JSON.stringify({ provenance: 'owner_controlled_synchronous_capacity_probe', externalTraffic: false, concurrentClientBenchmark: false, actualCost: null, note: 'Offered bursts exercise bounded admission and scoped scheduling in one process. These are not throughput, demand, paid conversion or distributed-concurrency measurements.', results }, null, 2));
