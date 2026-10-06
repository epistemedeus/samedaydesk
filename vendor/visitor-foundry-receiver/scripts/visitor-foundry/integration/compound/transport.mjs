// Closed diagnostics. No response text, URL, headers, exception prose or credentials leave here.
import {COMPONENT_WIRE,LEGACY_COMPONENT_WIRE} from '../src/portable-upload-wire.mjs';
const stages=new Set(['terms','task','components','create','claim','checkpoint','submit','cell_read','invoke','other']);
const classes=new Set(['json','text','html','other','absent']);
const failures=new Set(['transport_refused','transport_unavailable','transport_response_invalid','transport_response_limit','transport_outcome_unknown','invocation_launch_unavailable','invocation_no_launch','invocation_failed','invocation_outcome_unknown','upload_outcome_unknown','upload_receipt_invalid','client_outcome_unknown','local_intent_mismatch','standing_terms_mismatch','continuation_required','receiver_not_ready','invalid_action','invalid_operation','grant_expired','entry_refused','no_contribution_opportunity','local_execution_incomplete','participation_incomplete','forbidden','stale-grant','stale-terms','quota-pressure','stale-revision','stale-fence','invalid-input','conflict','payload-too-large','unknown-outcome']);
const codes={invocation_launch_unavailable:'invocation_launch_unavailable',invocation_no_launch:'invocation_no_launch',invocation_failed:'invocation_failed',invocation_outcome_unknown:'invocation_outcome_unknown',task_reuse_conflict:'conflict',manifest_request_mismatch:'conflict',manifest_expired:'stale-terms',evidence_changed:'stale-terms',resolution_invalidated:'stale-terms',physical_reservation_held:'quota-pressure',host_physical_reservation_held:'quota-pressure',stale_invocation_fence:'stale-fence',installed_verification_changed:'stale-terms',installed_runtime_changed:'stale-terms',installed_source_changed:'stale-terms',INVALID_INPUT:'invalid-input',LIMIT_EXCEEDED:'payload-too-large',invalid_participation_input:'invalid-input',idempotency_conflict:'conflict',invalid_json:'invalid-input',non_json_value:'invalid-input',json_depth_exceeded:'invalid-input',stale_entry_terms:'stale-terms',stale_contribution_terms:'stale-terms',stale_terms:'stale-terms',unauthorized:'stale-grant',grant_expired:'stale-grant',forbidden:'forbidden',revision_conflict:'stale-revision',stale_fence:'stale-fence',entry_cell_command_capacity:'quota-pressure',entry_cell_capacity:'quota-pressure',http_journal_capacity:'quota-pressure',package_capacity:'quota-pressure',invalid_component_wire:'invalid-input',invalid_component_encoding:'invalid-input',invalid_component_digest:'invalid-input',component_digest_mismatch:'invalid-input',payload_too_large:'payload-too-large',invalid_source_encoding:'invalid-input',source_content_mismatch:'invalid-input',invalid_module_encoding:'invalid-input',invalid_portable_package:'invalid-input',outcome_unknown:'unknown-outcome'};
export function transportStage(path,body) {
 if(path==='participation/terms')return 'terms';
 if(path==='participation' && stages.has(body?.operation))return body.operation;
 if(/^participation\/cells\/[a-zA-Z0-9_:.-]+$/.test(path))return 'cell_read';
 return ['task','components','invoke'].includes(path)?path:'other';
}
export function safeDiagnostic(value) {
 if(!value || !stages.has(value.stage) || !classes.has(value.contentClass))return undefined;
 return {stage:value.stage,status:Number.isInteger(value.status)&&value.status>=100&&value.status<=599?value.status:null,
  contentClass:value.contentClass,applicationMarked:value.applicationMarked===true};
}
export function clientFailure(error) {
 const diagnostic=safeDiagnostic(error?.diagnostic);
 return {code:failures.has(error?.code)?error.code:'client_outcome_unknown',nextAction:'reconcile_same_attempt',...(diagnostic?{diagnostic}:{})};
}
export function failure(code,diagnostic) {return Object.assign(new Error(code),{code,diagnostic:safeDiagnostic(diagnostic),nextAction:'reconcile_same_attempt'});}
export async function jsonCall(fetchImpl,url,{body,headers,key,stage,timeoutMs=20000,maxBytes=524288,onBytes=()=>{}}) {
 const controller=new AbortController();let reader,timer,response;
 let diagnostic={stage,status:null,contentClass:'absent',applicationMarked:false};
 // Race also bounds an injected/noncompliant fetch or stream that ignores abort.
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reader?.cancel().catch(()=>{});reject(failure('transport_outcome_unknown',diagnostic));},timeoutMs);});
 const work=(async()=>{
  response=await fetchImpl(url,{method:body===undefined?'GET':'POST',redirect:'error',headers:{...headers,'content-type':'application/json',...(key?{'idempotency-key':key}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
  const type=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  diagnostic={stage,status:response.status,contentClass:type==='application/json'?'json':type==='text/html'?'html':type==='text/plain'?'text':type?'other':'absent',applicationMarked:response.headers.get('x-foundry-integration')==='neomorphic.foundry.integration.v1' || [COMPONENT_WIRE,LEGACY_COMPONENT_WIRE].includes(response.headers.get('x-foundry-component-wire'))};
  const length=response.headers.get('content-length');
  if(length && /^\d+$/.test(length) && Number(length)>maxBytes)throw failure('transport_response_limit',diagnostic);
  const chunks=[];let count=0;reader=response.body?.getReader();
  if(reader)for(;;){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>maxBytes)throw failure('transport_response_limit',diagnostic);chunks.push(value);}
  onBytes(count);
  let result;try{result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{}
  if(!response.ok) {
   const code=diagnostic.contentClass==='json' && Object.hasOwn(codes,result?.error?.code)?codes[result.error.code]:null;
   throw failure(code ?? (response.status>=400&&response.status<500?'transport_refused':response.status>=500?'transport_unavailable':'transport_response_invalid'),diagnostic);
  }
  if(diagnostic.contentClass!=='json' || !result || typeof result!=='object' || Array.isArray(result) || response.status!==200)throw failure('transport_response_invalid',diagnostic);
  return result;
 })();
 try{return await Promise.race([work,deadline]);}
 catch(error){if(failures.has(error?.code) && safeDiagnostic(error.diagnostic))throw error;throw failure('transport_outcome_unknown',diagnostic);}
 finally{clearTimeout(timer);controller.abort();reader?.cancel().catch(()=>{});if(!reader)response?.body?.cancel().catch(()=>{});}
}
