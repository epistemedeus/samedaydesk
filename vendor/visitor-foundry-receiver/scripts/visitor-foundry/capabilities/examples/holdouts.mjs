import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { satisfiesEnginesNode } from '../../../../packs/capability-preflight/src/probes.mjs';
import { SCHEMAS, hash, refOf, resolve } from '../src/index.mjs';
import { packageFixture, request, NOW, SOURCE_PIN } from './fixtures.mjs';

// Frozen synthetic no-network baseline: a deliberately bounded major-only implementation.
// Declares unsupported minor/compound syntax unknown. This is not a historical user baseline.
export function baseline(range, nodeVersion) {
  const match = /^>=\s*(\d+)\s*$/.exec(range);
  if (!match) return 'unknown';
  return Number(nodeVersion.split('.')[0]) >= Number(match[1]) ? 'compatible' : 'incompatible';
}
const status = result => result === true ? 'compatible' : result === false ? 'incompatible' : 'unknown';
export function runHoldouts({ measure = true } = {}) {
  // Freeze the inventory and admission policy before reading tasks; no holdout is used as admission evidence.
  const fixture = packageFixture();
  const dataset = JSON.parse(readFileSync(new URL('./holdouts.json', import.meta.url), 'utf8'));
  const observations = dataset.cases.map(task => {
    const req = request({ taskId: task.id, outcome: 'node-engine-compatibility', input: { range: task.range, nodeVersion: task.nodeVersion }, capabilityId: fixture.capability.capabilityId });
    const b0 = performance.now(), baselineResult = baseline(task.range, task.nodeVersion), baselineMs = performance.now() - b0;
    const r0 = performance.now(), resolution = resolve(fixture.snapshot, req, { now: NOW, policy: fixture.policy });
    // Fixed repository-owned export only. No manifest scripts, shell text or proposed tests are executed.
    const result = resolution.status === 'compatible' ? status(satisfiesEnginesNode(task.range, task.nodeVersion)) : 'unavailable';
    const reuseMs = performance.now() - r0;
    return { schema: SCHEMAS['reuse-observation'], id: `reuse:${task.id}`, revision: 1, target: refOf(fixture.capability),
      sourcePin: SOURCE_PIN, taskId: task.id, priorTaskId: 'fixture:package-engine-probe', observedAt: NOW,
      relationship: 'owner-controlled', independence: 'not-independent', outcomeSource: 'fixture:local-heldout-runner-v1',
      resolutionId: resolution.resolutionId, expected: task.expected, baseline: { result: baselineResult, success: baselineResult === task.expected,
        elapsedMs: measure ? baselineMs : null, cost: null },
      reuse: { result, success: result === task.expected, elapsedMs: measure ? reuseMs : null, cost: null },
      adaptation: { description: 'Map the existing package boolean/null return to a status string.', effortMs: null },
      receiptId: hash({ task, result, baselineResult, target: refOf(fixture.capability) }) };
  });
  return { schema: 'neomorphic.foundry.synthetic-reuse-evaluation.v1', datasetId: dataset.datasetId, datasetDigest: hash(dataset),
    sourcePin: SOURCE_PIN, baselineId: 'fixture:major-only-no-network-v1', baselineDigest: hash(baseline.toString()),
    snapshotId: fixture.snapshot.snapshotId, laterTasks: observations.length,
    baselineSuccesses: observations.filter(o => o.baseline.success).length, reuseSuccesses: observations.filter(o => o.reuse.success).length,
    additionalSuccessfulTasks: observations.filter(o => o.reuse.success && !o.baseline.success).length, observations,
    limitations: ['Synthetic owner-controlled tasks; public reproducible holdouts, not a blinded independent benchmark.',
      'Baseline covers major-only syntax. Difference measures added minor-version coverage, not generalized model uplift.',
      'No external demand, paid delivery, token savings or elapsed-time savings claim. Timings are local mechanics including resolver overhead.',
      'Sharing, independent verification and maintenance effort are unmeasured; costs remain null.'] };
}
