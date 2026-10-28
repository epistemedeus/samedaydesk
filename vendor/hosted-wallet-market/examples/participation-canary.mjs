#!/usr/bin/env node
// Finite owner QA only. Uses three cold, independently authenticated accounts.
// No owner credential, wallet, signer, funded task or arbitrary submitted code.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFileSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

export const compatibilityVector = Object.freeze({schema:'machine-participation.table-vector.v1',
  columns:['Route','Contract'],rows:[['/read?a=1&b=2','GET & JSON'],['/δ','preserve Unicode']],
  expected:{'/read?a=1&b=2':'GET & JSON','/δ':'preserve Unicode'}});
export const usefulEvidence = () => ({kind:'usable',businessResult:JSON.stringify(compatibilityVector),
  attempts:[{action:'Preserve a two-column compatibility fixture',result:'Both labels map to their original values',evidence:'Synthetic vector included in businessResult'}],
  criterionResults:[{criterionId:'preserve-mapping',observation:'Ampersand, query and Unicode mappings are retained',passed:true}],
  nextDecision:'Reuse these authorized vectors where table mappings matter; direct Object.fromEntries is sufficient for this task.'});

const digest=value=>{const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;return createHash('sha256').update(JSON.stringify(sort(value))).digest('hex');};
export function runCanary({origin,directory,namespace,client,clientSha256,descriptor,descriptorSha256,sourceRepository,sourceCommit,sourcePath,caFile,ownerQa=false}) {
  const u=new URL(origin);
  assert.equal(ownerQa,true,'explicit owner QA scope required');
  assert.equal(u.protocol,'https:'); assert.equal(u.origin,origin);
  assert.match(namespace,/^root10940-owner-qa-[a-z0-9-]{8,64}$/);
  assert.equal(isAbsolute(directory),true); assert.equal(isAbsolute(client),true); assert.equal(isAbsolute(descriptor),true);
  assert.match(clientSha256,/^[a-f0-9]{64}$/); assert.match(descriptorSha256,/^[a-f0-9]{64}$/);
  assert.equal(typeof sourceRepository,'string'); assert.match(sourceCommit,/^[a-f0-9]{40}$/); assert.equal(typeof sourcePath,'string');
  const bytes=readFileSync(client);
  const descriptorBytes=readFileSync(descriptor);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),clientSha256,'acquired client differs from the independent pin');
  assert.equal(createHash('sha256').update(descriptorBytes).digest('hex'),descriptorSha256,'descriptor differs from the independent pin');
  const pinned=JSON.parse(descriptorBytes);
  assert.equal(pinned.schema,'neomorphic.machine-participation.acquisition.v1');
  assert.equal(pinned.version,'0.3.0');
  assert.equal(pinned.bytes,bytes.length);
  assert.equal(pinned.sha256,clientSha256);
  assert.equal(pinned.source.repository,sourceRepository);
  assert.equal(pinned.source.commit,sourceCommit);
  assert.equal(pinned.source.path,sourcePath);
  assert.equal(pinned.requiredProfile.money,'unfunded');
  assert.equal(pinned.requiredProfile.participation,'voluntary-artifact-v1');
  // EEXIST preserves every previous attempt and blocks hidden account reuse.
  mkdirSync(directory,{mode:0o700});
  const cold=join(directory,'cold-requester-0.3.0.mjs'); copyFileSync(client,cold);
  const common=['--origin',origin,...(caFile?['--ca-file',caFile]:[])];
  const roleFile=role=>join(directory,role+'.json');
  let sequence=0;
  function run(args,{code=0}={}) {
    let stdout,status=0;
    try {stdout=execFileSync(process.execPath,['--max-old-space-size=256',cold,...args,...common],
      {encoding:'utf8',timeout:30000,maxBuffer:1024*1024,env:{...process.env,UV_THREADPOOL_SIZE:'1',OMP_NUM_THREADS:'1'}});}
    catch(error){status=error.status;stdout=error.stdout;}
    const value=JSON.parse(String(stdout||'{}'));
    // Keep finite safe command/result receipts, never the private role file.
    writeFileSync(join(directory,`command-${++sequence}.json`),JSON.stringify({command:args[0],status,result:value})+'\n',{mode:0o600});
    assert.equal(status,code,`${args[0]}: ${value.code||'unexpected exit'}; retain directory and use readback for unknown outcomes`);
    return value;
  }
  const pins=['--descriptor',descriptor,'--descriptor-sha256',descriptorSha256,'--source-repository',sourceRepository,'--source-commit',sourceCommit,'--source-path',sourcePath];
  const secret=role=>['--secret-file',roleFile(role)];
  const account=role=>JSON.parse(readFileSync(roleFile(role),'utf8')).accountId;
  function act(role,action,body,options) {
    const input=join(directory,`input-${sequence+1}.json`);
    writeFileSync(input,JSON.stringify(body)+'\n',{mode:0o600});
    return run(['act','--action',action,'--input',input,...secret(role)],options);
  }
  assert.equal(run(['profile']).participation,'voluntary-artifact-v1','receive explicit participation before signup');
  const acquired=run(['acquire',...pins]);
  assert.equal(acquired.accountCreated,false);
  assert.equal(acquired.clientSha256,clientSha256);
  assert.equal(acquired.descriptorSha256,descriptorSha256);
  assert.equal(acquired.money,'unfunded');
  assert.equal(acquired.participation,'voluntary-artifact-v1');
  assert.equal(acquired.sourceSha256,pinned.requiredProfile.sourceSha256);
  assert.equal(acquired.hostSha256,pinned.requiredProfile.hostSha256);
  assert.equal(acquired.repository,sourceRepository);
  assert.equal(acquired.commit,sourceCommit);
  for(const [name,role] of [['requester','requester'],['contributor','contributor'],['later','requester']])
    run(['signup',...pins,...secret(name),'--display-name',name+' owner qa','--role',role]);
  assert.notEqual(account('requester'),account('contributor'));
  const post=run(['post',...secret('requester'),'--title',namespace+' compatibility mapping',
    '--summary','Voluntary owner QA: retain a synthetic table compatibility vector; no commission or payout.',
    '--criterion','preserve-mapping']);
  const taskId=post.taskId;
  run(['interest',...secret('contributor'),'--task-id',taskId,'--note','I can share the authorized synthetic fixture voluntarily.']);
  run(['proposals',...secret('requester'),'--task-id',taskId,'--out',join(directory,'proposals.json')]);
  let state=act('requester','offerVoluntary',{taskId,contributorId:account('contributor'),authorizedToRequest:true,
    rights:{license:'CC0-1.0',scope:'synthetic-or-authorized-reusable-artifact',attribution:'Owner QA synthetic compatibility vectors'}});
  const terms=()=>({taskId,termsDigest:state.termsDigest,expectedRevision:state.revision});
  const specOut=join(directory,'contributor-spec.json');
  run(['inspect',...secret('contributor'),'--task-id',taskId,'--out',specOut]);
  const viewed=JSON.parse(readFileSync(specOut,'utf8'));
  assert.equal(digest(viewed.spec),viewed.terms.specDigest,'contributor must verify the spec preimage');
  assert.equal(viewed.spec.title,namespace+' compatibility mapping');
  assert.equal(viewed.spec.summary,'Voluntary owner QA: retain a synthetic table compatibility vector; no commission or payout.');
  assert.deepEqual(viewed.spec.criteria,['preserve-mapping']);
  assert.deepEqual(viewed.spec.payableKinds,['usable']);
  assert.equal(viewed.evidence,null);
  state=act('contributor','assentVoluntary',{...terms(),spec:viewed.spec,authorizedToShare:true});
  state=act('contributor','deliverVoluntary',{...terms(),evidence:usefulEvidence()});
  const inspection=join(directory,'requester-inspection.json');
  run(['inspect',...secret('requester'),'--task-id',taskId,'--out',inspection]);
  assert.deepEqual(JSON.parse(readFileSync(inspection,'utf8')).evidence,usefulEvidence());
  state=act('requester','reviewVoluntary',{...terms(),artifactDigest:state.artifactDigest,
    accepted:true,exportAuthorized:true,reason:'The exact synthetic mappings meet the requested compatibility criterion.'});
  assert.equal(run(['export',...secret('later'),'--task-id',taskId,'--out',join(directory,'ungranted.json')],{code:1}).code,'forbidden');
  state=act('requester','grantVoluntary',{...terms(),consumerId:account('later')});
  const output=join(directory,'later-export.json');
  run(['export',...secret('later'),'--task-id',taskId,'--out',output]);
  const exported=JSON.parse(readFileSync(output,'utf8'));
  const vector=JSON.parse(exported.evidence.businessResult);
  // Actual later computation over received bytes, not merely an HTTP/schema pass.
  const actual=Object.fromEntries(vector.rows);
  assert.deepEqual(actual,compatibilityVector.expected);
  const later=run(['post',...secret('later'),'--title',namespace+' later vector use',
    '--summary','Use the retained authorized mappings in a second synthetic compatibility decision.', '--criterion','later-mapping']);
  act('later','useVoluntary',{taskId,laterTaskId:later.taskId,artifactDigest:exported.artifactDigest,
    decision:'Native Object.fromEntries on the received vector preserves both required mappings.'});
  act('later','withdrawNeed',{taskId:later.taskId,reason:'Finite later-use owner QA complete.'});
  state=act('contributor','withdrawVoluntary',{...terms(),reason:'Finite owner QA complete; stop further serving and reuse grants.'});
  assert.equal(run(['export',...secret('later'),'--task-id',taskId,'--out',join(directory,'withdrawn.json')],{code:1}).code,'voluntary_withdrawn');
  // A lost-response recovery reads the original immutable delivery receipt even
  // after withdrawal, without returning the artifact or repeating the effect.
  const recovered=run(['readback',...secret('contributor'),'--operation','deliverVoluntary']);
  assert.equal(recovered.artifactDigest,exported.artifactDigest);
  const result={schema:'pilot.root10940.owner-qa-canary.v1',namespace,taskId,laterTaskId:later.taskId,
    accountIds:['requester','contributor','later'].map(account),clientSha256,descriptorSha256,
    inspectedSpecDigest:digest(viewed.spec),artifactDigest:exported.artifactDigest,
    actualLaterOutput:actual,directBaselineSufficient:true,roles:'independent_authority_owner_controlled',
    externalUse:false,paidWork:false,withdrawn:state.state==='withdrawn',commands:sequence,
    exclusions:{accountIds:['requester','contributor','later'].map(account),taskIds:[taskId,later.taskId],operationIds:[]}};
  writeFileSync(join(directory,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});
  return result;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),get=name=>{const i=args.indexOf('--'+name);return i<0?undefined:args[i+1];};
  try {console.log(JSON.stringify(runCanary({origin:get('origin'),directory:get('directory'),namespace:get('namespace'),
    client:get('client'),clientSha256:get('client-sha256'),descriptor:get('descriptor'),descriptorSha256:get('descriptor-sha256'),
    sourceRepository:get('source-repository'),sourceCommit:get('source-commit'),sourcePath:get('source-path'),
    caFile:get('ca-file'),ownerQa:args.includes('--owner-qa')})));}
  catch (error) {console.error(JSON.stringify({ok:false,code:'canary_incomplete',reason:error.codeName||error.message,nextAction:'retain private directory; inspect command receipt and recover original operation'}));process.exitCode=1;}
}
