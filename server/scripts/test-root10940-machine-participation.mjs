import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {machineHost} from './root10940-machine-host.mjs';
import {usefulEvidence} from '../../vendor/hosted-wallet-market/examples/participation-canary.mjs';
import {digest} from '../../vendor/hosted-wallet-market/runtime/agent-economy-foundation/dist/index.js';
const exec=promisify(execFile);
const root=resolve(import.meta.dirname,'../..');

test('cold independent account roles complete voluntary delivery, requester decision and later byte use; adverse/recovery retain authority', {timeout:300000}, async()=>{
  const anchorPath=process.env.ROOT10940_TRUST_ANCHOR;
  const client=process.env.ROOT10940_ACQUIRED_CLIENT;
  const descriptor=process.env.ROOT10940_ACQUISITION_DESCRIPTOR;
  assert.equal(typeof anchorPath,'string','ROOT10940_TRUST_ANCHOR is the independent pin');
  assert.equal(typeof client,'string','ROOT10940_ACQUIRED_CLIENT is the emitted client');
  assert.equal(typeof descriptor,'string','ROOT10940_ACQUISITION_DESCRIPTOR is the emitted descriptor');
  const anchor=JSON.parse(readFileSync(anchorPath,'utf8'));
  assert.equal(anchor.schema,'pilot.root10940.acquisition-trust-anchor.v1');
  const clientBytes=readFileSync(client);
  const descriptorBytes=readFileSync(descriptor);
  assert.equal(clientBytes.length,anchor.clientBytes);
  assert.equal(createHash('sha256').update(clientBytes).digest('hex'),anchor.clientSha256);
  assert.equal(createHash('sha256').update(descriptorBytes).digest('hex'),anchor.descriptorSha256);
  const pinned=JSON.parse(descriptorBytes.toString('utf8'));
  assert.equal(pinned.sha256,anchor.clientSha256);
  assert.equal(pinned.bytes,anchor.clientBytes);
  assert.deepEqual(pinned.source,anchor.source);
  assert.deepEqual(pinned.requiredProfile,anchor.requiredProfile);
  const host=await machineHost();
  const directory=join(host.scratch,'cold-consumer');
  const route=action=>'/api/neomorphic-contributor-journey/v1/market/'+action;
  const call=(role,action,body,id)=>host.request(route(action),{role,body,operationId:id});
  const value=r=>{assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.ok,true);return r.body.value.result;};
  let seq=0;
  const id=()=>`root10940-operation-${++seq}`;
  const accounts=async()=>Number((await host.query('SELECT count(*)::int AS n FROM cj227_earned_work.journey_accounts')).rows[0].n);
  async function cold(file,args){
    try {
      const {stdout}=await exec(process.execPath,['--max-old-space-size=256',file,...args],{encoding:'utf8',timeout:20000,maxBuffer:1024*1024,env:{...process.env,UV_THREADPOOL_SIZE:'1',OMP_NUM_THREADS:'1'}});
      return {status:0,body:JSON.parse(stdout)};
    } catch (error) {
      return {status:error.status??1,body:JSON.parse(error.stdout||'{}')};
    }
  }
  const sourceFlags=['--source-repository',anchor.source.repository,'--source-commit',anchor.source.commit,'--source-path',anchor.source.path];
  try {
    const beforeAccounts=await accounts();
    await host.boot({participation:false});
    const before=await host.financialSnapshot();
    const absentSecret=join(host.scratch,'absent-capability.json');
    const absent=await cold(client,['signup','--origin',host.origin,'--ca-file',host.caFile,'--descriptor',descriptor,
      '--descriptor-sha256',anchor.descriptorSha256,...sourceFlags,'--secret-file',absentSecret,
      '--display-name','root10940-owner-qa-absent','--role','requester']);
    assert.equal(absent.status,1);
    assert.equal(absent.body.code,'acquisition_profile_mismatch');
    assert.equal(existsSync(absentSecret),false);
    assert.equal(await accounts(),beforeAccounts,'refused acquisition creates no account');
    let capability=await host.boot();
    assert.equal(capability.sourceSha256,anchor.requiredProfile.sourceSha256);
    assert.equal(capability.hostSha256,anchor.requiredProfile.hostSha256);
    const wrongRepo=await cold(client,['acquire','--origin',host.origin,'--ca-file',host.caFile,'--descriptor',descriptor,
      '--descriptor-sha256',anchor.descriptorSha256,'--source-repository','example/other','--source-commit',anchor.source.commit,'--source-path',anchor.source.path]);
    assert.equal(wrongRepo.body.code,'acquisition_source_mismatch');
    const wrongCommit=await cold(client,['acquire','--origin',host.origin,'--ca-file',host.caFile,'--descriptor',descriptor,
      '--descriptor-sha256',anchor.descriptorSha256,'--source-repository',anchor.source.repository,'--source-commit','a'.repeat(40),'--source-path',anchor.source.path]);
    assert.equal(wrongCommit.body.code,'acquisition_source_mismatch');
    const wrongPath=await cold(client,['acquire','--origin',host.origin,'--ca-file',host.caFile,'--descriptor',descriptor,
      '--descriptor-sha256',anchor.descriptorSha256,'--source-repository',anchor.source.repository,'--source-commit',anchor.source.commit,'--source-path','client/other.mjs']);
    assert.equal(wrongPath.body.code,'acquisition_source_mismatch');
    const flipped=Buffer.from(descriptorBytes);flipped[10]^=1;
    const flippedPath=join(host.scratch,'flipped-descriptor.json');
    writeFileSync(flippedPath,flipped);
    const descriptorMismatch=await cold(client,['acquire','--origin',host.origin,'--descriptor',flippedPath,
      '--descriptor-sha256',anchor.descriptorSha256,...sourceFlags]);
    assert.equal(descriptorMismatch.body.code,'acquisition_descriptor_mismatch');
    const mutant=Buffer.from(clientBytes);
    const at=mutant.indexOf('HTTPS client');
    assert.ok(at>0);
    mutant[at]^=1;
    const mutantPath=join(host.scratch,'mutant-client.mjs');
    writeFileSync(mutantPath,mutant);
    assert.notEqual(createHash('sha256').update(mutant).digest('hex'),anchor.clientSha256);
    const clientMismatch=await cold(mutantPath,['acquire','--origin',host.origin,'--ca-file',host.caFile,'--descriptor',descriptor,
      '--descriptor-sha256',anchor.descriptorSha256,...sourceFlags]);
    assert.equal(clientMismatch.body.code,'acquisition_client_mismatch');
    const wrongLive=structuredClone(pinned);
    wrongLive.requiredProfile={...pinned.requiredProfile,sourceSha256:'0'.repeat(64)};
    const wrongLivePath=join(host.scratch,'wrong-live-descriptor.json');
    writeFileSync(wrongLivePath,JSON.stringify(wrongLive));
    const wrongLiveHash=createHash('sha256').update(readFileSync(wrongLivePath)).digest('hex');
    const wrongLiveSecret=join(host.scratch,'wrong-live.json');
    const profileMismatch=await cold(client,['signup','--origin',host.origin,'--ca-file',host.caFile,'--descriptor',wrongLivePath,
      '--descriptor-sha256',wrongLiveHash,...sourceFlags,'--secret-file',wrongLiveSecret,
      '--display-name','root10940-owner-qa-wrong-live','--role','requester']);
    assert.equal(profileMismatch.body.code,'acquisition_profile_mismatch');
    assert.equal(existsSync(wrongLiveSecret),false);
    assert.equal(await accounts(),beforeAccounts);
    const contract=await host.request(route('participation-contract'),{method:'GET'});
    assert.equal(contract.status,200);assert.equal(contract.body.openapi,'3.1.0');
    assert.ok(contract.body.paths['/v1/market/deliverVoluntary'].post.requestBody);
    const ajv=new Ajv2020({strict:false,allErrors:true});
    addFormats(ajv);
    const responseSchema=(operation,status)=>{
      const schema=structuredClone(contract.body.paths[operation].post.responses[String(status)].content['application/json'].schema);
      schema.components=contract.body.components;
      return ajv.compile(schema);
    };
    const requestSchema=operation=>{
      const schema=structuredClone(contract.body.paths[operation].post.requestBody.content['application/json'].schema);
      schema.components=contract.body.components;
      return ajv.compile(schema);
    };
    const {stdout}=await exec(process.execPath,['--max-old-space-size=256',join(root,'vendor/hosted-wallet-market/examples/participation-canary.mjs'),
      '--owner-qa','--origin',host.origin,'--directory',directory,'--namespace','root10940-owner-qa-disposable-cold',
      '--client',client,'--client-sha256',anchor.clientSha256,'--descriptor',descriptor,'--descriptor-sha256',anchor.descriptorSha256,
      ...sourceFlags,'--ca-file',host.caFile],{encoding:'utf8',timeout:150000,maxBuffer:1048576});
    const completed=JSON.parse(stdout);
    assert.equal(completed.withdrawn,true);assert.equal(completed.externalUse,false);assert.equal(completed.directBaselineSufficient,true);
    assert.equal(completed.descriptorSha256,anchor.descriptorSha256);
    assert.equal(completed.clientSha256,anchor.clientSha256);
    assert.match(completed.inspectedSpecDigest,/^[a-f0-9]{64}$/);
    const exportSchema=structuredClone(contract.body.components.schemas.Export);
    exportSchema.components=contract.body.components;
    const validateExport=ajv.compile(exportSchema);
    const exportedFile=JSON.parse(readFileSync(join(directory,'later-export.json'),'utf8'));
    assert.equal(validateExport(exportedFile),true,JSON.stringify(validateExport.errors));
    const requester=JSON.parse(readFileSync(join(directory,'requester.json'),'utf8'));
    const contributor=JSON.parse(readFileSync(join(directory,'contributor.json'),'utf8'));
    const later=JSON.parse(readFileSync(join(directory,'later.json'),'utf8'));
    assert.equal(requester.acquisition.schema,'pilot.machine-participation.acquired-binding.v1');
    assert.equal(requester.acquisition.clientSha256,anchor.clientSha256);
    assert.equal(requester.acquisition.descriptorSha256,anchor.descriptorSha256);
    assert.equal(requester.acquisition.sourceSha256,anchor.requiredProfile.sourceSha256);
    assert.equal(requester.acquisition.hostSha256,anchor.requiredProfile.hostSha256);
    const discover=await host.request(route('discover'),{method:'GET'});
    assert.deepEqual(discover.body.value.items,[],'both finite needs are withdrawn');
    assert.equal((await host.request(route('readVoluntary'),{body:{taskId:completed.taskId}})).status,401);
    assert.equal((await call(later,'readVoluntary',{taskId:completed.taskId})).status,403);
    const withdrawn=value(await call(requester,'readVoluntary',{taskId:completed.taskId}));
    assert.equal(withdrawn.evidence,null);
    assert.equal(responseSchema('/v1/market/readVoluntary','200')((await call(requester,'readVoluntary',{taskId:completed.taskId})).body),true);
    const oldDelivery=contributor.operations.deliverVoluntary;
    const recovered=value(await call(contributor,'readbackVoluntary',{action:'deliverVoluntary',input:oldDelivery.body},oldDelivery.idempotencyKey));
    assert.equal(recovered.artifactDigest,completed.artifactDigest);assert.equal(recovered.evidence,undefined);
    const changed=await call(contributor,'readbackVoluntary',{action:'deliverVoluntary',input:{...oldDelivery.body,termsDigest:'0'.repeat(64)}},oldDelivery.idempotencyKey);
    assert.equal(changed.status,409);assert.equal(changed.body.code,'operation_conflict');
    assert.equal(responseSchema('/v1/market/readbackVoluntary','409')(changed.body),true);

    const post={title:'Disposable recovery vector',summary:'Voluntary synthetic compatibility vector; no reward.',criteria:['preserve-mapping'],payableKinds:['usable']};
    const task=value(await call(requester,'post',post,id())).taskId;
    value(await call(contributor,'interest',{taskId:task,note:'Authorized synthetic volunteer evidence.'},id()));
    const source={sourceSha256:capability.sourceSha256,hostSha256:capability.hostSha256};
    const offer={taskId:task,contributorId:contributor.accountId,authorizedToRequest:true,
      rights:{license:'CC0-1.0',scope:'synthetic-or-authorized-reusable-artifact',attribution:'Synthetic owner QA'},...source};
    assert.equal(requestSchema('/v1/market/offerVoluntary')(offer),true);
    assert.equal((await call(requester,'offerVoluntary',{...offer,sourceSha256:'0'.repeat(64)},id())).body.code,'voluntary_source_changed');
    assert.equal((await call(requester,'offerVoluntary',{...offer,contributorId:requester.accountId},id())).body.code,'independent_role_required');
    let state=value(await call(requester,'offerVoluntary',offer,id()));
    const viewed=value(await call(contributor,'readVoluntary',{taskId:task}));
    assert.equal(digest(viewed.spec),viewed.terms.specDigest);
    assert.equal(viewed.spec.title,post.title);
    assert.equal(viewed.spec.summary,post.summary);
    assert.deepEqual(viewed.spec.criteria,post.criteria);
    assert.deepEqual(viewed.spec.payableKinds,post.payableKinds);
    assert.equal(viewed.spec.slotLimit,1);
    assert.equal(viewed.spec.milestoneLimit,1);
    assert.equal(viewed.spec.cohort,'unknown');
    assert.equal(viewed.evidence,null);
    const common=()=>({taskId:task,termsDigest:state.termsDigest,expectedRevision:state.revision,...source});
    const assent={...common(),authorizedToShare:true,spec:viewed.spec};
    assert.equal(requestSchema('/v1/market/assentVoluntary')(assent),true);
    const flippedSpec={...viewed.spec,title:viewed.spec.title+'!'};
    assert.equal((await call(contributor,'assentVoluntary',{...assent,spec:flippedSpec},id())).body.code,'voluntary_terms_changed');
    assert.equal((await call(later,'assentVoluntary',assent,id())).status,403);
    assert.equal((await call(contributor,'assentVoluntary',{...assent,termsDigest:'f'.repeat(64)},id())).body.code,'voluntary_terms_changed');
    assert.equal((await call(contributor,'assentVoluntary',assent,id())).status,200);
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
    capability=await host.boot();
    const readback=value(await call(contributor,'readbackVoluntary',{action:'deliverVoluntary',input:delivered},deliveryId));
    assert.equal(readback.state,'delivered');
    assert.deepEqual(value(await call(contributor,'deliverVoluntary',delivered,deliveryId)),readback);
    state=value(await call(requester,'readVoluntary',{taskId:task}));
    assert.deepEqual(state.evidence,usefulEvidence());
    const voluntaryRow=async()=>(await host.query('SELECT voluntary,spec,requester_id FROM cj227_earned_work.ae14_market_tasks WHERE id=$1',[task])).rows[0];
    const originalVoluntary=structuredClone((await voluntaryRow()).voluntary);
    const saveVoluntary=async value=>host.query('UPDATE cj227_earned_work.ae14_market_tasks SET voluntary=$2::jsonb WHERE id=$1',[task,JSON.stringify(value)]);
    const brokenTerms=structuredClone(originalVoluntary);
    brokenTerms.terms={...brokenTerms.terms,rights:{...brokenTerms.terms.rights,attribution:'changed-preimage'}};
    await saveVoluntary(brokenTerms);
    assert.equal((await call(requester,'readVoluntary',{taskId:task})).body.code,'voluntary_terms_changed');
    const survived=value(await call(contributor,'readbackVoluntary',{action:'deliverVoluntary',input:delivered},deliveryId));
    assert.equal(survived.artifactDigest,readback.artifactDigest);
    assert.equal(survived.evidence,undefined);
    await saveVoluntary(originalVoluntary);
    const originalSpec=structuredClone((await voluntaryRow()).spec);
    const brokenSpec={...originalSpec,summary:'changed spec'};
    await host.query('UPDATE cj227_earned_work.ae14_market_tasks SET spec=$2::jsonb WHERE id=$1',[task,JSON.stringify(brokenSpec)]);
    assert.equal((await call(contributor,'exportVoluntary',{taskId:task})).body.code,'voluntary_terms_changed');
    await host.query('UPDATE cj227_earned_work.ae14_market_tasks SET spec=$2::jsonb WHERE id=$1',[task,JSON.stringify(originalSpec)]);
    const current=await voluntaryRow();
    const tampered=structuredClone(originalVoluntary);
    tampered.artifact={...tampered.artifact,evidence:{...tampered.artifact.evidence,nextDecision:'tampered'}};
    await saveVoluntary(tampered);
    assert.equal((await call(requester,'readVoluntary',{taskId:task})).body.code,'retained_evidence_required');
    await saveVoluntary(originalVoluntary);
    const reviewed=structuredClone(originalVoluntary);
    reviewed.review={...reviewed.review,requesterId:'stranger'};
    await saveVoluntary(reviewed);
    assert.equal((await call(requester,'readVoluntary',{taskId:task})).body.code,'artifact_changed');
    await saveVoluntary(originalVoluntary);
    await host.query('UPDATE cj227_earned_work.ae14_market_tasks SET requester_id=$2 WHERE id=$1',[task,'stranger']);
    assert.equal((await call(requester,'readVoluntary',{taskId:task})).status,403);
    await host.query('UPDATE cj227_earned_work.ae14_market_tasks SET requester_id=$2 WHERE id=$1',[task,current.requester_id]);
    assert.equal((await call(contributor,'reviewVoluntary',{...common(),artifactDigest:state.artifactDigest,accepted:true,exportAuthorized:true,reason:'Self claimed receipt'},id())).status,403);
    const quote=await call(requester,'quote',{taskId:task,contributorId:contributor.accountId,gross:'1',railCostCap:'0',expiresAt:new Date(Date.now()+60000).toISOString()},id());
    assert.equal(quote.body.code,'voluntary_task_cannot_be_funded');
    await assert.rejects(host.boot({tenant:'root10940-other-tenant'}), error => (error.codeName||error.message)==='tenant_refused');
    assert.equal((await host.query('SELECT tenant FROM hosted_wallet_market.installation WHERE id IS TRUE')).rows[0].tenant,'root10940-owner-qa-fixture');
    await host.boot();
    assert.equal((await call(later,'readVoluntary',{taskId:task})).status,403,'an account that is not a party cannot read the private task');
    const badCsrf=await host.request(route('withdrawVoluntary'),{role:contributor,body:{taskId:task,termsDigest:state.termsDigest,expectedRevision:state.revision,reason:'CSRF probe'},operationId:id(),headers:{'x-cj-csrf':'wrong'}});
    assert.equal(badCsrf.status,401);
    const successor=structuredClone(originalVoluntary);
    successor.terms={...successor.terms,sourceSha256:'d'.repeat(64)};
    successor.termsDigest=digest(successor.terms);
    await saveVoluntary(successor);
    assert.equal((await call(requester,'readVoluntary',{taskId:task})).body.code,'voluntary_source_changed');
    assert.equal((await call(requester,'exportVoluntary',{taskId:task})).body.code,'voluntary_source_changed');
    const stopped=value(await call(requester,'withdrawVoluntary',{taskId:task,termsDigest:successor.termsDigest,expectedRevision:successor.revision,reason:'Stop under an incompatible source'},id()));
    assert.equal(stopped.state,'withdrawn');
    assert.equal(value(await call(requester,'readVoluntary',{taskId:task})).evidence,null);
    process.env.HOSTED_WALLET_MARKET_PUBLIC_READ_PER_MINUTE='2';
    try {
      await host.boot();
      const hit=(localAddress,headers={})=>host.request(route('profile'),{method:'GET',localAddress,headers});
      const burst=await Promise.all([hit('127.0.0.1'),hit('127.0.0.1'),hit('127.0.0.1'),hit('127.0.0.1')]);
      assert.equal(burst.filter(item=>item.status===200).length,2);
      assert.equal(burst.filter(item=>item.status===429).length,2);
      const forged=await hit('127.0.0.1',{'x-forwarded-for':'203.0.113.9'});
      assert.equal(forged.status,429);
      assert.equal(forged.body.code,'public_rate_limited');
      const separate=await hit('127.0.0.2',{'x-forwarded-for':'203.0.113.9'});
      assert.equal(separate.status,200);
      assert.equal((await call(requester,'readVoluntary',{taskId:task})).status,200);
    } finally {
      delete process.env.HOSTED_WALLET_MARKET_PUBLIC_READ_PER_MINUTE;
    }
    assert.equal((await call(contributor,'interest',{taskId:task,note:'No withdrawn work'},id())).body.code,'voluntary_withdrawn');
    await host.boot({participation:false});
    const profile=await host.request(route('profile'),{method:'GET'});
    assert.equal(profile.body.value.participation,undefined);
    assert.equal((await call(requester,'readVoluntary',{taskId:task})).body.code,'voluntary_unavailable');
    assert.equal(responseSchema('/v1/market/readVoluntary','409')((await call(requester,'readVoluntary',{taskId:task})).body),true);
    assert.equal((await host.request('/contribute/',{method:'GET'})).status,404);
    assert.deepEqual(await host.financialSnapshot(),before,'historical financial, debt, funding, quote, assent, obligation, event, approval and capture rows are unchanged');
    assert.ok(host.rpcMethods.every(x=>['eth_chainId','eth_blockNumber','eth_call'].includes(x)),'no financial RPC');
  }finally {await host.close();}
});
