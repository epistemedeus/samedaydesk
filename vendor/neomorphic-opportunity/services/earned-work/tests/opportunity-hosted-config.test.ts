import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { OWNER_TOKEN, databaseUrl, uniqueSchema, dropSchema, json, key } from './helpers.js';
import { loadConfig } from '../src/config.js';
const fixture = JSON.parse(readFileSync(new URL('../fixtures/opportunity/agent-opportunity-221400-v1.round.json',import.meta.url),'utf8'));
const current = {origin:'https://samedaydesk.com',prefix:'/api/neomorphic-opportunity',roundKey:'agent-opportunity-221400-v1'};
const second = {origin:'https://retained.synthetic.invalid',prefix:'/evidence/opportunities',roundKey:'synthetic-round-222000'};
const hostedEnv = (target: typeof current, admission: typeof current) => ({
 EARNED_WORK_HOSTED_ORIGIN:target.origin,EARNED_WORK_HOSTED_PREFIX:target.prefix,EARNED_WORK_HOSTED_ROUND_KEY:target.roundKey,EARNED_WORK_HOSTED_ADMISSION:JSON.stringify(admission),
});
test('owner service config accepts both admitted targets and refuses an unadmitted mismatch',()=>{
 const base={EARNED_WORK_OWNER_TOKEN:OWNER_TOKEN,EARNED_WORK_DATABASE_URL:databaseUrl()};
 for(const target of [current,second]) assert.equal(loadConfig({...base,...hostedEnv(target,target)}).hostedDelivery.configuration,'hosted');
 const p=loadConfig({...base,...hostedEnv(second,current)}).hostedDelivery;
 assert.equal(p.deliveryState,'unconfigured');assert.equal(p.roundReadPath,null);
 assert.equal(JSON.stringify(p).includes('synthetic.invalid'),false);
});
test('independent retained HTTP processes project each admitted target only for its requested round', {timeout:30000}, async()=>{
 for(const target of [current,second]) {
  const schema=uniqueSchema();
  const env={PATH:process.env.PATH,EARNED_WORK_DATABASE_URL:databaseUrl(),EARNED_WORK_OWNER_TOKEN:OWNER_TOKEN,EARNED_WORK_PG_SCHEMA:schema,RECEIVING_USE_OWNER_CONFIG:'1',...hostedEnv(target,target)};
  async function start(){
   const child=spawn(process.execPath,['--import','tsx',new URL('./opportunity-process-fixture.mjs',import.meta.url).pathname],{env,stdio:['ignore','pipe','pipe','ipc']});
   let err='';child.stderr.on('data',chunk=>err+=chunk);
   const ready=await Promise.race([once(child,'message').then(([m])=>m),once(child,'exit').then(([code])=>{throw Error(`synthetic service exit ${code}: ${err}`);})]);
   return {child,baseUrl:ready.baseUrl};
  }
  async function stop(child: ReturnType<typeof spawn>){const done=once(child,'exit');child.kill('SIGTERM');const [code]=await done;assert.equal(code,0);}
  let running=await start();
  try {
   for(const roundKey of [target.roundKey,'synthetic-other-round']) {
    const created=await json(running.baseUrl,'/v1/opportunity-rounds',{method:'POST',token:OWNER_TOKEN,idempotencyKey:key('round'),body:JSON.stringify({...fixture,roundKey,provenance:'test',productionAdmission:false})});
    assert.equal(created.status,201,JSON.stringify(created.body));
   }
   await stop(running.child);running=await start();
   const read=await json(running.baseUrl,`/v1/opportunity-rounds/${target.roundKey}?provenance=test`);
   assert.equal(read.status,200);const body=read.body as any;
   assert.equal(body.hostedDelivery.roundReadPath,`${target.origin}${target.prefix}/v1/opportunity-rounds/${target.roundKey}`);
   assert.equal(body.hostedDelivery.configuration,'hosted');assert.equal(body.hostedDelivery.publicPaidCapacity,0);
   assert.equal(body.hostedDelivery.grantsDelivered,false);assert.equal(body.hostedDelivery.settlementAutomatic,false);
   assert.equal(body.offers.every((o:any)=>o.publicRemainingSlots===0),true);
   const other=await json(running.baseUrl,'/v1/opportunity-rounds/synthetic-other-round?provenance=test');
   assert.equal((other.body as any).hostedDelivery.configuration,'out_of_scope');
   assert.equal((other.body as any).hostedDelivery.roundReadPath,null);
  } finally {await stop(running.child);await dropSchema(schema);}
 }
});
