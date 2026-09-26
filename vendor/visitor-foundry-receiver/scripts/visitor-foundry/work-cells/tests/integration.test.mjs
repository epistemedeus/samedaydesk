import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { boot, project, grant, request, create, mutate, state, code, path, command,
  checkpoint, contribution, ref, pg, databaseUrl, schema, submitted } from './helpers.mjs';

let a, b, db;
before(async () => {
  a = await boot(); b = await boot({ receipts: true });
  db = new pg.Pool({ connectionString: databaseUrl, max: 2, statement_timeout: 5000 });
});
after(async () => { await Promise.all([a?.stop(), b?.stop(), db?.end()]); });

test('concurrent create/exact retry persists one cell and one receipt; body and identity conflicts', async () => {
  const p = await project(a.baseUrl);
  const scope = `duplicate:${randomUUID()}`, key = randomUUID();
  const results = await Promise.all(Array.from({ length: 16 }, (_, i) => create(i % 2 ? a.baseUrl : b.baseUrl, p, scope, key)));
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(results.filter((r) => r.status === 200 && r.body.replayed).length, 15);
  const cell = state(results[0]);
  assert.ok(results.every((r) => r.body.receipt.cell.id === cell.id));
  code(await create(a.baseUrl, p, scope, key, { fundingKind: 'voluntary' }), 409, 'idempotency_conflict');
  code(await create(a.baseUrl, p, scope, randomUUID()), 409, 'revision_conflict');
  const w = await grant(a.baseUrl, p);
  const creation = command('create', 0, { gap: cell.gap, workScope: scope });
  code(await request(a.baseUrl, path(p), { token: w.token, body: creation, key }), 409, 'idempotency_conflict');
  const rows = await db.query(`SELECT count(*)::int AS count FROM "${schema}".correspondence_idempotency WHERE project_id=$1 AND scope=$2`, [p.projectId, `vf02:cell:${cell.id}`]);
  assert.equal(rows.rows[0].count, 1);
});

test('32 competing clients on two processes yield exactly one live lease per scope', async () => {
  const p = await project(a.baseUrl);
  const w1 = await grant(a.baseUrl, p), w2 = await grant(a.baseUrl, p);
  const initial = state(await create(a.baseUrl, p));
  const results = await Promise.all(Array.from({ length: 32 }, (_, i) => mutate(i % 2 ? a.baseUrl : b.baseUrl,
    p, initial, i % 2 ? w1.token : w2.token, 'claim', { ttlSeconds: 60, voluntaryOptIn: true })));
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(results.filter((r) => r.status === 409 && r.body.error.code === 'revision_conflict').length, 31);
  const cell = state(results.find((r) => r.status === 201));
  const held = await mutate(b.baseUrl, p, cell, w2.token, 'claim', { ttlSeconds: 60, voluntaryOptIn: true });
  code(held, 409, 'lease_held');
  assert.ok(Number(held.retryAfter) > 0);
  const read = await request(a.baseUrl, path(p, cell.id), { token: p.owner });
  assert.equal(read.body.leaseLive, true);
  assert.equal(read.body.cell.fence, 1);
  assert.equal(read.body.cell.gap.fundingKind, 'unfunded-request');
});

