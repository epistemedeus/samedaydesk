// Strict source-rollout extension, consumed by the existing release producer.
// It prepares/validates private environment packets only. No provider calls,
// qualification, credential creation, installation or payment authority.
import {ADDITIVE_ENV_KEYS,OPTIONAL_ENV_KEYS,loadDeploymentProfile} from './profile.mjs';
import {assertRpcUrl} from './chain.mjs';
import {classifyMachineProfileValue,admitMachineCapability} from './machine-profile-document.mjs';
export const PRIVATE_WALLET_PROFILE='private-wallet-source';
const fail=code=>{throw Object.assign(new Error(code),{code,codeName:code});};
const requireFact=(ok,code)=>{if(!ok)fail(code);};
const normalized=value=>{
 const rows=value?.env_vars??value;requireFact(Array.isArray(rows)&&rows.length>0&&rows.length<=512,'complete_environment_required');
 const seen=new Set();for(const row of rows){requireFact(row&&/^[A-Z][A-Z0-9_]{0,127}$/.test(row.key)&&typeof row.value==='string'&&row.value.length<=16384&&!row.value.includes('\0')&&!/^\*+$/.test(row.value)&&!seen.has(row.key),'invalid_or_masked_environment');seen.add(row.key);}
 return rows.map(({key,value})=>({key,value})).sort((a,b)=>a.key.localeCompare(b.key));
};
const disabledKeys=new Set(['CONTRIBUTOR_JOURNEY_MODE','CONTRIBUTOR_DESK_MANAGED_ENABLED','CONTRIBUTOR_JOURNEY_PUBLIC_READS','CONTRIBUTOR_DESK_ASSETS_ENABLED']);
export function validateWalletEnvironment({manifest,original,installed,rollback,sdsRoot}){
 original=normalized(original);installed=normalized(installed);rollback=normalized(rollback);
 requireFact(JSON.stringify(rollback)===JSON.stringify(original),'rollback_authority_changed');
 const before=new Map(original.map(r=>[r.key,r.value])),after=new Map(installed.map(r=>[r.key,r.value]));
 requireFact(['live','staging'].includes(before.get('CONTRIBUTOR_JOURNEY_MODE'))&&before.get('CONTRIBUTOR_JOURNEY_INSTALLED')==='1'&&
   typeof before.get('CONTRIBUTOR_JOURNEY_OWNER_TOKEN')==='string'&&before.get('CONTRIBUTOR_JOURNEY_OWNER_TOKEN').length>=8&&
   before.get('CONTRIBUTOR_DESK_MANAGED_ENABLED')==='1'&&before.get('CONTRIBUTOR_JOURNEY_PUBLIC_READS')==='0'&&before.get('CONTRIBUTOR_DESK_ASSETS_ENABLED')==='0','private_installed_baseline_required');
 requireFact(original.every(r=>after.has(r.key)&&(disabledKeys.has(r.key)||after.get(r.key)===r.value)),'retained_environment_binding_changed');
 requireFact(installed.filter(r=>!before.has(r.key)).every(r=>[...ADDITIVE_ENV_KEYS,...OPTIONAL_ENV_KEYS].includes(r.key))&&
   ADDITIVE_ENV_KEYS.every(k=>after.has(k)),'unrelated_environment_change_refused');
 requireFact(after.get('CONTRIBUTOR_JOURNEY_MODE')==='disabled'&&after.get('CONTRIBUTOR_DESK_MANAGED_ENABLED')==='0'&&
   after.get('CONTRIBUTOR_JOURNEY_PUBLIC_READS')==='0'&&after.get('CONTRIBUTOR_DESK_ASSETS_ENABLED')==='0','wallet_rollout_must_be_disabled');
 const origin='https://'+manifest.domain;
 requireFact(before.get('CONTRIBUTOR_JOURNEY_SOURCE_COMMIT')===manifest.neomorphicCommit&&
   (before.get('CONTRIBUTOR_JOURNEY_MODE')==='live'?before.get('CONTRIBUTOR_JOURNEY_ORIGIN'):before.get('CONTRIBUTOR_JOURNEY_PREVIEW_ORIGIN'))===origin,'retained_source_binding_changed');
 const get=k=>after.get('HOSTED_WALLET_MARKET_'+k);
 loadDeploymentProfile({mode:get('MODE'),label:get('LABEL'),chain:get('CHAIN'),schemaName:get('SCHEMA'),earnedSchema:get('EARNED_SCHEMA'),
   payments:get('PAYMENTS'),publicReads:get('PUBLIC_READS'),fundedTasks:get('FUNDED_TASKS'),humanAssets:get('HUMAN_ASSETS'),tls:get('TLS'),origin:get('ORIGIN'),
   tenant:get('TENANT'),listenHost:get('LISTEN_HOST'),rpcUrl:get('RPC'),databaseUrl:before.get('CONTRIBUTOR_JOURNEY_DATABASE_URL'),
   feeRecipient:get('FEE_RECIPIENT'),settlementToken:get('SETTLEMENT_TOKEN')});
 requireFact(get('CHAIN')==='eip155:8453'&&get('SETTLEMENT_TOKEN')==='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'&&
   get('TLS')==='verified-edge'&&get('ORIGIN')===origin&&get('LISTEN_HOST')==='127.0.0.1'&&
   get('EARNED_SCHEMA')===before.get('CONTRIBUTOR_JOURNEY_EARNED_WORK_SCHEMA'),'wallet_profile_binding_refused');
 requireFact(assertRpcUrl(get('RPC')).protocol==='https:','wallet_rpc_tls_required');
 const registry=get('DISCHARGE_REGISTRY');requireFact(typeof registry==='string'&&registry.startsWith('/')&&!registry.includes('..')&&!/[\r\n\0]/.test(registry),'wallet_registry_binding_refused');
 const profileValue=after.get('HOSTED_WALLET_MARKET_MACHINE_PROFILE');
 const machineProfile=profileValue===undefined?null:admitMachineProfileRelease(profileValue,{origin,tenant:get('TENANT'),sdsRoot,authority:get('MACHINE_AUTHORITY_MODULE')}).form;
 return {original,installed,machineProfile};
}
function admitMachineProfileRelease(value,{origin,tenant,sdsRoot,authority}){
 let classified;try{classified=classifyMachineProfileValue(value);}catch(error){fail(error.codeName||'machine_profile_refused');}
 if(classified.form==='absolute-path'&&!sdsRoot)return {form:'path-unopened'};
 if(!sdsRoot)fail('machine_profile_unbound');
 let document;try{document=admitMachineCapability(value,{origin,tenant,sdsRoot});}catch(error){fail(error.codeName||'machine_profile_refused');}
 if(document.money==='unfunded'&&authority)fail('machine_authority_refused');
 return {form:classified.form==='source-bound'?'source-bound':classified.form+'-bound'};
}
export function walletEnvironmentPacket({manifest,existing,wallet,sdsRoot}){
 const original=normalized(existing),extension=normalized(wallet),before=new Map(original.map(r=>[r.key,r.value]));
 requireFact(ADDITIVE_ENV_KEYS.every(key=>extension.some(r=>r.key===key))&&extension.every(r=>[...ADDITIVE_ENV_KEYS,...OPTIONAL_ENV_KEYS].includes(r.key)),'wallet_profile_binding_refused');
 for(const row of extension)requireFact(!before.has(row.key)||before.get(row.key)===row.value,'retained_environment_binding_changed');
 const merged=new Map([...before,...extension.map(r=>[r.key,r.value])]);for(const key of disabledKeys)merged.set(key,key==='CONTRIBUTOR_JOURNEY_MODE'?'disabled':'0');
 const installed=[...merged].map(([key,value])=>({key,value})).sort((a,b)=>a.key.localeCompare(b.key));
 const validated=validateWalletEnvironment({manifest,original,installed,rollback:original,sdsRoot});
 return {install:{env_vars:installed},rollback:{env_vars:original},receipt:{schema:'pilot.private-wallet.environment-packet.v1',existingKeys:original.length,
   walletKeys:extension.length,preservesRetainedAuthority:true,rolloutServingDisabled:true,sent:false,qualified:false,...(validated.machineProfile?{machineProfile:validated.machineProfile}:{})}};
}

