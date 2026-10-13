import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {loadContributorDeskAssets} from './contributor-desk-assets.js';

// v1's finite lease is deliberately refused, never converted to permanent
// authority. A new installation needs its own freshly received v2 packet.
const SCHEMA='sds.contributor-https-only-qualification.v2';
const DOMAIN=SCHEMA+'\0';
const MAX_RECEIVING_AGE=10*60*1000;
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const commit=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
const installation=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const root=new URL('../../',import.meta.url);
// The controller separately receives the exact provider build/SDS commit. These
// bytes bind its qualification to the owning edge, entrypoint and artifact pair.
const MEMBERS=Object.freeze(['package.json','package-lock.json','server/index.js','server/app.js',
  'server/foundry/listener-lifecycle.js','server/lib/contributor-managed-mount.js',
  'server/lib/contributor-native-ingress.js','server/lib/contributor-host-observation.js',
  'server/lib/contributor-https-qualification.js','server/lib/contributor-desk-assets.js',
  'server/lib/contributor-artifact.js','server/lib/neomorphic-contributor-journey-mount.js',
  'server/lib/neomorphic-original-continuation-mount.js',
  'server/scripts/verify-contributor-install.mjs','server/scripts/qualify-contributor-https-edge.mjs']);
const CHECKS=Object.freeze(['providerHttpsPolicy','certificateVerifiedHttps','plaintextRefusal','backendIsolation']);
function exact(value,names){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==names.length||names.some(name=>!Object.hasOwn(value,name)))
    throw new Error('qualification shape refused');
}
function canonicalDate(value){
  const date=Date.parse(value);if(typeof value!=='string'||!Number.isFinite(date)||new Date(date).toISOString()!==value)throw new Error('qualification date refused');
  return date;
}
function secret(env){
  const key=env.CONTRIBUTOR_JOURNEY_INTEGRITY_KEY;
  if(!hex(key))throw new Error('existing stable integrity key required');
  return Buffer.from(key,'hex');
}
function originFor(env,profile){
  if(!['staging','live'].includes(profile))throw new Error('installed profile required');
  const origin=profile==='live'?env.CONTRIBUTOR_JOURNEY_ORIGIN:env.CONTRIBUTOR_JOURNEY_PREVIEW_ORIGIN,url=new URL(origin);
  if(url.protocol!=='https:'||url.origin!==origin||url.username||url.password)throw new Error('exact HTTPS origin required');
  return origin;
}
function storeBinding(env,profile){
  // Purpose-separated reuse of the already enrolled key. No new credential,
  // store marker or account/task/payment ledger is introduced.
  const names=['DATABASE_URL','EARNED_WORK_SCHEMA','CORRESPONDENCE_SCHEMA','STORE_ID',
    'REPLAY_KEY','INTEGRITY_KEY','CURSOR_KEY','OWNER_TOKEN','CORRESPONDENCE_ADMIN_TOKEN'];
  const values=names.map(name=>env['CONTRIBUTOR_JOURNEY_'+name]??null);
  if(!values[0]||values.slice(4).some(value=>!value)||profile==='live'&&values.slice(1,4).some(value=>!value))
    throw new Error('existing explicit store and stable credentials required');
  return createHmac('sha256',secret(env)).update(DOMAIN+'store\0'+JSON.stringify({profile,origin:originFor(env,profile),values})).digest('hex');
}
async function boundedBytes(file){
  const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
    const stat=await handle.stat();if(!stat.isFile()||stat.size>2*1024*1024)throw new Error('source member refused');
    const bytes=await handle.readFile();if(bytes.length!==stat.size)throw new Error('source changed during receiving');return bytes;
  }finally{await handle.close();}
}
export async function readContributorEdgeIdentity(expectedCommit){
  const {manifest}=await loadContributorDeskAssets(expectedCommit);
  const members=[];
  for(const member of MEMBERS){const bytes=await boundedBytes(new URL(member,root));members.push({path:member,bytes:bytes.length,sha256:digest(bytes)});}
  return {productCommit:manifest.sourceCommit,edgeSha256:digest(JSON.stringify(members)),
    runtimeManifestSha256:digest(await boundedBytes(new URL('vendor/neomorphic-contributor-journey/SOURCE.json',root))),
    deskManifestSha256:digest(await boundedBytes(new URL('vendor/neomorphic-contributor-desk/SOURCE.json',root)))};
}
function validate(payload){
  exact(payload,['schema','provider','scope','lifecycle','issuedAt','binding','loaderSha256','listener','checks']);
  if(payload.schema!==SCHEMA||payload.lifecycle!=='deployment-bound'||payload.provider!=='hostinger-litespeed-node'||payload.scope!=='private-transport'||payload.listener!=='unix-pipe'||!hex(payload.loaderSha256))
    throw new Error('explicit received managed edge required');
  exact(payload.binding,['profile','origin','installationId','storeBindingHmac','sdsCommit','productCommit','edgeSha256','runtimeManifestSha256','deskManifestSha256']);
  const b=payload.binding,url=new URL(b.origin);
  if(!['live','staging'].includes(b.profile)||url.protocol!=='https:'||url.origin!==b.origin||url.username||url.password||
      !installation(b.installationId)||!commit(b.sdsCommit)||!commit(b.productCommit)||!['storeBindingHmac','edgeSha256','runtimeManifestSha256','deskManifestSha256'].every(name=>hex(b[name])))
    throw new Error('exact received deployment required');
  const issued=canonicalDate(payload.issuedAt);
  if(issued>Date.now())throw new Error('qualification issue time refused');
  exact(payload.checks,CHECKS);
  for(const name of CHECKS){const check=payload.checks[name];exact(check,['receivedAt','receiptSha256']);const received=canonicalDate(check.receivedAt);
    if(!hex(check.receiptSha256)||received>issued||issued-received>MAX_RECEIVING_AGE)throw new Error('fresh independent receiving references required');}
  if(new Set(CHECKS.map(name=>payload.checks[name].receiptSha256)).size!==CHECKS.length)throw new Error('distinct owning receiving references required');
  return payload;
}