test('checkpoint transfer binds a fresh scoped session, fences stale writes, and caps grant lifetime', async () => {
  const p = await project(a.baseUrl);
  const w1 = await grant(a.baseUrl, p), w2 = await grant(a.baseUrl, p, 'writer', new Date(Date.now() + 60000).toISOString());
  let cell = state(await create(a.baseUrl, p));
  cell = state(await mutate(a.baseUrl, p, cell, w1.token, 'claim', { ttlSeconds: 60, voluntaryOptIn: true }));
  code(await mutate(a.baseUrl, p, cell, w1.token, 'transfer', { fence: cell.fence, targetGrantId: w2.grantId, ttlSeconds: 60 }), 409, 'checkpoint_required');
  cell = state(await mutate(a.baseUrl, p, cell, w1.token, 'checkpoint', { fence: cell.fence, checkpoint }));
  const cp = cell.checkpoint, oldFence = cell.fence;
  cell = state(await mutate(b.baseUrl, p, cell, w1.token, 'transfer', { fence: oldFence, targetGrantId: w2.grantId, ttlSeconds: 900 }));
  assert.deepEqual(cell.checkpoint, cp);
  assert.equal(cell.fence, oldFence + 1);
  assert.equal(cell.lease.expiresAt, w2.expiresAt);
  code(await mutate(a.baseUrl, p, cell, w1.token, 'checkpoint', { fence: oldFence, checkpoint }), 409, 'stale_fence');
  code(await mutate(a.baseUrl, p, cell, w2.token, 'submit', { fence: cell.fence, contribution: { ...contribution(cell), checkpointRevision: 1 } }), 409, 'candidate_mismatch');
  cell = state(await mutate(a.baseUrl, p, cell, w2.token, 'submit', { fence: cell.fence, contribution: contribution(cell) }));
  assert.equal(cell.status, 'submitted'); assert.equal(cell.lease, null);
  assert.equal(cell.disposition, null);
  assert.deepEqual(new Set(cell.submission.contributorGrantIds), new Set([w1.grantId, w2.grantId]));
  code(await mutate(b.baseUrl, p, cell, w1.token, 'claim', { ttlSeconds: 10, voluntaryOptIn: true }), 409, 'verification_pending');
});

test('real expiry permits takeover with retained checkpoint; expired session and revoked grant fail even exact replay', async () => {
  const p = await project(a.baseUrl);
  const expired = await grant(a.baseUrl, p, 'writer', new Date(Date.now() - 100).toISOString());
  let cell = state(await create(a.baseUrl, p));
  code(await mutate(a.baseUrl, p, cell, expired.token, 'claim', { ttlSeconds: 10, voluntaryOptIn: true }), 401, 'unauthorized');
  const w1 = await grant(a.baseUrl, p), w2 = await grant(a.baseUrl, p);
  const key = randomUUID(), before = cell;
  cell = state(await mutate(a.baseUrl, p, cell, w1.token, 'claim', { ttlSeconds: 1, voluntaryOptIn: true }, key));
  cell = state(await mutate(a.baseUrl, p, cell, w1.token, 'checkpoint', { fence: cell.fence, checkpoint }));
  await sleep(1100);
  assert.equal((await request(a.baseUrl, path(p, cell.id), { token: w1.token })).body.leaseLive, false);
  code(await mutate(a.baseUrl, p, cell, w1.token, 'renew', { fence: cell.fence, ttlSeconds: 60 }), 409, 'stale_fence');
  const historical = await mutate(a.baseUrl, p, before, w1.token, 'claim', { ttlSeconds: 1, voluntaryOptIn: true }, key);
  assert.equal(historical.status, 200); assert.match(historical.body.nextStep, /historical/);
  cell = state(await mutate(b.baseUrl, p, cell, w2.token, 'claim', { ttlSeconds: 60, voluntaryOptIn: true }));
  assert.equal(cell.fence, 2); assert.equal(cell.checkpoint.summary, checkpoint.summary);
  await request(a.baseUrl, `/v1/projects/${p.projectId}/grants/${w1.grantId}`, { token: p.owner, method: 'DELETE' });
  code(await mutate(a.baseUrl, p, before, w1.token, 'claim', { ttlSeconds: 1, voluntaryOptIn: true }, key), 401, 'unauthorized');
  await request(a.baseUrl, `/v1/projects/${p.projectId}/grants/${w2.grantId}`, { token: p.owner, method: 'DELETE' });
  cell = state(await mutate(b.baseUrl, p, cell, p.owner, 'claim', { ttlSeconds: 60, voluntaryOptIn: true }));
  assert.equal(cell.fence, 3);
});

