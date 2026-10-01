import {ParticipationSession} from '../../participation/src/session.mjs';
import {vf04Port} from '../../participation/src/vf04-port.mjs';
import {hash} from '../../capabilities/src/index.mjs';
export function participationClient({baseUrl,projectId,token,identityKey,headers={},fetchImpl=globalThis.fetch}) {
 if(!/^[a-zA-Z0-9_-]{1,128}$/.test(projectId))throw new Error('invalid_project_id');
 const metrics={requests:0,requestBytes:0,responseBytes:0};
 const call=async(path,body,key)=>{
  const bytes=body===undefined?undefined:JSON.stringify(body);metrics.requests++;metrics.requestBytes+=Buffer.byteLength(bytes??'');
  const r=await fetchImpl(`${baseUrl}/v1/projects/${projectId}/foundry/${path}`,{method:body===undefined?'GET':'POST',redirect:'error',headers:{...headers,authorization:`Bearer ${token}`,'content-type':'application/json',...(key?{'idempotency-key':key}:{})},body:bytes,signal:AbortSignal.timeout(20000)});
  const chunks=[];let count=0;for await(const chunk of r.body){count+=chunk.byteLength;if(count>524288)throw new Error('response_limit');chunks.push(chunk);}metrics.responseBytes+=count;const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!r.ok){const code=result.error?.code;metrics.lastError={path,code};const mapped={stale_entry_terms:'stale-terms',stale_contribution_terms:'stale-terms',entry_cell_command_capacity:'quota-pressure',entry_cell_capacity:'quota-pressure',http_journal_capacity:'quota-pressure',stale_terms:'stale-terms',unauthorized:'stale-grant',forbidden:'forbidden',revision_conflict:'stale-revision',stale_fence:'stale-fence'}[code]??code;throw Object.assign(new Error(code??'unknown-outcome'),{code:mapped});}return result;
 };
 const host={read:({cellId})=>call(`participation/cells/${cellId}`)};
 for(const operation of ['create','claim','checkpoint','submit'])host[operation]=x=>call('participation',{...x,operation},x.requestId);
 const session=new ParticipationSession({identityKey,binding:{origin:baseUrl,tenantId:projectId,grantFingerprint:hash(token)},port:vf04Port(host),currentTerms:async()=>(await call('participation/terms')).id});
 return {session,call,metrics};
}
