import {randomUUID} from 'node:crypto';
import {createReceivingPorts,toVF03Receipt} from '../../execution/src/ports.mjs';
import {toNativeRef} from './wire.mjs';
import {portablePolicy} from './portable-profile.mjs';
export async function supervisePortable(store,projectId,attempt,{signal,onCaseStart,onObservation,onSpawn}={}) {
 const ports=createReceivingPorts({enabled:true,policy:portablePolicy(),referenceAdapter:toNativeRef,
   loadVerification:()=>store.loadPortableAttempt(projectId,attempt.id,attempt.supervisor,attempt.fence)});
 let result=null,error=null;
 try { result=await ports.verify({projectId,assignmentId:attempt.id,fence:attempt.fence,signal,
   onCaseStart:async record=>{await store.portableChild(projectId,attempt.id,attempt.supervisor,attempt.fence,record.caseId,{planned:true});await onCaseStart?.(record);},
   onSpawn:async record=>{await store.portableChild(projectId,attempt.id,attempt.supervisor,attempt.fence,record.caseId,{identity:record.identity});await onSpawn?.(record);},
   onObservation:async record=>{await store.portableChild(projectId,attempt.id,attempt.supervisor,attempt.fence,record.caseId,{sample:record.sample});await onObservation?.(record);}});
 }catch(e){error={code:e.code??'portable_verification_incomplete',message:e.message};}
 let receipt=null;
 if(result)try{receipt=toVF03Receipt(result,{assignment:attempt.assignment,fence:attempt.fence,observedAt:result.observations.filter(Boolean).map(o=>o.observedAt).sort().at(-1),referenceAdapter:toNativeRef});}catch{error='portable_receipt_incomplete';}
 return store.finishPortableAttempt(projectId,attempt.id,attempt.supervisor,attempt.fence,{result,receipt,error});
}