test('tenant isolation, reader role, invalid transfer targets, and nonfinancial strict schema', async () => {
  const p = await project(a.baseUrl), foreign = await project(b.baseUrl);
  const w = await grant(a.baseUrl, p), reader = await grant(a.baseUrl, p, 'reader');
  const outsider = await grant(b.baseUrl, foreign);
  let cell = state(await create(a.baseUrl, p));
  assert.equal((await request(a.baseUrl, path(p, cell.id), { token: reader.token })).status, 200);
  code(await request(a.baseUrl, path(p, cell.id), { token: foreign.owner }), 404, 'not_found');
  code(await request(a.baseUrl, `${path(p, cell.id)}/receipts`, { token: outsider.token }), 404, 'not_found');
  code(await mutate(a.baseUrl, p, cell, reader.token, 'claim', { ttlSeconds: 10, voluntaryOptIn: true }), 403, 'forbidden');
  code(await mutate(a.baseUrl, p, cell, outsider.token, 'claim', { ttlSeconds: 10, voluntaryOptIn: true }), 404, 'not_found');
  code(await mutate(a.baseUrl, p, cell, w.token, 'claim', { ttlSeconds: 10, voluntaryOptIn: true, reward: 99 }), 400, 'invalid_input');
  code(await mutate(a.baseUrl, p, cell, w.token, 'claim', { ttlSeconds: 10 }), 400, 'invalid_input');
  code(await create(a.baseUrl, p, 'funded', randomUUID(), { fundingKind: 'funded' }), 400, 'invalid_input');
  cell = state(await mutate(a.baseUrl, p, cell, w.token, 'claim', { ttlSeconds: 60, voluntaryOptIn: true }));
  cell = state(await mutate(a.baseUrl, p, cell, w.token, 'checkpoint', { fence: cell.fence, checkpoint }));
  for (const target of [reader.grantId, outsider.grantId, w.grantId]) {
    code(await mutate(a.baseUrl, p, cell, w.token, 'transfer', { fence: cell.fence, ttlSeconds: 60, targetGrantId: target }), 403, 'invalid_target_grant');
  }
});

