#!/usr/bin/env node
// One visitor interface. Standing authorized sharing scope is explicit in local config.
import {readFile,stat} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {participationClient} from './client.mjs';
import {contribute} from './contribute.mjs';
const [mode,configFile,requestFile]=process.argv.slice(2);
const start=performance.now();
try{
 for(const f of [configFile,requestFile]){const s=await stat(f);if(!s.isFile()||s.size>524288)throw new Error('bounded input file required');}
 const config=JSON.parse(await readFile(configFile,'utf8')),request=JSON.parse(await readFile(requestFile,'utf8'));
 for(const f of [config.tokenFile,...(config.identityKeyFile?[config.identityKeyFile]:[])]){const s=await stat(f);if(s.size>4096||(s.mode&0o077))throw new Error('private bounded credential file required');}
 const token=(await readFile(config.tokenFile,'utf8')).trim();
 const identityKey=config.identityKeyFile?await readFile(config.identityKeyFile,'utf8'):'unused-cold-reader-local-key-32-characters';
 const client=participationClient({...config,token,identityKey});
 if(mode==='resume'||mode==='reconcile'){
  if(!config.identityKeyFile)throw new Error('persisted session identity key required');
  const result=await client.session[mode](request);console.log(JSON.stringify(result));
 }else if(mode==='use'||mode==='decline'){
  const discovery=await client.call('task',{request,negotiation:{accepts:[]},sharing:null});
  const invocation=discovery.manifest?await client.call('invoke',{manifestId:discovery.manifest.id,request}):null;
  const decline=mode==='decline'?await client.call('decline',{taskId:request.taskId,reason:'Use my original service result without contributing.'},`decline:${request.taskId}`):null;
  console.log(JSON.stringify({cold:true,purpose:'owner_qa',discovery,invocation,decline,metrics:client.metrics,elapsedMs:performance.now()-start}));
 }else if(mode==='contribute'){
  console.log(JSON.stringify(await contribute(client,config,request)));
 }else throw new Error('use | decline | contribute | resume | reconcile');
}catch(error){console.error(JSON.stringify({error:error.message}));process.exitCode=1;}
