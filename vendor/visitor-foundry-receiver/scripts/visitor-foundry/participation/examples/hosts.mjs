import { readFileSync } from 'node:fs';
import { adaptPackage, createSnapshot, refOf } from '../../capabilities/src/index.mjs';
import { satisfiesEnginesNode } from '../../../../packs/capability-preflight/src/probes.mjs';
import { publicTaskView } from '../../../../packs/contributor-desk/src/public-view.mjs';
import { assessVF01, ENVELOPE, httpBoundary, toolBoundary, buildReproducer, sharingBytes } from '../src/index.mjs';
export const PIN = '28924aac2a33cdf58bc9049a2198ab1ce9866f0f';
export const NOW = '2026-09-26T14:00:00.000Z';
export const tasks = JSON.parse(readFileSync(new URL('./frozen-tasks.json', import.meta.url), 'utf8'));
export const terms = `sha256:${'1'.repeat(64)}`;
export const disclosure = { actionability: 'not-actionable', rights: { status: 'allowed', ref: 'source:sample-MIT' }, funding: { kind: 'voluntary', ref: null }, cost: null, termsVersion: terms };
export const negotiation = { accepts: [ENVELOPE], budgetSeconds: 900 };
const objectShape = properties => ({ type: 'object', required: Object.keys(properties), properties });
function foundation(path, outcome, input, output) {
  const manifest = JSON.parse(readFileSync(new URL(`../../../../${path}/package.json`, import.meta.url), 'utf8'));
  const version = adaptPackage({ manifest, source: { repository: 'https://github.com/epistemedeus/neomorphic-io', revision: PIN, path }, outcomes: [outcome], input, output,
    rights: { status: 'allowed', license: 'MIT', ref: `source:${path}/LICENSE` }, environment: { nodeMajor: [22] },
    provenance: { refs: [`git:${PIN}`], origin: 'operator:owner-controlled', maintainer: 'operator:neomorphic', classification: 'maintained', funding: 'unknown', actionability: 'not-actionable', original: { installedAsset: path, evidence: 'owner-controlled-synthetic' } } });
  const observation = { schema: 'neomorphic.foundry.compatibility-observation.v1', id: `test:${outcome}`, target: refOf(version), scope: { outcome, environment: { nodeMajor: 22 }, inputDigest: null }, verdict: 'compatible', observedAt: NOW, expiresAt: null, observerId: 'test:owner-controlled-runner', receiptRef: 'test:synthetic-assertion' };
  const snapshot = createSnapshot({ versions: [version], observations: [observation], mutations: [], coverage: { outcomes: [outcome], complete: true, sourceRefs: ['test:bounded-inventory'], asOf: NOW } });
  const options = { now: NOW, policy: { policyRef: 'test:owner-controlled-admission', admittedObservationIds: [observation.id] } };
  const assess = (inputValue, taskId, wantedOutput = null, graph = snapshot) => assessVF01({ snapshot: graph, permission: { provenance: 'synthetic', authorizationRef: 'fixture:frozen-tasks' },
    request: { schema: 'neomorphic.foundry.capability-request.v1', taskId, outcome, input: inputValue, environment: { nodeMajor: 22 }, output: wantedOutput, capabilityId: version.capabilityId }, options,
    gap: { gapId: `${taskId}:gap`, reproducer: { ref: `${taskId}:synthetic`, permission: 'synthetic' }, funding: { kind: 'voluntary', ref: null } } });
  return { version, snapshot, options, assess };
}
export function preflightHost() {
  const asset = foundation('packs/capability-preflight', 'node-engine-compatibility', objectShape({ range: { type: 'string', enum: ['>=22', '>=22.1'] }, nodeVersion: { type: 'string' } }), objectShape({ status: { type: 'string' } }));
  function invoke(task, accepts = negotiation) {
    const value = satisfiesEnginesNode(task.range, task.nodeVersion);
    const status = value === null ? 'unknown' : value ? 'compatible' : 'incompatible';
    const original = { status: 200, headers: { 'content-type': 'application/json' }, body: { status } };
    const assessment = asset.assess({ range: task.range, nodeVersion: task.nodeVersion }, task.taskId);
    return { ...httpBoundary(original, accepts, { assessment, condition: 'resolved', disclosure }), assessment };
  }
  return { ...asset, invoke };
}
export function deskHost() {
  const asset = foundation('packs/contributor-desk', 'walletless-task-disclosure', objectShape({ lifecycle: { type: 'string' }, fundingState: { type: 'string' }, claimable: { type: 'boolean' } }), objectShape({ claimable: { type: 'boolean' } }));
  function invoke(task, accepts = negotiation) {
    const original = publicTaskView({ id: task.taskId, title: 'Synthetic scoped task', summary: 'Owner-controlled', ...task, termsVersion: terms, reward: null, provenance: 'owner-controlled-synthetic', updatedAt: NOW });
    const assessment = asset.assess({ lifecycle: task.lifecycle, fundingState: task.fundingState, claimable: task.claimable }, task.taskId,
      task.missingOutput ? objectShape({ fundingAsOf: { type: 'string' } }) : null);
    return { output: toolBoundary(original, accepts, { assessment, condition: 'resolved', disclosure: { ...disclosure, funding: { kind: 'unfunded-request', ref: null } } }), assessment };
  }
  return { ...asset, invoke };
}
export const preflightTemplate = { id: 'template:engine-range-v1', fields: { range: { type: 'string', maxLength: 80 }, nodeVersion: { type: 'string', maxLength: 40 } } };
export function demonstrations() {
  const preflight = preflightHost(), desk = deskHost();
  const first = preflight.invoke(tasks.preflight.original), second = desk.invoke(tasks.desk.original);
  const reproducer = buildReproducer({ template: preflightTemplate, input: tasks.preflight.original, sharing: { scope: 'reproducer', provenance: 'synthetic', authorizationRef: 'fixture:frozen-preflight' } });
  const metadata = buildReproducer({ template: { id: 'template:desk-output-v1', fields: {} }, input: tasks.desk.original });
  return { schema: 'neomorphic.foundry.participation-examples.v1', relationship: tasks.relationship, independence: tasks.independence,
    original: { preflight: { result: first.response.body, participation: first.participation }, desk: second.output },
    later: { preflight: preflight.invoke(tasks.preflight.later).response.body, desk: desk.invoke(tasks.desk.later).output.result.claimable },
    sharing: { preflight: { decisions: 2, projectedBytes: sharingBytes(reproducer), fields: 2 }, desk: { decisions: 1, projectedBytes: sharingBytes(metadata), fields: 0 } },
    artifacts: [preflight.version.source, desk.version.source], cost: null, nonClaims: tasks.nonClaims };
}
