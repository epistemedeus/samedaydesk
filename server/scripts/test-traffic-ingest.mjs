import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import express from 'express';
import pg from 'pg';
import { startDisposablePg } from './fixtures/disposable-pg.mjs';
import { commerceVisit, commerceBrowser, recordCommerceJourney } from '../lib/commerce-journey.js';
import { closeSharedCarePool } from '../lib/care-database.js';
import { trafficProjection } from '../lib/traffic-context.mjs';

test('normal HTTP ingest stores a page, merges first interaction and preserves legacy unknown and QA', async t => {
  const cluster = await startDisposablePg();
  const db = new pg.Pool({ connectionString: cluster.url });
  const before = { ...process.env };
  Object.assign(process.env, { SDS_PRIVATE_PREVIEW: '1', SDS_CARE_DATABASE_URL: cluster.url, SDS_CARE_SCHEMA: 'public' });
  t.after(async () => { await closeSharedCarePool(); await db.end(); await cluster.stop();
    for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key]; Object.assign(process.env, before); });
  const migration = readFileSync(new URL('../../supabase/migrations/0014_commerce_journey.sql', import.meta.url), 'utf8');
  await db.query(migration.match(/create table if not exists [^;]+;/is)[0]);
  await db.query(readFileSync(new URL('../../supabase/migrations/0017_journey_traffic.sql', import.meta.url), 'utf8'));
  const old = randomUUID();
  await recordCommerceJourney('visit', { sessionId: old, key: old });
  const app = express(); app.use(express.json({ limit: '2kb' })); app.use(commerceVisit);
  app.post('/api/pulse/traffic', commerceBrowser); app.get('/pricing', (_req,res) => res.send('Pricing'));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  t.after(() => new Promise(r => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const initial = await fetch(base + '/pricing?email=private@example.test', { headers: { 'user-agent': 'Mozilla/5.0 actual-test' } });
  const cookie = initial.headers.get('set-cookie').split(';')[0];
  const send = (body, extra = {}) => fetch(base + '/api/pulse/traffic', { method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 actual-test', cookie, ...extra }, body: JSON.stringify(body) });
  const observation = { path: '/pricing?secret=discarded', scriptRan: true, interacted: false };
  assert.equal((await send(observation)).status, 204);
  assert.equal((await send({ ...observation, interacted: true })).status, 204);
  assert.equal((await send(observation)).status, 204, 'late baseline is safe');
  const rows = (await db.query('select event,session_id::text as session,test,traffic from journey_events order by created_at')).rows;
  assert.equal(rows.length, 2); assert.equal(rows[0].traffic, null);
  assert.equal(rows[1].traffic.path, '/pricing'); assert.equal(rows[1].traffic.scriptRan, true);
  assert.equal(rows[1].traffic.interacted, true); assert.equal(rows[1].traffic.country, null);
  assert.equal(rows[1].test, true); assert.equal(trafficProjection(rows).counts.own, 2);
  await recordCommerceJourney('checkout_started',{sessionId:rows[1].session,key:'context-copy',live:false});
  assert.deepEqual((await db.query("select traffic from journey_events where event='checkout_started'")).rows[0].traffic, rows[1].traffic);
  for (const poison of [{ ip: '192.0.2.1' }, { country: 'US' }, { test: false }, { event: 'payment_verified' }, { coarseClass: 'browser' }]) {
    assert.equal((await send({ ...observation, ...poison })).status, 400);
  }
  assert.equal((await send({ ...observation, path: '//evil.test/' })).status, 400);
  assert.equal((await send(observation, { 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal(await recordCommerceJourney('visit', { sessionId: old, key: old, traffic: rows[1].traffic }), true);
  assert.equal((await db.query('select traffic from journey_events where session_id=$1', [old])).rows[0].traffic, null);
  assert(!JSON.stringify(rows).includes('private@example.test'));
  await db.query('create role service_role');
  await db.query(readFileSync(new URL('../../supabase/migrations/0018_journey_traffic_rpc.sql', import.meta.url), 'utf8'));
  const rpcSession = randomUUID();
  const rpc = {event_key: 'samedaydesk/visit/rpc-fixture',brand:'samedaydesk',event:'visit',session_id:rpcSession,
    test:true,order_id:null,is_agent:false,referrer:null,utm:{},traffic:rows[1].traffic};
  await db.query('select public.record_journey_traffic($1)',[rpc]);
  await db.query('select public.record_journey_traffic($1)',[{...rpc,traffic:{...rpc.traffic,interacted:false}}]);
  assert.equal((await db.query('select traffic from journey_events where session_id=$1',[rpcSession])).rows[0].traffic.interacted,true);
  assert.equal((await db.query("select has_function_privilege('public.record_journey_traffic(jsonb)','EXECUTE') as allowed")).rows[0].allowed,true);
  await db.query('create role anonymous_traffic');
  assert.equal((await db.query("select has_function_privilege('anonymous_traffic','public.record_journey_traffic(jsonb)','EXECUTE') as allowed")).rows[0].allowed,false);
  const projection = trafficProjection((await db.query("select session_id::text as session,test,traffic from journey_events where event='visit'")).rows);
  console.log(JSON.stringify({actualVisitProjection:projection}));
  await db.query('alter table journey_events rename to unavailable_journey');
  assert.equal((await send(observation)).status, 503, 'storage failure is not reported as reception');
  console.log(JSON.stringify({ localHttpReadback: true, rows: rows.length, legacyUnknownContext: 1,
    context: 1, pagePath: 1, scriptFlag: 1, interactionFlag: 1, country: 0, qa: 2 }));
});
