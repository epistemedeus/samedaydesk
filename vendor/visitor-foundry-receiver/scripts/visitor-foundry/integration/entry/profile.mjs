import {hash} from '../../capabilities/src/index.mjs';
import {need,exact} from '../../entry/src/contract.mjs';
import {portableEvaluation,PORTABLE_RIGHTS} from '../src/portable-profile.mjs';
export const RECEIVER_ID='host:vf12-canonical-portable-v1';
export const contributionTerms=()=>{const t={revision:'terms:vf09-owner-qa-v1',scope:'synthetic-reusable-components',funding:'voluntary',rights:PORTABLE_RIGHTS};return {...t,id:hash(t)};};
export function hostProfile(options){
 exact(options,['id','maxAdmissions','maxPhysical','pool']);
 need(/^host:[a-z0-9-]{1,64}$/.test(options.id),400,'invalid_host_profile');
 need(Number.isInteger(options.maxAdmissions)&&options.maxAdmissions>=1&&options.maxAdmissions<=32,400,'invalid_host_profile');
 need(Number.isInteger(options.maxPhysical)&&options.maxPhysical>=1&&options.maxPhysical<=4&&options.maxPhysical<=options.maxAdmissions,400,'invalid_host_profile');
 const p=options.pool;exact(p,['validityMs','maxInvocations','maxValidationCostUnits','maxCandidates','maxPackages','maxWorkCells','maxCellCommands','maxHttpKeys','maxNativeCommands','maxManifests']);
 for(const [k,max] of Object.entries({validityMs:3600000,maxInvocations:64,maxCandidates:16,maxPackages:64,maxWorkCells:16,maxCellCommands:128,maxHttpKeys:256,maxNativeCommands:256,maxManifests:128}))need(Number.isInteger(p[k])&&p[k]>=1&&p[k]<=max,400,'invalid_host_profile');
 need(p.validityMs>=100&&typeof p.maxValidationCostUnits==='string'&&/^[1-9][0-9]*$/.test(p.maxValidationCostUnits)&&BigInt(p.maxValidationCostUnits)<=256000n&&BigInt(p.maxValidationCostUnits)%4000n===0n,400,'invalid_host_profile');
 const attempts=Number(p.maxValidationCostUnits)/4000;
 const allowance={registrations:1,candidates:p.maxCandidates,packages:p.maxPackages,gaps:p.maxPackages,workCells:p.maxWorkCells,cellCommands:p.maxCellCommands+p.maxWorkCells,httpKeys:p.maxHttpKeys,nativeCommands:p.maxNativeCommands,maintenanceKeys:p.maxNativeCommands,manifests:p.maxManifests,
  verificationCpuMs:attempts*8000,verificationWallMs:attempts*16000,verificationCostUsdMicros:Number(p.maxValidationCostUnits),reviewMs:attempts*1000,reviews:attempts,
  invocationRows:p.maxInvocations,invocationCpuMs:p.maxInvocations*2000,invocationWallMs:p.maxInvocations*4000,invocationCostUsdMicros:p.maxInvocations*1000};
 // Allocation and visitor consent survive ordinary execution generations. Actual
 // runtime/source authority remains in each pool's installed verification policy.
 const body={schema:'neomorphic.foundry.entry-host-profile.v2',...options,receiverId:RECEIVER_ID,evaluator:portableEvaluation,contributionTerms:contributionTerms().id,
  allowance,aggregate:Object.fromEntries(Object.entries(allowance).map(([k,n])=>[k,n*options.maxAdmissions])),physicalMemoryMb:options.maxPhysical*512,sharing:'accepted reusable code/evidence within this installed cohort; private correspondence excluded'};
 return {...body,configId:hash(body)};
}
export function entryBinding(config){
 const legacy=config.schema==='neomorphic.foundry.entry-host-profile.v1';
 return {schema:`neomorphic.foundry.entry-receiver-binding.${legacy?'v1':'v2'}`,receiverId:RECEIVER_ID,hostConfigId:config.configId,evaluator:config.evaluator,
  ...(legacy?{environmentDigest:config.environmentDigest}:{executionAuthority:'current-installed-verification-generation-required'}),
  contributionTerms:config.contributionTerms,scope:'synthetic-reusable-components',aggregate:config.aggregate,maxPhysical:config.maxPhysical,sharing:config.sharing};
}