/** Explicit controller attestation, NOT a provider detector or TLS test. The
 * signer must first receive all four external policies listed in the guide.
 * Hash references preserve that evidence; only Root can supply it on the host. */
export async function issueContributorHttpsQualification(input,env){
  if(env.CONTRIBUTOR_JOURNEY_MODE!=='disabled'||env.CONTRIBUTOR_DESK_MANAGED_ENABLED!=='0'||env.CONTRIBUTOR_JOURNEY_PUBLIC_READS!=='0')
    throw new Error('qualification preparation must stay disabled and public-off');
  exact(input,['schema','profile','installationId','sdsCommit','loaderSha256','checks']);
  if(input.schema!=='sds.contributor-https-only-receiving.v2'||!installation(input.installationId)||
      env.CONTRIBUTOR_DESK_INSTALLATION_ID!==input.installationId||!commit(input.sdsCommit)||env.CONTRIBUTOR_DESK_SDS_SOURCE_COMMIT!==input.sdsCommit)
    throw new Error('exact controller-received SDS source required');
  if(!commit(env.CONTRIBUTOR_JOURNEY_SOURCE_COMMIT))throw new Error('exact controller-received product source required');
  const identity=await readContributorEdgeIdentity(env.CONTRIBUTOR_JOURNEY_SOURCE_COMMIT);
  const payload=validate({schema:SCHEMA,provider:'hostinger-litespeed-node',scope:'private-transport',lifecycle:'deployment-bound',issuedAt:new Date().toISOString(),
    binding:{profile:input.profile,origin:originFor(env,input.profile),installationId:input.installationId,storeBindingHmac:storeBinding(env,input.profile),
      sdsCommit:input.sdsCommit,...identity},loaderSha256:input.loaderSha256,listener:'unix-pipe',checks:input.checks});
  const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');
  return {qualification:encoded+'.'+createHmac('sha256',secret(env)).update(DOMAIN+encoded).digest('hex'),payload};
}

/** No environment boolean, Unix locality, helper hash or forwarded value can
 * mint this authority. A valid controller signature and exact
 * installed bytes/bindings are all required before any request is admitted. */
export async function loadContributorHttpsQualification(env){
  if(!commit(env.CONTRIBUTOR_JOURNEY_SOURCE_COMMIT))throw new Error('exact installed product source required');
  const value=env.CONTRIBUTOR_DESK_HTTPS_QUALIFICATION;
  if(typeof value!=='string'||value.length>8192||!/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(value))throw new Error('signed edge qualification required');
  const [encoded,signature]=value.split('.'),mac=createHmac('sha256',secret(env)).update(DOMAIN+encoded).digest();
  if(!timingSafeEqual(Buffer.from(signature,'hex'),mac))throw new Error('controller qualification signature refused');
  const bytes=Buffer.from(encoded,'base64url');if(bytes.toString('base64url')!==encoded)throw new Error('qualification encoding refused');
  const payload=validate(JSON.parse(bytes.toString('utf8'))),b=payload.binding,identity=await readContributorEdgeIdentity(env.CONTRIBUTOR_JOURNEY_SOURCE_COMMIT);
  if(b.profile!==env.CONTRIBUTOR_JOURNEY_MODE||b.origin!==originFor(env,env.CONTRIBUTOR_JOURNEY_MODE)||
      b.installationId!==env.CONTRIBUTOR_DESK_INSTALLATION_ID||b.sdsCommit!==env.CONTRIBUTOR_DESK_SDS_SOURCE_COMMIT||b.storeBindingHmac!==storeBinding(env,env.CONTRIBUTOR_JOURNEY_MODE)||
      Object.keys(identity).some(name=>identity[name]!==b[name]))throw new Error('qualified source/origin/store differs');
  // Source/artifact bytes are verified at this installation/startup boundary;
  // the actual loader/selected pipe is checked for every request. Deployment
  // changes use a received restart, never in-place edits. External provider
  // policy is a controller-owned dependency: revoke before changing it and
  // independently receive it again. A clock cannot observe provider drift.
  return Object.freeze({loaderSha256:payload.loaderSha256,lifecycle:payload.lifecycle,current:()=>{
    try{return env.CONTRIBUTOR_DESK_HTTPS_QUALIFICATION===value&&
      b.profile===env.CONTRIBUTOR_JOURNEY_MODE&&b.origin===originFor(env,env.CONTRIBUTOR_JOURNEY_MODE)&&
      b.installationId===env.CONTRIBUTOR_DESK_INSTALLATION_ID&&b.sdsCommit===env.CONTRIBUTOR_DESK_SDS_SOURCE_COMMIT&&b.productCommit===env.CONTRIBUTOR_JOURNEY_SOURCE_COMMIT&&
      b.storeBindingHmac===storeBinding(env,env.CONTRIBUTOR_JOURNEY_MODE);}catch{return false;}
  }});
}
