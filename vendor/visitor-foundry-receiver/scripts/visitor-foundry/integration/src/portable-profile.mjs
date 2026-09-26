import {UnsupportedWire,identity} from './wire.mjs';
// Installed capability/evaluator profile. Visitors receive metadata, never the oracle cases.
import {readFileSync} from 'node:fs';
import {installedPolicy} from '../../execution/src/ports.mjs';
import {validateArtifact,bytesHash,PROFILE,DEFAULT_LIMITS} from '../../execution/src/contracts.mjs';
import {hash} from '../../capabilities/src/index.mjs';
import {requireThat as need,jsonBounded} from '../../validation/src/index.mjs';
export const PORTABLE_KIND='portable-structured-result-v1';
export const PORTABLE_ENV={platform:'linux',arch:'x64',executionProfile:PROFILE.id};
export const PORTABLE_OUTCOME='compact-correspondence-structured-result';
export const cases=JSON.parse(readFileSync(new URL('../compound/heldouts.json',import.meta.url)));
export const portableEvaluation={id:'evaluator:vf09-structured-result',revision:'vf09.oracle.v1',suiteDigest:hash(cases)};
export const PORTABLE_RIGHTS='MIT; explicit owner-QA reusable source permission';
const hostFiles=['./portable-profile.mjs','../compound/oracle.py','../compound/heldouts.json','../../execution/src/ports.mjs','../../../../packs/exchange-townsquare/exchange/01/src/run-checks.mjs'];
const currentHostPin=()=>hash(hostFiles.map(path=>({path,digest:bytesHash(readFileSync(new URL(path,import.meta.url)))})));
const hostPin=currentHostPin();
let cached;
export function portablePolicy(){return cached??=installedPolicy({evaluator:portableEvaluation,cases,environment:PORTABLE_ENV});}
export function portableVerification(config,{revision=config.policies[0].revision,validityMs=3600000}={}) {
 need(currentHostPin()===hostPin,'installed_source_changed');
 need(typeof revision==='string'&&revision.length>0&&revision.length<=256,'invalid_policy_revision');
 need(Number.isInteger(validityMs)&&validityMs>=100&&validityMs<=3600000,'invalid_evidence_validity');
 const p=portablePolicy();
 const policy={...config.policies[0],revision,evaluator:{id:p.evaluator.id,revision:p.evaluator.revision},environmentDigest:p.environmentDigest,requiredChecks:cases.map(c=>c.id)};
 const body={schema:'neomorphic.foundry.verification-generation-policy.v1',projectId:config.scope.slice(8),kind:PORTABLE_KIND,
 sourceRevision:'installed:vf09-structured-result',sourceDigest:hostPin,runtimePin:p.runtimePin,policy,validityMs};
 return {...body,id:hash(body)};
}
export function portableArtifact(raw) {
 const a=jsonBounded(raw,490000);
 need(Object.keys(a).sort().join(',')==='descriptor,kind,moduleBase64,sourceText'&&a.kind===PORTABLE_KIND,'invalid_portable_package');
 need(typeof a.moduleBase64==='string'&&a.moduleBase64.length<=349528,'portable_module_limit');
 if(Array.isArray(a.descriptor?.capability?.dependencies)&&a.descriptor.capability.dependencies.length)throw new UnsupportedWire('portable_composition_mapping_unavailable',identity(a.descriptor.capability,a.descriptor.capability.dependencies));
 const bytes=Buffer.from(a.moduleBase64,'base64');
 need(bytes.toString('base64')===a.moduleBase64,'invalid_module_encoding');validateArtifact(a.descriptor,bytes);
 need(typeof a.sourceText==='string'&&Buffer.byteLength(a.sourceText)<=32768&&bytesHash(Buffer.from(a.sourceText)).slice(7)===a.descriptor.capability.source.revision,'source_content_mismatch');
 const d=a.descriptor,v=d.capability;
 need(v.outcomes.length===1&&v.outcomes[0]===PORTABLE_OUTCOME&&hash(d.evaluation)===hash(portableEvaluation),'portable_evaluator_unavailable');
 need(d.input.encoding==='json'&&d.output.encoding==='json'&&hash(d.limits)===hash(DEFAULT_LIMITS),'portable_profile_unavailable');
 need(v.rights.status==='allowed'&&v.rights.license==='MIT'&&v.rights.ref==='permission:vf09-owner-qa','portable_rights_unavailable');
 need(v.provenance.refs.includes(bytesHash(Buffer.from(a.sourceText))),'source_provenance_missing');
 return a;
}
export function portableMatches(manifest,artifact){try{return hash(portableArtifact(artifact).descriptor.capability)===hash(manifest);}catch{return false;}}