test('bounded cell-local replay is ordered, scoped, resumable and duplicates do not add rows', async () => {
  const p = await project(a.baseUrl), w = await grant(a.baseUrl, p);
  let cell = state(await create(a.baseUrl, p));
  cell = state(await mutate(a.baseUrl, p, cell, w.token, 'claim', { ttlSeconds: 60, voluntaryOptIn: true }));
  for (let i = 0; i < 7; i++) cell = state(await mutate(a.baseUrl, p, cell, w.token, 'checkpoint', { fence: cell.fence, checkpoint }));
  const other = state(await create(a.baseUrl, p));
  let cursor = null, revisions = [];
  for (let pages = 0; pages < 5; pages++) {
    const page = await request(a.baseUrl, `${path(p, cell.id)}/receipts?limit=3${cursor ? `&after=${cursor}` : ''}`, { token: w.token });
    assert.equal(page.status, 200);
    assert.ok(page.body.receipts.length <= 3);
    revisions.push(...page.body.receipts.map((r) => r.revision));
    cursor = page.body.nextCursor;
    if (!page.body.hasMore) break;
  }
  assert.deepEqual(revisions, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const empty = await request(a.baseUrl, `${path(p, cell.id)}/receipts?after=${cursor}`, { token: w.token });
  assert.deepEqual(empty.body.receipts, []); assert.equal(empty.body.nextCursor, cursor);
  code(await request(a.baseUrl, `${path(p, other.id)}/receipts?after=${cursor}`, { token: w.token }), 400, 'invalid_cursor');
  code(await request(a.baseUrl, `${path(p, cell.id)}/receipts?limit=51`, { token: w.token }), 400, 'invalid_input');
  assert.ok(!JSON.stringify(empty.body).includes(w.token));
});

test('holding one cell row does not block another cell in the SAME project; grant expiry rechecked after waits', async () => {
  const p = await project(a.baseUrl), w = await grant(a.baseUrl, p);
  const first = state(await create(a.baseUrl, p)), other = state(await create(a.baseUrl, p));
  const lock = await db.connect();
  let blocked;
  try {
    await lock.query('BEGIN');
    await lock.query(`SELECT 1 FROM "${schema}".correspondence_vf02_work_cells WHERE id=$1 FOR UPDATE`, [first.id]);
    blocked = mutate(a.baseUrl, p, first, w.token, 'claim', { ttlSeconds: 60, voluntaryOptIn: true });
    await sleep(100);
    // Same HTTP host; its second PG connection must remain available.
    const free = await Promise.race([mutate(a.baseUrl, p, other, w.token, 'claim', { ttlSeconds: 60, voluntaryOptIn: true }), sleep(1000).then(() => { throw new Error('unrelated cell blocked'); })]);
    assert.equal(free.status, 201);
    await lock.query('COMMIT');
    assert.equal((await blocked).status, 201);
    const expiring = await grant(a.baseUrl, p, 'writer', new Date(Date.now() + 350).toISOString());
    const fresh = state(await create(a.baseUrl, p));
    await lock.query('BEGIN');
    await lock.query(`SELECT 1 FROM "${schema}".correspondence_vf02_work_cells WHERE id=$1 FOR UPDATE`, [fresh.id]);
    blocked = mutate(a.baseUrl, p, fresh, expiring.token, 'claim', { ttlSeconds: 60, voluntaryOptIn: true });
    await sleep(450);
    await lock.query('COMMIT');
    code(await blocked, 401, 'unauthorized');
  } finally { await lock.query('ROLLBACK'); lock.release(); await blocked; }
});

test('project resolve/reopen authority is preserved, releases/cancellation/rejection are explicit', async () => {
  const p = await project(a.baseUrl), w = await grant(a.baseUrl, p);
  let cell = state(await create(a.baseUrl, p));
  cell = state(await mutate(a.baseUrl, p, cell, w.token, 'claim', { ttlSeconds: 60, voluntaryOptIn: true }));
  cell = state(await mutate(a.baseUrl, p, cell, w.token, 'release', { fence: cell.fence }));
  assert.equal(cell.status, 'open'); assert.equal(cell.lease, null);
  const closed = await request(a.baseUrl, `/v1/projects/${p.projectId}/events`, { token: p.owner, body: { kind: 'resolved', expectedVersion: 1 } });
  assert.equal(closed.status, 201);
  code(await mutate(a.baseUrl, p, cell, w.token, 'claim', { ttlSeconds: 60, voluntaryOptIn: true }), 409, 'project_resolved');
  code(await create(a.baseUrl, p), 409, 'project_resolved');
  await request(a.baseUrl, `/v1/projects/${p.projectId}/events`, { token: p.owner, body: { kind: 'reopened', expectedVersion: 2 } });
  cell = state(await mutate(a.baseUrl, p, cell, w.token, 'claim', { ttlSeconds: 60, voluntaryOptIn: true }));
  code(await mutate(a.baseUrl, p, cell, w.token, 'reject', { reason: 'not owner' }), 403, 'forbidden');
  cell = state(await mutate(a.baseUrl, p, cell, p.owner, 'reject', { reason: 'requester declines this scope' }));
  assert.equal(cell.status, 'rejected'); assert.equal(cell.disposition.source, 'owner');
  code(await mutate(a.baseUrl, p, cell, w.token, 'claim', { ttlSeconds: 60, voluntaryOptIn: true }), 409, 'terminal_cell');
  let pending = await submitted(a.baseUrl, p, w);
  const other = await grant(a.baseUrl, p);
  code(await mutate(a.baseUrl, p, pending, other.token, 'cancel', { reason: 'foreign contributor' }), 403, 'forbidden');
  pending = state(await mutate(a.baseUrl, p, pending, w.token, 'cancel', { reason: 'voluntary withdrawal' }));
  assert.equal(pending.status, 'cancelled');
});

test('receipt acceptance fails closed, rejects self/forged/drift, records deferred and independent dispositions', async () => {
  const p = await project(a.baseUrl), w = await grant(a.baseUrl, p);
  let cell = await submitted(a.baseUrl, p, w);
  const receipt = (mode) => ({ receipt: { ...ref, uri: `https://receipts.invalid/${mode}` } });
  code(await mutate(a.baseUrl, p, cell, p.owner, 'disposition', receipt('accepted')), 503, 'verification_unconfigured');
  code(await mutate(b.baseUrl, p, cell, w.token, 'disposition', receipt('accepted')), 403, 'forbidden');
  code(await mutate(b.baseUrl, p, cell, p.owner, 'disposition', { ...receipt('accepted'), outcome: 'accepted' }), 400, 'invalid_input');
  for (const mode of ['self', 'drift']) code(await mutate(b.baseUrl, p, cell, p.owner, 'disposition', receipt(mode)), 409, 'receipt_mismatch');
  code(await mutate(b.baseUrl, p, cell, p.owner, 'disposition', receipt('slow')), 503, 'verification_busy');
  cell = state(await mutate(b.baseUrl, p, cell, p.owner, 'disposition', receipt('deferred')));
  assert.equal(cell.status, 'submitted'); assert.equal(cell.disposition.verification.retryAfterSeconds, 30);
  const before = cell, key = randomUUID();
  cell = state(await mutate(b.baseUrl, p, cell, p.owner, 'disposition', receipt('accepted'), key));
  assert.equal(cell.status, 'accepted');
  const exact = await mutate(b.baseUrl, p, before, p.owner, 'disposition', receipt('accepted'), key);
  assert.equal(exact.status, 200); assert.deepEqual(exact.body.receipt.cell, cell);
  code(await mutate(b.baseUrl, p, cell, p.owner, 'cancel', { reason: 'late' }), 409, 'terminal_cell');
  let rejected = await submitted(a.baseUrl, p, w);
  rejected = state(await mutate(b.baseUrl, p, rejected, p.owner, 'disposition', receipt('rejected')));
  assert.equal(rejected.status, 'rejected'); assert.equal(rejected.disposition.source, 'verification');
  const selfOwned = await submitted(a.baseUrl, p, { token: p.owner });
  code(await mutate(b.baseUrl, p, selfOwned, p.owner, 'disposition', receipt('accepted')), 403, 'self_disposition');
});

test('real SIGKILL/restart restores checkpoint and exact retry; new authorized session continues', async () => {
  let old = await boot();
  let restarted;
  try {
    const p = await project(old.baseUrl), w = await grant(old.baseUrl, p), next = await grant(old.baseUrl, p);
    let cell = state(await create(old.baseUrl, p));
    cell = state(await mutate(old.baseUrl, p, cell, w.token, 'claim', { ttlSeconds: 60, voluntaryOptIn: true }));
    const before = cell, key = randomUUID();
    cell = state(await mutate(old.baseUrl, p, cell, w.token, 'checkpoint', { fence: cell.fence, checkpoint }, key));
    const oldPid = old.pid;
    await old.stop('SIGKILL');
    restarted = await boot();
    assert.notEqual(restarted.pid, oldPid);
    const snapshot = await request(restarted.baseUrl, path(p, cell.id), { token: next.token });
    assert.deepEqual(snapshot.body.cell, cell);
    const retry = await mutate(restarted.baseUrl, p, before, w.token, 'checkpoint', { fence: before.fence, checkpoint }, key);
    assert.equal(retry.status, 200); assert.equal(retry.body.replayed, true);
    cell = state(await mutate(restarted.baseUrl, p, cell, w.token, 'transfer', { fence: cell.fence, targetGrantId: next.grantId, ttlSeconds: 60 }));
    cell = state(await mutate(restarted.baseUrl, p, cell, next.token, 'submit', { fence: cell.fence, contribution: contribution(cell) }));
    assert.equal(cell.status, 'submitted');
    console.log(JSON.stringify({ evidence: 'actual-process-restart', oldPid, newPid: restarted.pid, durableRevision: cell.revision, checkpointResumed: true }));
  } finally { await old.stop(); await restarted?.stop(); }
});

test('SIGKILL of blocked in-flight mutation leaves no partial receipt; exact retry completes once', async () => {
  const host = await boot();
  const p = await project(host.baseUrl), w = await grant(host.baseUrl, p);
  const cell = state(await create(host.baseUrl, p)), key = randomUUID();
  const lock = await db.connect();
  let pending;
  try {
    await lock.query('BEGIN');
    await lock.query(`SELECT 1 FROM "${schema}".correspondence_vf02_work_cells WHERE id=$1 FOR UPDATE`, [cell.id]);
    pending = mutate(host.baseUrl, p, cell, w.token, 'claim', { ttlSeconds: 60, voluntaryOptIn: true }, key).catch(() => ({ status: 'unknown' }));
    await sleep(100);
    await host.stop('SIGKILL');
    await lock.query('COMMIT');
    assert.equal((await pending).status, 'unknown');
    const retry = await mutate(a.baseUrl, p, cell, w.token, 'claim', { ttlSeconds: 60, voluntaryOptIn: true }, key);
    assert.equal(retry.status, 201);
    const exact = await mutate(b.baseUrl, p, cell, w.token, 'claim', { ttlSeconds: 60, voluntaryOptIn: true }, key);
    assert.equal(exact.status, 200);
    assert.equal(exact.body.receipt.revision, 2);
  } finally { await lock.query('ROLLBACK'); lock.release(); await host.stop(); await pending; }
});

test('migration reversal removes only VF02 projection/receipts in its selected schema', async () => {
  const { readFile } = await import('node:fs/promises');
  const { createPostgresStore } = await import('../../../../services/correspondence/dist/store/postgres.js');
  const { WorkCellStore } = await import('../../../../services/correspondence/dist/visitor-work-cells/index.js');
  const reversal = `${schema}_reverse`;
  const base = await createPostgresStore(databaseUrl, { schema: reversal, poolMax: 1 });
  const cells = new WorkCellStore(databaseUrl, { schema: reversal, poolMax: 1 });
  const c = await db.connect();
  try {
    await cells.migrate(); await cells.migrate();
    await c.query(`SET search_path TO "${reversal}"`);
    await c.query('CREATE TABLE vf02_test_sentinel (id int)');
    await c.query('INSERT INTO vf02_test_sentinel VALUES(7)');
    await c.query(await readFile(new URL('../../../../services/correspondence/migrations/visitor-work-cells/001_vf02_work_cells.down.sql', import.meta.url), 'utf8'));
    assert.deepEqual((await c.query('SELECT * FROM vf02_test_sentinel')).rows, [{ id: 7 }]);
    assert.equal((await c.query("SELECT to_regclass('correspondence_vf02_work_cells') AS t")).rows[0].t, null);
    assert.ok((await c.query("SELECT to_regclass('correspondence_grants') AS t")).rows[0].t);
    await cells.migrate();
    await cells.checkReady();
  } finally { c.release(); await cells.close(); await base.close(); await db.query(`DROP SCHEMA "${reversal}" CASCADE`); }
});

test('client persists unknown outcome before POST and reconciles without raw credentials or widening session', async () => {
  const { WorkCellClient } = await import('../client.mjs');
  const { mkdirSync, readFileSync, rmSync } = await import('node:fs');
  const { root, gap } = await import('./helpers.mjs');
  const dir = `${root}.scratch/vf02-client-${process.pid}`;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    const p = await project(a.baseUrl), w = await grant(a.baseUrl, p), other = await grant(a.baseUrl, p);
    let sends = 0;
    const client = new WorkCellClient({ baseUrl: a.baseUrl, projectId: p.projectId, token: w.token,
      fetch: async (...args) => { sends++; await fetch(...args); throw new Error('lost successful response'); } });
    const file = `${dir}/attempt.json`;
    const body = command('create', 0, { gap, workScope: `lost:${randomUUID()}` });
    await assert.rejects(() => client.begin({ command: body, attemptFile: file }), { code: 'unknown_outcome' });
    assert.equal(sends, 1);
    assert.ok(!readFileSync(file, 'utf8').includes(w.token));
    const fresh = new WorkCellClient({ baseUrl: a.baseUrl, projectId: p.projectId, token: w.token });
    const recovered = await fresh.reconcile(file);
    assert.equal(recovered.replayed, true); assert.equal(recovered.receipt.revision, 1);
    await assert.rejects(() => fresh.begin({ command: body, attemptFile: file }), { code: 'EEXIST' });
    let widenedSends = 0;
    const different = new WorkCellClient({ baseUrl: a.baseUrl, projectId: p.projectId, token: other.token,
      fetch: () => { widenedSends++; throw new Error('must not send'); } });
    assert.throws(() => different.reconcile(file), { code: 'attempt_binding_mismatch' });
    assert.equal(widenedSends, 0);
    const empty = new WorkCellClient({ baseUrl: a.baseUrl, projectId: p.projectId, token: w.token,
      fetch: async () => new Response('{}', { status: 201 }) });
    await assert.rejects(() => empty.begin({ command: body, attemptFile: `${dir}/empty.json` }), { code: 'unknown_outcome' });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('row-lock timeout is bounded and identical failed attempt can safely retry after contention clears', async () => {
  const p = await project(a.baseUrl), w = await grant(a.baseUrl, p);
  const cell = state(await create(a.baseUrl, p)), key = randomUUID();
  const lock = await db.connect();
  try {
    await lock.query('BEGIN');
    await lock.query(`SELECT 1 FROM "${schema}".correspondence_vf02_work_cells WHERE id=$1 FOR UPDATE`, [cell.id]);
    const start = Date.now();
    const blocked = await mutate(a.baseUrl, p, cell, w.token, 'claim', { ttlSeconds: 60, voluntaryOptIn: true }, key);
    code(blocked, 503, 'unavailable');
    assert.ok(Date.now() - start < 4000, 'lock timeout stayed within request budget');
    assert.equal(blocked.retryAfter, '1');
    await lock.query('COMMIT');
    const retried = await mutate(a.baseUrl, p, cell, w.token, 'claim', { ttlSeconds: 60, voluntaryOptIn: true }, key);
    assert.equal(retried.status, 201);
    const receipts = await request(a.baseUrl, `${path(p, cell.id)}/receipts`, { token: w.token });
    assert.deepEqual(receipts.body.receipts.map((r) => r.revision), [1, 2]);
  } finally { await lock.query('ROLLBACK'); lock.release(); }
});

test('renewal retains fencing and exact renewal retry does not extend lease twice', async () => {
  const p = await project(a.baseUrl), w = await grant(a.baseUrl, p);
  let cell = state(await create(a.baseUrl, p));
  cell = state(await mutate(a.baseUrl, p, cell, w.token, 'claim', { ttlSeconds: 10, voluntaryOptIn: true }));
  const before = cell, key = randomUUID();
  cell = state(await mutate(a.baseUrl, p, cell, w.token, 'renew', { fence: cell.fence, ttlSeconds: 60 }, key));
  assert.equal(cell.fence, before.fence);
  assert.ok(Date.parse(cell.lease.expiresAt) > Date.parse(before.lease.expiresAt));
  await sleep(20);
  const retry = await mutate(b.baseUrl, p, before, w.token, 'renew', { fence: before.fence, ttlSeconds: 60 }, key);
  assert.equal(retry.status, 200); assert.deepEqual(retry.body.receipt.cell, cell);
});
