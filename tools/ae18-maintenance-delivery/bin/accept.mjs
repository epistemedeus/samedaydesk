#!/usr/bin/env node
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { createHarness, exec, save } from './harness.mjs';
import { digest } from '../src/inputs.mjs';
import { DatabaseSync } from 'node:sqlite';
const h = await createHarness();
try {
  await h.start();
  const companion = new URL('./companion.mjs', import.meta.url).pathname;
  const call = async (command, config, name) => {
    const file = join(h.dir, `${name}.json`); save(file, config);
    const output = await exec(process.execPath, [companion, command, file], { maxBuffer: 1048576 });
    return JSON.parse(output.stdout);
  };
  const ownerState = join(h.dir, 'saved-assessment.json'), reviewState = join(h.dir, 'saved-review.json');
  const a = await call('execute', { baseUrl: h.baseUrl, credentialFile: h.ownerCredentialFile, stateFile: ownerState,
    routeId: `${h.routePrefix}.assess`, input: h.assessInput }, 'assess-call');
  assert.equal(a.status, 'completed'); assert.equal(a.output.disposition, 'bounded_assessment');
  assert.equal(a.output.assessment.template.detected, 'changed'); assert.equal(a.output.assessment.template.acceptance, 'approval_pending');
  assert.equal(a.output.assessment.recipe.outcome, 'changed'); assert.equal(a.output.assessment.merchant.report.claims.complete, true);
  const b = await call('execute', { baseUrl: h.baseUrl, credentialFile: h.reviewCredentialFile, stateFile: reviewState,
    routeId: `${h.routePrefix}.review`, input: h.reviewInput(a) }, 'review-call');
  assert.equal(b.status, 'completed'); assert.equal(b.output.acceptance, 'accepted');
  const gets = h.sourceGets;
  // Resume in a separate consumer process before stopping the listener.
  const replay = await call('execute', { baseUrl: h.baseUrl, credentialFile: h.reviewCredentialFile, stateFile: reviewState,
    routeId: `${h.routePrefix}.review`, input: h.reviewInput(a), resume: true }, 'review-resume');
  assert.deepEqual(replay, b);
  await h.stop();
  const database = new DatabaseSync(h.config.stateFile, { readOnly: true });
  const persisted = { usage: database.prepare('SELECT tenant,calls,units FROM usage ORDER BY tenant').all(),
    attempts: database.prepare('SELECT count(*) AS count, sum(possible) AS possiblePayments, sum(reservation) AS reservedUnits FROM attempts').get(),
    paymentIdentities: database.prepare('SELECT count(*) AS count FROM credentials').get().count };
  database.close();
  assert.equal(persisted.attempts.count, 2); assert.equal(persisted.attempts.possiblePayments, 0);
  assert.equal(persisted.attempts.reservedUnits, 0); assert.equal(persisted.paymentIdentities, 0);
  assert.deepEqual(persisted.usage.map(row => [row.calls, row.units]), [[1, 0], [1, 0]]);
  assert.equal(gets, 3);
  await h.start();
  const readback = await call('readback', { baseUrl: h.baseUrl, credentialFile: h.reviewCredentialFile, receiptId: b.id }, 'cold-readback');
  assert.deepEqual(readback, b); assert.equal(h.sourceGets, gets);
  assert.equal(b.payment.state, 'not_required'); assert.equal(a.price.amount, 0); assert.equal(b.price.amount, 0);
  assert.deepEqual(b.output.effects, { paymentAttempts: 0, captures: 0, obligations: 0, paidTaskIncrement: 0, repairExecutions: 0 });
  const result = { schema: 'samedaydesk.ae18-mounted-acceptance.v1', ok: true, runtime: 'current-machine-gateway-sqlite-wal',
    mountedSourceChanged: JSON.stringify(h.before) !== JSON.stringify(h.after), before: h.before, after: h.after,
    descriptor: h.descriptor, rights: h.rights, priorDigest: h.prior.sha256, priorReadbackDigest: digest(JSON.parse(readFileSync(h.priorPath)).payload),
    assessmentReceipt: a, handbackReceipt: b, durableReadbackReceipt: readback, exactReadback: true,
    separateConsumerProcesses: 4, apiProcesses: 2, replaySameReceipt: true, sourceRequestsForOccurrence: a.output.assessment.sourceRequests,
    sourceGetsIncludingHarnessBeforeAfter: gets, sourceGetsAfterReplayReadback: h.sourceGets,
    effects: b.output.effects, persistedGatewayState: persisted, publicServingEvidence: null, missingRepairOutput: 'E02 reviewed repair artifact not supplied',
    usageProof: 'Read-only SQLite inspection after API exit: exactly two calls, zero units/reservations/possible payments/payment identities. Independent source counter is three (two harness reads, one occurrence GET) and unchanged by replay/readback.' };
  if (process.argv[2]) save(process.argv[2], result);
  process.stdout.write(`${JSON.stringify({ ok: true, acceptance: b.output.acceptance, disposition: a.output.disposition,
    assessmentId: a.id, handbackId: b.id, exactReadback: true, effects: b.output.effects })}\n`);
} finally { await h.close(); }
