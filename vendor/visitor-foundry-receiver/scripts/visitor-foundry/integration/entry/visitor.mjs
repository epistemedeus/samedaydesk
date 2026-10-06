#!/usr/bin/env node
import {readPrivateJson} from '../../../../services/correspondence/bin/safe-io.mjs';
import {enroll,resumed,contributeFromEntry,reconcileContribution,reconcileUpload,uploadCanary,uploadFullCanary,prepareNoLaunch,prepareContinuation,reconcileInvocation,durable,useFromEntry} from './client.mjs';
import {clientFailure} from '../compound/transport.mjs';
import {writeCheckpoint,resume,entryRequest} from '../../entry/src/client.mjs';
const args=process.argv.slice(2),jsonResult=args.includes('--json-result');
const [mode,file,inputFile]=args.filter(x=>x!=='--json-result');
try{
 const config=readPrivateJson(file),input=inputFile?readPrivateJson(inputFile):null;
 let result;
 if(['register','reconcile','renew'].includes(mode))result=await enroll(config,mode);
 else if(mode==='checkpoint')result=await writeCheckpoint(config.directory,input.text);
 else if(mode==='correspondence')result=await resume(config.directory);
 else if(mode==='contribute')result=await contributeFromEntry(config,input);
 else if(mode==='reconcile-upload')result=await reconcileUpload(config);
 else if(mode==='upload-canary')result=await uploadCanary(config);
 else if(mode==='upload-full-canary')result=await uploadFullCanary(config);
 else if(mode==='prepare-continuation')result=await prepareContinuation(config,input);
 else if(mode==='reconcile-invocation')result=await reconcileInvocation(config,input);
 else if(mode==='prepare-no-launch')result=await prepareNoLaunch(config,input);
 else if(mode==='status')result=await resumed(config).client.call('status');
 else if(mode==='reconcile-contribution')result=await reconcileContribution(config,input.operation);
 else if(mode==='resume-contribution')result=await resumed(config).client.session.resume(input);
 else if(mode==='withdraw'){
  durable(config.directory,'withdraw.json',input);result=await resumed(config).client.call('withdraw',input,`withdraw:${input.cellId}`);
 }else if(mode==='decline')result={decline:(await entryRequest(config.baseUrl,'/decline',{body:{}})).body,original:input.input};
 else if(mode==='use')result=await useFromEntry(config,input);
 else throw Object.assign(new Error(),{code:'invalid_action'});
 console.log(JSON.stringify(result));
}catch(error){(jsonResult?console.log:console.error)(JSON.stringify({error:clientFailure(error)}));process.exitCode=1;}
