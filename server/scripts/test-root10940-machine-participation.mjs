import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {machineHost} from './root10940-machine-host.mjs';
import {usefulEvidence} from '../../vendor/hosted-wallet-market/examples/participation-canary.mjs';
const exec=promisify(execFile);
const root=resolve(import.meta.dirname,'../..');

test('cold independent account roles complete voluntary delivery, requester decision and later byte use; adverse/recovery retain authority', {timeout:240000}, async()=>{
  const host=await machineHost();
  const directory=join(host.scratch,'cold-consumer');
  const client=process.env.ROOT10940_ACQUIRED_CLIENT || join(root,'vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs');
  const clientSha256=createHash('sha256').update(readFileSync(client)).digest('hex');
  const route=action=>'/api/neomorphic-contributor-journey/v1/market/'+action;
  const call=(role,action,body,id)=>host.request(route(action),{role,body,operationId:id});
  const value=r=>{assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.ok,true);return r.body.value.result;};
  let seq=0;
  const id=()=>`root10940-operation-${++seq}`;
  try {
    const before=await host.financialSnapshot();
    let capability=await host.boot();
    const contract=await host.request(route('participation-contract'),{method:'GET'});
    assert.equal(contract.status,200);assert.equal(contract.body.openapi,'3.1.0');
    assert.ok(contract.body.paths['/v1/market/deliverVoluntary'].post.requestBody);
    const {stdout}=await exec(process.execPath,['--max-old-space-size=256',join(root,'vendor/hosted-wallet-market/examples/participation-canary.mjs'),
      '--owner-qa','--origin',host.origin,'--directory',directory,'--namespace','root10940-owner-qa-disposable-cold',
      '--client',client,'--client-sha256',clientSha256,'--ca-file',host.caFile],{encoding:'utf8',timeout:150000,maxBuffer:1048576});
    const completed=JSON.parse(stdout);
    assert.equal(completed.withdrawn,true);assert.equal(completed.externalUse,false);assert.equal(completed.directBaselineSufficient,true);
    const requester=JSON.parse(readFileSync(join(directory,'requester.json'),'utf8'));
    const contributor=JSON.parse(readFileSync(join(directory,'contributor.json'),'utf8'));
    const later=JSON.parse(readFileSync(join(directory,'later.json'),'utf8'));
    const discover=await host.request(route('discover'),{method:'GET'});
    assert.deepEqual(discover.body.value.items,[],'both finite needs are withdrawn');
    assert.equal((await host.request(route('readVoluntary'),{body:{taskId:completed.taskId}})).status,401);
    assert.equal((await call(later,'readVoluntary',{taskId:completed.taskId})).status,403);
    const withdrawn=value(await call(requester,'readVoluntary',{taskId:completed.taskId}));
    assert.equal(withdrawn.evidence,null);
    const oldDelivery=contributor.operations.deliverVoluntary;
    const recovered=value(await call(contributor,'readbackVoluntary',{action:'deliverVoluntary',input:oldDelivery.body},oldDelivery.idempotencyKey));
    assert.equal(recovered.artifactDigest,completed.artifactDigest);assert.equal(recovered.evidence,undefined);
    const changed=await call(contributor,'readbackVoluntary',{action:'deliverVoluntary',input:{...oldDelivery.body,termsDigest:'0'.repeat(64)}},oldDelivery.idempotencyKey);
    assert.equal(changed.status,409);assert.equal(changed.body.code,'operation_conflict');

    const post={title:'Disposable recovery vector',summary:'Voluntary synthetic compatibility vector; no reward.',criteria:['preserve-mapping'],payableKinds:['usable']};
    const task=value(await call(requester,'post',post,id())).taskId;
    value(await call(contributor,'interest',{taskId:task,note:'Authorized synthetic volunteer evidence.'},id()));
    const source={sourceSha256:capability.sourceSha256,hostSha256:capability.hostSha256};
    const offer={taskId:task,contributorId:contributor.accountId,authorizedToRequest:true,
      rights:{license:'CC0-1.0',scope:'synthetic-or-authorized-reusable-artifact',attribution:'Synthetic owner QA'},...source};
    assert.equal((await call(requester,'offerVoluntary',{...offer,sourceSha256:'0'.repeat(64)},id())).body.code,'voluntary_source_changed');
    assert.equal((await call(requester,'offerVoluntary',{...offer,contributorId:requester.accountId},id())).body.code,'independent_role_required');
    let state=value(await call(requester,'offerVoluntary',offer,id()));
    const common=()=>({taskId:task,termsDigest:state.termsDigest,expectedRevision:state.revision,...source});
    const assent={...common(),authorizedToShare:true};
    assert.equal((await call(later,'assentVoluntary',assent,id())).status,403);
    assert.equal((await call(contributor,'assentVoluntary',{...assent,termsDigest:'f'.repeat(64)},id())).body.code,'voluntary_terms_changed');
    assert.equal((await call(contributor,'assentVoluntary',assent,id(),)).status,200);
    state=value(await call(requester,'readVoluntary',{taskId:task}));
    const raced=await call(contributor,'assentVoluntary',assent,id());
    assert.equal(raced.body.code,'voluntary_revision_changed','a stale second writer cannot take the assignment');
    assert.equal((await call(requester,'deliverVoluntary',{...common(),evidence:usefulEvidence()},id())).body.code,'contributor_required');
    assert.equal((await call(contributor,'deliverVoluntary',{...common(),evidence:{...usefulEvidence(),verificationReceipt:{passed:true}}},id())).status,409);
    assert.equal((await call(later,'exportVoluntary',{taskId:task})).status,403);
    const delivered={...common(),evidence:usefulEvidence()},deliveryId=id();
    writeFileSync(join(host.scratch,'lost-operation.json'),JSON.stringify({action:'deliverVoluntary',input:delivered,operationId:deliveryId}),{mode:0o600});
    host.fault.dropAction='deliverVoluntary';
    await assert.rejects(call(contributor,'deliverVoluntary',delivered,deliveryId));
    // Fresh application, same real PG and account/session keys; no repair SQL.
    capability=await host.boot();
    const readback=value(await call(contributor,'readbackVoluntary',{action:'deliverVoluntary',input:delivered},deliveryId));
    assert.equal(readback.state,'delivered');
    assert.deepEqual(value(await call(contributor,'deliverVoluntary',delivered,deliveryId)),readback);
    state=value(await call(requester,'readVoluntary',{taskId:task}));
    assert.deepEqual(state.evidence,usefulEvidence());
    assert.equal((await call(contributor,'reviewVoluntary',{...common(),artifactDigest:state.artifactDigest,accepted:true,exportAuthorized:true,reason:'Self claimed receipt'},id())).status,403);
    const quote=await call(requester,'quote',{taskId:task,contributorId:contributor.accountId,gross:'1',railCostCap:'0',expiresAt:new Date(Date.now()+60000).toISOString()},id());
    assert.equal(quote.body.code,'voluntary_task_cannot_be_funded');
    await host.boot({tenant:'root10940-other-tenant'});
    assert.equal((await call(requester,'readVoluntary',{taskId:task})).status,403,'valid account cannot cross the task tenant');
    await host.boot();
    const badCsrf=await host.request(route('withdrawVoluntary'),{role:contributor,body:{taskId:task,termsDigest:state.termsDigest,expectedRevision:state.revision,reason:'CSRF probe'},operationId:id(),headers:{'x-cj-csrf':'wrong'}});
    assert.equal(badCsrf.status,401);
    value(await call(contributor,'withdrawVoluntary',{taskId:task,termsDigest:state.termsDigest,expectedRevision:state.revision,reason:'Recovery QA complete'},id()));
    assert.equal((await call(contributor,'interest',{taskId:task,note:'No withdrawn work'},id())).body.code,'voluntary_withdrawn');
    await host.boot({participation:false});
    const profile=await host.request(route('profile'),{method:'GET'});
    assert.equal(profile.body.value.participation,undefined);
    assert.equal((await call(requester,'readVoluntary',{taskId:task})).body.code,'voluntary_unavailable');
    assert.equal((await host.request('/contribute/',{method:'GET'})).status,404);
    assert.deepEqual(await host.financialSnapshot(),before,'all seeded earned tasks/terms and owed records are unchanged');
    assert.ok(host.rpcMethods.every(x=>['eth_chainId','eth_blockNumber','eth_call'].includes(x)),'no financial RPC');
  }finally {await host.close();}
});
