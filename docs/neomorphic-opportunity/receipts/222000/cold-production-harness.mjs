import assert from 'node:assert/strict';import test from 'node:test';import {spawn} from 'node:child_process';import {once} from 'node:events';import {existsSync,readFileSync} from 'node:fs';import http from 'node:http';
const root='/tmp/opportunity-consumer-222000/cold-host';const prefix='/api/neomorphic-opportunity';const round='synthetic-cold-production-222000';const owner='synthetic-cold-owner-222000';const target={origin:'https://samedaydesk.com',prefix,roundKey:round};
const fixture=JSON.parse(readFileSync(root+'/vendor/neomorphic-opportunity/services/earned-work/fixtures/opportunity/agent-opportunity-221400-v1.round.json','utf8'));
function request(port,path,body){return new Promise((resolve,reject)=>{const r=http.request({hostname:'127.0.0.1',port,path,method:body?'POST':'GET',headers:body?{'content-type':'application/json',authorization:`Bearer ${owner}`,'idempotency-key':'synthetic-cold-create-222000'}:{}},res=>{let s='';res.on('data',b=>s+=b);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(s)}));});r.on('error',reject);r.end(body?JSON.stringify(body):undefined);});}
test('cold production direct Node and CommonJS loaders retain an admitted round with no Git or dev dependencies', {timeout:20000}, async()=>{
 assert.equal(existsSync(root+'/.git'),false);assert.equal(existsSync(root+'/node_modules/tsx'),false);assert.equal(existsSync(root+'/vendor/neomorphic-opportunity/services/earned-work/node_modules'),false);
 for(const [i,args] of [[0,['server/index.js']],[1,['--eval','require("./server/index.js")']]]){
  const c=spawn(process.execPath,['--import',root+'/server/scripts/fixtures/hosted-startup-preload.mjs',...args],{cwd:root,env:{PATH:process.env.PATH,NODE_ENV:'production',PORT:'0',NEOMORPHIC_OPPORTUNITY_DATABASE_URL:'postgres://ubuntu@127.0.0.1:55440/opportunity_consumer_222000',NEOMORPHIC_OPPORTUNITY_OWNER_TOKEN:owner,NEOMORPHIC_OPPORTUNITY_HOSTED_ORIGIN:target.origin,NEOMORPHIC_OPPORTUNITY_HOSTED_PREFIX:prefix,NEOMORPHIC_OPPORTUNITY_HOSTED_ROUND_KEY:round,NEOMORPHIC_OPPORTUNITY_HOSTED_ADMISSION:JSON.stringify(target)},stdio:['ignore','pipe','pipe','ipc']});
  let err='';c.stderr.on('data',b=>err+=b);c.stdout.resume();
  try{
   const m=await Promise.race([once(c,'message').then(([m])=>m),once(c,'exit').then(([code])=>{throw Error(`cold exit ${code}: ${err}`);})]);
   assert.equal((await request(m.port,'/api/health')).status,200);assert.equal((await request(m.port,prefix+'/healthz')).body.enabled,true);
   if(i===0) assert.equal((await request(m.port,prefix+'/v1/opportunity-rounds',{...fixture,roundKey:round,provenance:'test',productionAdmission:false})).status,201);
   const read=await request(m.port,prefix+'/v1/opportunity-rounds/'+round+'?provenance=test');assert.equal(read.status,200);assert.equal(read.body.hostedDelivery.configuration,'hosted');assert.equal(read.body.hostedDelivery.roundReadPath,target.origin+prefix+'/v1/opportunity-rounds/'+round);assert.equal(read.body.hostedDelivery.grantsDelivered,false);assert.equal(read.body.hostedDelivery.settlementAutomatic,false);assert.equal(read.body.hostedDelivery.publicPaidCapacity,0);
  }finally{if(c.exitCode===null){const done=once(c,'exit');const start=Date.now();c.kill('SIGTERM');const [code]=await done;assert.equal(code,0);assert.ok(Date.now()-start<4000);}}
 }
});
