// Only closed execution metadata leaves status/private readback; complete observations
// remain immutable in the original invocation record, including prior charged attempts.
import {ref,iso} from '../../capabilities/src/contracts.mjs';
import {hash} from '../../capabilities/src/index.mjs';
import {launchEvidenceView,launchResources} from './launch-evidence.mjs';
const states=new Set(['ok','error','incomplete','unknown','cancelled','invalid_output','compile_timeout','instantiate_timeout','execute_timeout','wall_timeout','deadline_exceeded','protocol_limit','protocol_error','launch_gate_failed','process_error','input_pipe_error','output_pipe_error']);
const phases=new Set(['compile','instantiate','execute']);
const codes=new Set([...states,'module_digest','fixed_memory','fixed_table','imports_denied','input_bound','output_bound','abi_missing','protocol_error']);
export function executionView(sample,evidence){
 const o=sample?.observation;if(!o)return null;
 const status=states.has(o.status)?o.status:'unclassified',phase=phases.has(o.phase)?o.phase:null;
 const launch=launchEvidenceView(evidence);
 return {status,phase,stage:o.termination?.noLaunch===true?'launch':phase,
  code:o.code===null?null:codes.has(o.code)?o.code:'unclassified',launchEvidence:launch};
}
export const servingLaunchResources=()=>launchResources();

const continuationFields=['schema','intentId','renewalIntentId','projectId','registrationId','taskId','requestDigest','predecessorManifestId','successorManifestId','target','priorGeneration','generation','verificationId','priorExecutionId','priorObservationId','executionId','fence','receivedAt','id'];
export function continuationView(value){
 if(!value || Object.keys(value).length!==continuationFields.length || !continuationFields.every(k=>Object.hasOwn(value,k)))return null;
 if(value.schema!=='neomorphic.foundry.invocation-continuation.v1' || Buffer.byteLength(JSON.stringify(value))>4096)return null;
 try{ref(value.target);iso(value.receivedAt);}catch{return null;}
 const {id,...body}=value;
 if(hash(body)!==id || !Number.isInteger(value.priorGeneration) || value.priorGeneration<1 || value.generation!==value.priorGeneration+1 || value.generation>4)return null;
 return value;
}
