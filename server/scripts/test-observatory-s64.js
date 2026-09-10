import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createObservatoryRouter } from '../routes/observatory.js';
import { createObservatoryRuntime, listSources } from '../lib/observatory/registry.js';
import { createBoundedFetcher } from '../lib/observatory/bounded-fetch.js';
import { observe as x402 } from '../lib/observatory/adapters/x402stats.js';
import { createHttpRegistry, collectObservations, writeCapture, loadCapture, compareCaptures } from './observatory-capture.mjs';
const Ajv = createRequire(new URL('../../client/package.json', import.meta.url))('ajv');
const validate = new Ajv({ allErrors: true }).compile(JSON.parse(readFileSync(new URL('../lib/observatory/observation.schema.json', import.meta.url))));
const at='2026-09-10T01:00:00.000Z';
const bodies={moltjobs:{totalJobs:12,totalCompleted:4,totalAgents:18,totalVolumeUsdc:'1.5',escrowedUsdc:'0.5'},x402stats:{snapshot:{sellers:2,volumeUsd:'1.5',organicSellers:1,organicVolumeUsd:'0.5',avgPaymentUsd:0.5,medianSellerRevenueUsd:0.5,top10VolumeShare:0.8,windowDays:30,computedAt:at}},smithery_mcp:{pagination:{totalCount:12345},servers:[{id:'fixture-only',qualifiedName:'fixture/tool',description:'x'.repeat(6000)}]}};
function runtime(options={}) {return createObservatoryRuntime({now:()=>Date.parse(at),fetchImpl:async url=>{const d=listSources().find(d=>d.upstreamUrl===String(url));assert.ok(d);return new Response(JSON.stringify(bodies[d.sourceId]));},...options});}
function valid(body){assert.equal(validate(body),true,JSON.stringify(validate.errors));}
test('S64 actual mounted HTTP envelopes validate, preserve status/CORS and capture roundtrip',async t=>{
 const app=express();app.use('/api/observatory',createObservatoryRouter({runtime:runtime()}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());
 const base=`http://127.0.0.1:${server.address().port}`;
 const response=await fetch(base+'/api/observatory/snapshot',{headers:{Origin:'https://neomorphic.io'}});
 assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),'https://neomorphic.io');assert.equal(response.headers.get('cache-control'),'no-store');
 const snapshot=await response.json();valid(snapshot);snapshot.observations.forEach(valid);
 const smithery=snapshot.observations.find(x=>x.sourceId==='smithery_mcp');assert.equal(smithery.metrics[0].value,12345);assert.equal(JSON.parse(smithery.rawExcerpt).servers.length,1);
 const missing=await fetch(base+'/api/observatory/sources/unknown',{headers:{Origin:'https://neomorphic.io'}});assert.equal(missing.status,404);assert.equal(missing.headers.get('access-control-allow-origin'),'https://neomorphic.io');
 const denied=await fetch(base+'/api/observatory/snapshot',{method:'OPTIONS',headers:{Origin:'https://invalid.example'}});assert.equal(denied.status,403);assert.equal(denied.headers.get('access-control-allow-origin'),null);
 const client=createHttpRegistry(base);valid(await (await fetch(base+'/api/observatory/sources')).json());
 const observations=await collectObservations(client,{fetchedAt:at});const dir=mkdtempSync(join(tmpdir(),'s64-roundtrip-'));
 const cliDir=join(dir,'cli');
 const command=fileURLToPath(new URL('./observatory-capture.mjs',import.meta.url));
 const captured=await promisify(execFile)(process.execPath,[command,'capture','--base',base,'--out',cliDir,'--label','fixture']);
 const result=JSON.parse(captured.stdout);assert.equal(result.sources.length,3);
 const deltaRun=await promisify(execFile)(process.execPath,[command,'delta','--a',result.dir,'--b',result.dir]);
 assert.equal(JSON.parse(deltaRun.stdout).continuity.invented,false);
 await assert.rejects(promisify(execFile)(process.execPath,[command,'delta','--a',result.dir,'--b',result.dir,'--out',join(result.dir,'moltjobs.json')]),error=>error.code===1 && /EEXIST/.test(error.stderr));
 const a=await writeCapture(dir,observations,{now:at,label:'fixture'});const b=await writeCapture(dir,observations,{now:'2026-09-10T01:01:00.000Z',label:'fixture'});
 assert.equal(compareCaptures(loadCapture(a.dir),loadCapture(b.dir)).continuity.invented,false);
 await assert.rejects(writeCapture(dir,observations,{now:at}),{code:'EEXIST'});
 const file=join(a.dir,'moltjobs.json');writeFileSync(file,readFileSync(file,'utf8')+' ');assert.throws(()=>loadCapture(a.dir),{code:'capture_changed'});
 if(process.env.S64_NEO_OVERLAY){const neo=await import(process.env.S64_NEO_OVERLAY+'/public/labs/agent-economy-observatory/envelope.js');assert.equal(neo.buildConsumerExample(neo.parseSnapshot(snapshot)).chosen.id,'fixture-only');}
});
test('S64 all error/partial/empty/non-200 returns satisfy schema without false zero',async()=>{
 for(const [status,body]of [[200,{}],[200,{snapshot:{sellers:0}}],[206,bodies.x402stats],[429,{}],[500,{}]]){
  const snap=await runtime({fetchImpl:async()=>new Response(JSON.stringify(body),{status})}).observeAll();valid(snap);
  if(status!==200)assert.ok(snap.observations.every(o=>o.metrics.every(m=>m.value===null)));
 }
 const wrong=structuredClone(await runtime().observe('smithery_mcp'));delete wrong.metrics[0].population;assert.equal(validate(wrong),false);
});
test('S64 unknown/changed window and ratio cannot imply 30 days or valid share',()=>{
 for(const windowDays of [undefined,0,7]){
  const body=structuredClone(bodies.x402stats);body.snapshot.windowDays=windowDays;body.snapshot.top10VolumeShare=2;
  const o=x402({body,httpStatus:200,fetchedAt:at});assert.equal(o.metrics[0].window,windowDays===7?'7d':null);assert.equal(o.metrics.find(m=>m.unit==='ratio').value,null);assert.equal(o.availability,'partial');valid(o);
 }
});
test('S64 fixed upstream redirect and error cache replace last good data',async()=>{
 let calls=0,time=0;const f=createBoundedFetcher({now:()=>time,cacheTtlMs:10,fetchImpl:async()=>{calls++;return calls===1?new Response('{}'):new Response('',{status:302,headers:{location:'/other-path'}});}});
 await f.getCapture('x','https://example.test/api/stats');time=11;const failed=await f.getCapture('x','https://example.test/api/stats');assert.equal(failed.error.code,'off_path_redirect');assert.equal(failed.body,null);assert.equal(calls,2);assert.equal((await f.getCapture('x','https://example.test/api/stats')).cache.hit,true);assert.equal(calls,2);
});
test('S64 capture identity and bounded nonretrying HTTP errors',async()=>{
 const listed=listSources();const r=runtime();const o=await r.observe('moltjobs');
 await assert.rejects(collectObservations({listSources:()=>[listed[0]],observeAll:()=>[{...o,sourceId:'smithery_mcp'}]}),{code:'source_identity_changed'});
 const absent=await collectObservations({listSources:()=>listed,observeAll:()=>[o]});assert.equal(absent[1].availability,'error');
 let calls=0;const c=createHttpRegistry('https://fixture.invalid',{fetchImpl:async()=>{calls++;return new Response('{}',{status:429});}});await assert.rejects(c.observeAll(),{code:'http_error'});assert.equal(calls,1);
 const big=createHttpRegistry('https://fixture.invalid',{maxBytes:8,fetchImpl:async()=>new Response('123456789')});await assert.rejects(big.observe('moltjobs'),{code:'oversized_body'});
 const timeout=createHttpRegistry('https://fixture.invalid',{timeoutMs:5,fetchImpl:(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('fixture aborted'))))});await assert.rejects(timeout.observe('moltjobs'),/fixture aborted/);
 const dir=mkdtempSync(join(tmpdir(),'s64-identity-'));const a=await writeCapture(dir,[o],{captureId:'a'});const b=await writeCapture(dir,[{...o,upstreamUrl:'https://changed.invalid',metrics:o.metrics.map(m=>({...m,value:m.state==='ok'?2:null}))}],{captureId:'b'});
 const delta=compareCaptures(loadCapture(a.dir),loadCapture(b.dir));assert.equal(delta.sources[0].status,'source_identity_changed');assert.ok(delta.sources[0].metrics.changed.every(m=>!m.comparable));
 const manifest=JSON.parse(readFileSync(join(b.dir,'manifest.json')));manifest.sources[0].file='../a/moltjobs.json';writeFileSync(join(b.dir,'manifest.json'),JSON.stringify(manifest));assert.throws(()=>loadCapture(b.dir),{code:'invalid_capture'});
});
