import {ParticipationSession} from '../../participation/src/session.mjs';
import {vf04Port} from '../../participation/src/vf04-port.mjs';
import {hash} from '../../capabilities/src/index.mjs';
import {jsonCall,transportStage} from './transport.mjs';
export function participationClient({baseUrl,projectId,token,identityKey,headers={},fetchImpl=globalThis.fetch,timeoutMs=20000}) {
 if(!/^[a-zA-Z0-9_-]{1,128}$/.test(projectId))throw new Error('invalid_project_id');
 const metrics={requests:0,requestBytes:0,responseBytes:0};
 const call=async(path,body,key)=>{
  delete metrics.lastError;
  const bytes=body===undefined?undefined:JSON.stringify(body);metrics.requests++;metrics.requestBytes+=Buffer.byteLength(bytes??'');
  try{return await jsonCall(fetchImpl,`${baseUrl}/v1/projects/${projectId}/foundry/${path}`,{body,headers:{...headers,authorization:`Bearer ${token}`},key,stage:transportStage(path,body),timeoutMs,onBytes:count=>{metrics.responseBytes+=count;}});}
  catch(error){metrics.lastError={code:error.code,diagnostic:error.diagnostic};throw error;}
 };
 const host={read:({cellId})=>call(`participation/cells/${cellId}`)};
 for(const operation of ['create','claim','checkpoint','submit'])host[operation]=x=>call('participation',{...x,operation},x.requestId);
 const session=new ParticipationSession({identityKey,binding:{origin:baseUrl,tenantId:projectId,grantFingerprint:hash(token)},port:vf04Port(host),currentTerms:async()=>(await call('participation/terms')).id});
 return {session,call,metrics};
}
