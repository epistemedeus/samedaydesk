import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import express from 'express';
import pg from 'pg';
import { startDisposablePg } from './fixtures/disposable-pg.mjs';
import pulseRouter from '../routes/pulse.js';
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
  await db.query(readFileSync(new URL('../../supabase/migrations/0024_journey_traffic.sql', import.meta.url), 'utf8'));
  const old = randomUUID();
  await recordCommerceJourney('visit', { sessionId: old, key: old });
  const app = express(); app.use(express.json({ limit: '2kb' })); app.use(commerceVisit);
  app.use('/api/pulse', pulseRouter);
  app.get('/traffic-browser.mjs',(_req,res)=>res.type('js').send(readFileSync(new URL('../../client/src/lib/traffic-browser.mjs',import.meta.url),'utf8')));
  app.get('/journey.js',(_req,res)=>res.type('js').send(stripTypeScriptTypes(readFileSync(new URL('../../client/src/lib/journey.ts',import.meta.url),'utf8'))));
  app.get('/browser',(_req,res)=>res.type('html').send('<button>Continue</button><script type="module">import {observePageTraffic} from "/journey.js"; observePageTraffic();</script>'));
  app.get('/pricing', (_req,res) => res.send('Pricing'));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  t.after(() => new Promise(r => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const initial = await fetch(base + '/pricing?email=private@example.test', { headers: { 'user-agent': 'Mozilla/5.0 actual-test' } });
  const cookie = initial.headers.get('set-cookie').split(';')[0];
  const send = (body, extra = {}) => fetch(base + '/api/pulse/journey', { method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 actual-test', cookie, ...extra }, body: JSON.stringify({ event: 'page_viewed', props: {path: '/pricing'}, traffic: body }) });
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
  await db.query(readFileSync(new URL('../../supabase/migrations/0025_journey_traffic_rpc.sql', import.meta.url), 'utf8'));
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
  const root = fileURLToPath(new URL('../..',import.meta.url));
  const runReader = () => execFileSync(process.execPath,['scripts/release/kit.mjs','demand','--traffic-only','--day',new Date().toISOString().slice(0,10)],{
    cwd:root,encoding:'utf8',env:{...process.env,DEMAND_DATABASE_URL:cluster.url,DEMAND_DATABASE_SCHEMA:'public'}});
  const readout=JSON.parse(runReader().trim());
  assert.equal(readout.status,'read'); assert.equal(readout.counts.own,3); assert(readout.pages.some(p=>p.path==='/pricing'));
  console.log(JSON.stringify({configuredDailyReader:readout}));
  if(process.env.TRAFFIC_BROWSER_PROBE==='1') {
    const kit=execFileSync(process.execPath,['scripts/release/kit.mjs','path'],{cwd:root,encoding:'utf8'}).trim().split('\n').at(-1);
    const require=createRequire(kit+'/package.json');const puppeteer=require('puppeteer-core');
    const browser=await puppeteer.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
    t.after(()=>browser.close());const page=await browser.newPage();
    const baseline=page.waitForResponse(r=>r.url().endsWith('/api/pulse/journey')&&r.status()===204);
    await page.goto(base+'/browser?discard=never#k=PRIVATE');await baseline;
    const cookie=(await page.cookies()).find(c=>c.name==='sds_session').value;
    const pointer=page.waitForResponse(r=>r.url().endsWith('/api/pulse/journey')&&r.status()===204);
    await page.click('button');await pointer;
    const actual=(await db.query("select traffic from journey_events where session_id=$1 and traffic->>'path'='/browser'",[cookie])).rows[0].traffic;
    assert.equal(actual.scriptRan,true);assert.equal(actual.interacted,true);assert.equal(actual.coarseClass,'headless');
    assert(!JSON.stringify(actual).includes('PRIVATE'));await browser.close();
    console.log(JSON.stringify({actualBrowser:true,firstInteractionStored:true,existingCookieReused:true}));
  }
  await db.query('alter table journey_events rename to unavailable_journey');
  assert.equal((await send(observation)).status, 503, 'storage failure is not reported as reception');
  console.log(JSON.stringify({ localHttpReadback: true, rows: rows.length, legacyUnknownContext: 1,
    context: 1, pagePath: 1, scriptFlag: 1, interactionFlag: 1, country: 0, qa: 2 }));
});
