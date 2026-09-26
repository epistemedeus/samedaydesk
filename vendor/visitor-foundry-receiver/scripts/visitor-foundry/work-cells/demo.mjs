import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WorkCellClient } from './client.mjs';
import { boot, project, grant, command, gap, checkpoint, contribution, ref, root } from './tests/helpers.mjs';

// Cold session reloads only the scoped state; no chat history or artifact fetch.
let first = await boot(), second;
const dir = join(root, '.scratch', `vf02-demo-${process.pid}`);
mkdirSync(dir, { mode: 0o700 });
const trace = [];
try {
  const p = await project(first.baseUrl), visitorA = await grant(first.baseUrl, p), visitorB = await grant(first.baseUrl, p);
  const a = new WorkCellClient({ baseUrl: first.baseUrl, projectId: p.projectId, token: visitorA.token });
  let index = 0;
  const begin = (client, cell, action, fields) => client.begin({ cellId: cell?.id ?? '',
    command: command(action, cell?.revision ?? 0, fields), attemptFile: join(dir, `attempt-${++index}.json`) });
  let cell = (await begin(a, null, 'create', { gap, workScope: 'demo:nonfinancial' })).receipt.cell;
  cell = (await begin(a, cell, 'claim', { ttlSeconds: 60, voluntaryOptIn: true })).receipt.cell;
  cell = (await begin(a, cell, 'checkpoint', { fence: cell.fence, checkpoint })).receipt.cell;
  cell = (await begin(a, cell, 'transfer', { fence: cell.fence, targetGrantId: visitorB.grantId, ttlSeconds: 60 })).receipt.cell;
  trace.push({ stage: 'visitor-a-handoff', revision: cell.revision, fence: cell.fence, checkpointRevision: cell.checkpoint.revision, fundingKind: cell.gap.fundingKind });
  await first.stop('SIGKILL');
  second = await boot({ receipts: true });
  const b = new WorkCellClient({ baseUrl: second.baseUrl, projectId: p.projectId, token: visitorB.token });
  cell = (await b.get(cell.id)).cell;
  assert.equal(cell.lease.grantId, visitorB.grantId);
  trace.push({ stage: 'cold-visitor-b-after-process-restart', newProcess: second.pid !== first.pid,
    checkpointSummary: cell.checkpoint.summary, transcriptRequired: false });
  cell = (await begin(b, cell, 'submit', { fence: cell.fence, contribution: contribution(cell) })).receipt.cell;
  assert.equal(cell.status, 'submitted');
  trace.push({ stage: 'submission', status: cell.status, artifactFetched: false, artifactExecuted: false });
  const owner = new WorkCellClient({ baseUrl: second.baseUrl, projectId: p.projectId, token: p.owner });
  cell = (await begin(owner, cell, 'disposition', { receipt: { ...ref, uri: 'https://receipts.invalid/accepted' } })).receipt.cell;
  assert.equal(cell.status, 'accepted');
  trace.push({ stage: 'synthetic-trusted-receipt', status: cell.status,
    relationship: cell.disposition.verification.contributorRelationship, limitations: cell.disposition.verification.limitations });
  const page = await b.replay(cell.id, { limit: 3 });
  trace.push({ stage: 'bounded-replay', receipts: page.receipts.length, hasMore: page.hasMore });
  const result = { schema: 'neomorphic.foundry.work-cell-demo.v1', evidenceClass: 'owner-controlled-local-fixture', trace,
    noPaymentPromise: true, contributionOptional: true, gapFundingUnchanged: cell.gap.fundingKind,
    remainingIntegration: 'Real VF01 gap provenance and VF03 trusted receipt admission; no hosted deployment or capability publication.' };
  const serialized = JSON.stringify(result, null, 2);
  assert.ok(!serialized.includes(visitorA.token) && !serialized.includes(visitorB.token) && !serialized.includes(p.owner));
  writeFileSync(join(root, 'scripts/visitor-foundry/work-cells/evidence/cold-demo.json'), `${serialized}\n`);
  console.log(serialized);
} finally { await first.stop(); await second?.stop(); rmSync(dir, { recursive: true, force: true }); }
