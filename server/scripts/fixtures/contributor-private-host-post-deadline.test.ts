import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {request as httpsRequest} from 'node:https';
import {checkServerIdentity} from 'node:tls';
import {createServer} from 'node:http';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import {disposablePostgres,key,productRoot,pg,OWNER,ADMIN} from './helpers.js';

const run=promisify(execFile);
const roundKey='agent-opportunity-221400-v1';
const historicalDeadline='2026-10-19T23:59:59Z';
const afterDeadline='2026-10-20T00:00:00.000Z';
const originalOwner='oc230100-synthetic-original-owner-not-live';

test('post-deadline historical round stays closed without fixture or payment changes',async()=>{
  const fixturePath=path.join(productRoot,'services/earned-work/fixtures/opportunity/agent-opportunity-221400-v1.round.json');
  const fixtureBytes=await readFile(fixturePath);
  const fixtureHash=createHash('sha256').update(fixtureBytes).digest('hex');
  const source=JSON.parse(fixtureBytes.toString('utf8'));
  assert.equal(source.submissionDeadline,historicalDeadline);
  const sdsRoot=process.env.CONTRIBUTOR_JOURNEY_TEST_SDS_ROOT;
  assert.ok(sdsRoot&&path.isAbsolute(sdsRoot),'isolated SDS checkout required');
  const ensurePath=path.join(sdsRoot,'vendor/neomorphic-contributor-journey/services/contributor-journey/dist/runtime/services/earned-work/src/opportunity/service.js');
  const ensureHash=createHash('sha256').update(await readFile(ensurePath)).digest('hex');
  const postgres=await disposablePostgres();
  const directory=await mkdtemp(path.join(tmpdir(),'cj-post-deadline-'));
  try{
    const portServer=createServer();
    await new Promise<void>(resolve=>portServer.listen(0,'127.0.0.1',resolve));
    const port=(portServer.address() as any).port;
    await new Promise<void>(resolve=>portServer.close(()=>resolve()));
    const certFile=path.join(directory,key('cert')+'.pem'),keyFile=path.join(directory,key('key')+'.pem');
    await run('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1','-keyout',keyFile,'-out',certFile],{timeout:10000});
    const origin=`https://127.0.0.1:${port}`,db=await postgres.database(),originalDb=await postgres.database();
    const settings={env:{CONTRIBUTOR_JOURNEY_MODE:'staging',CONTRIBUTOR_JOURNEY_INSTALLED:'1',CONTRIBUTOR_JOURNEY_DATABASE_URL:db,
      CONTRIBUTOR_JOURNEY_OWNER_TOKEN:OWNER,CONTRIBUTOR_JOURNEY_CORRESPONDENCE_ADMIN_TOKEN:ADMIN,CONTRIBUTOR_JOURNEY_PREVIEW_ORIGIN:origin,
      CONTRIBUTOR_JOURNEY_REPLAY_KEY:randomBytes(32).toString('hex'),CONTRIBUTOR_JOURNEY_INTEGRITY_KEY:randomBytes(32).toString('hex'),CONTRIBUTOR_JOURNEY_CURSOR_KEY:randomBytes(32).toString('hex'),
      CONTRIBUTOR_JOURNEY_FUTURE_ROUNDS:JSON.stringify([{roundKey:key('future'),provenance:'test'}]),CONTRIBUTOR_JOURNEY_RATE_LIMIT_MAX:'10000'},
      originalEnv:{NEOMORPHIC_OPPORTUNITY_DATABASE_URL:originalDb,NEOMORPHIC_OPPORTUNITY_OWNER_TOKEN:originalOwner,EARNED_WORK_RATE_LIMIT_MAX:'10000'},
      port,origin,roundKey,certFile,keyFile,asOf:afterDeadline};
    const hostModule=await import(pathToFileURL(path.join(sdsRoot,'server/scripts/fixtures/original-continuation-host.mjs')).href);
    const host=await hostModule.originalContinuationHost(settings);
    try{
      const ca=await readFile(certFile);
      const request=(route:string,body:any,idem:string)=>new Promise<any>((resolve,reject)=>{
        const data=JSON.stringify(body);
        const headers:any={authorization:`Bearer ${originalOwner}`,origin,'idempotency-key':idem,'content-type':'application/json','content-length':Buffer.byteLength(data)};
        const req=httpsRequest(origin+route,{method:'POST',headers,ca,timeout:10000,checkServerIdentity:(_host,cert)=>checkServerIdentity('127.0.0.1',cert)},res=>{
          let text='';res.setEncoding('utf8');res.on('data',value=>text+=value);res.on('end',()=>{let parsed=null;try{parsed=JSON.parse(text);}catch{parsed=null;}resolve({status:res.statusCode,body:parsed,text});});
        });
        req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('request deadline')));req.end(data);
      });
      const created=await request('/api/neomorphic-opportunity/v1/opportunity-rounds',source,key('round'));
      assert.equal(created.status,201,created.text);
      const imported=await request(`/api/neomorphic-opportunity/v1/opportunity-rounds/${roundKey}/imports`,{
        provenance:'fixture',offerKey:'discovery-trace',publicLabel:'Synthetic holder',importKey:key('import-id'),credentialRef:'fixture:'+key('synthetic-holder')},key('import'));
      assert.equal(imported.status,409,imported.text);
      assert.equal(imported.body?.error?.code,'round_closed');
      const client=new pg.Client({connectionString:originalDb,options:'-c search_path=neo_opportunity_221400'});
      await client.connect();
      try{
        const row=await client.query('SELECT status, submission_deadline FROM opportunity_rounds WHERE round_key=$1',[roundKey]);
        assert.equal(row.rows.length,1);
        assert.equal(row.rows[0].status,'open');
        assert.equal(new Date(row.rows[0].submission_deadline).toISOString(),new Date(historicalDeadline).toISOString());
        assert.equal((await client.query('SELECT count(*)::int AS n FROM opportunity_claims')).rows[0].n,0);
        assert.equal((await client.query('SELECT count(*)::int AS n FROM opportunity_obligations')).rows[0].n,0);
      }finally{await client.end();}
    }finally{await host.close();}
  }finally{
    await postgres.close();
    await rm(directory,{recursive:true,force:true});
    assert.equal(createHash('sha256').update(await readFile(fixturePath)).digest('hex'),fixtureHash);
    assert.equal(createHash('sha256').update(await readFile(ensurePath)).digest('hex'),ensureHash);
  }
});