// Post-qualification entry packet. The canonical release packet remains closed
// and keeps every old wallet value through build, qualification and activation.
// This separate preparer adds only the source-admitted unfunded capability to a
// freshly received installed environment. It never sends or qualifies anything.
export function machineEntryEnvironmentPacket({manifest,existing,machineProfile,sdsRoot}){
 const original=normalized(existing),before=new Map(original.map(row=>[row.key,row.value]));
 requireFact(/^[a-f0-9]{40}$/.test(manifest?.commit||'')&&before.get('CONTRIBUTOR_DESK_SDS_SOURCE_COMMIT')===manifest.commit&&
   before.get('CONTRIBUTOR_DESK_INGRESS_MODE')==='litespeed-https-only'&&!!before.get('CONTRIBUTOR_DESK_INSTALLATION_ID')&&
   !!before.get('CONTRIBUTOR_DESK_HTTPS_QUALIFICATION'),'installed_source_required');
 const document=admitMachineCapability(machineProfile,{sdsRoot,origin:'https://'+manifest.domain,tenant:before.get('HOSTED_WALLET_MARKET_TENANT')});
 requireFact(document?.money==='unfunded','unfunded_entry_required');
 requireFact(!before.get('HOSTED_WALLET_MARKET_MACHINE_AUTHORITY_MODULE'),'machine_authority_refused');
 const key='HOSTED_WALLET_MARKET_MACHINE_PROFILE';
 requireFact(!before.has(key)||before.get(key)===machineProfile,'retained_environment_binding_changed');
 const wallet=original.filter(row=>[...ADDITIVE_ENV_KEYS,...OPTIONAL_ENV_KEYS].includes(row.key)&&row.key!==key);
 wallet.push({key,value:machineProfile});
 // Reuse the ordinary strict private-wallet validation; discard its disabled
 // rollout postimage. The only actual postimage difference below is the entry.
 walletEnvironmentPacket({manifest,existing:original,wallet,sdsRoot});
 const install=normalized([...original.filter(row=>row.key!==key),{key,value:machineProfile}]);
 return {install:{env_vars:install},rollback:{env_vars:original},receipt:{schema:'pilot.unfunded-machine-entry.environment-packet.v1',
   sourceCommit:manifest.commit,installedSourceSha256:document.sourceSha256,hostSourceSha256:document.hostSha256,
   changedKeys:before.has(key)?[]:[key],existingKeys:original.length,preservesExistingValues:true,money:'unfunded',sent:false,qualified:false}};
}
