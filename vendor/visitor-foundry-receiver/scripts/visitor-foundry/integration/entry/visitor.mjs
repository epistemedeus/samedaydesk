#!/usr/bin/env node
import {readPrivateJson} from '../../../../services/correspondence/bin/safe-io.mjs';
import {enroll,resumed,contributeFromEntry,reconcileContribution,durable,useFromEntry} from './client.mjs';
import {writeCheckpoint,resume,entryRequest} from '../../entry/src/client.mjs';
const [mode,file,inputFile]=process.argv.slice(2);
try{
 const config=readPrivateJson(file),input=inputFile?readPrivateJson(inputFile):null;
 let result;
 if(['register','reconcile','renew'].includes(mode))result=await enroll(config,mode);
 else if(mode==='checkpoint')result=await writeCheckpoint(config.directory,input.text);
 else if(mode==='correspondence')result=await resume(config.directory);
 else if(mode==='contribute')result=await contributeFromEntry(config,input);
 else if(mode==='reconcile-contribution')result=await reconcileContribution(config,input.operation);
 else if(mode==='resume-contribution')result=await resumed(config).client.session.resume(input);
 else if(mode==='withdraw'){
  durable(config.directory,'withdraw.json',input);result=await resumed(config).client.call('withdraw',input,`withdraw:${input.cellId}`);
 }else if(mode==='decline')result={decline:(await entryRequest(config.baseUrl,'/decline',{body:{}})).body,original:input.input};
 else if(mode==='use')result=await useFromEntry(config,input);
 else throw Object.assign(new Error(),{code:'invalid_action'});
 console.log(JSON.stringify(result));
}catch(error){console.error(JSON.stringify({error:{code:/^[a-z_-]{1,80}$/.test(error.code)?error.code:'client_outcome_unknown',nextAction:error.nextAction??'reconcile_same_attempt'}}));process.exitCode=1;}
