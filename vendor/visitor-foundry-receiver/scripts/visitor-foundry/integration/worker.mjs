#!/usr/bin/env node
// Private operator CLI. Never installed as a visitor endpoint. One bounded pass.
import { readFile } from 'node:fs/promises';
import { IntegrationStore } from './src/store.mjs';
import { recoverPool } from './src/recover.mjs';
import { supervise } from './src/supervisor.mjs';
const [mode,projectId,requestFile,key]=process.argv.slice(2);
if(process.env.VF04_OWNER_QA_WORKER!=='1' || !['recover','dispatch','revalidate','configure-verification'].includes(mode) || !projectId || !process.env.CORRESPONDENCE_DATABASE_URL || !process.env.CORRESPONDENCE_PG_SCHEMA)
  throw new Error('explicit owner QA worker, database/schema, bounded operation and enrolled project required');
const store=new IntegrationStore(process.env.CORRESPONDENCE_DATABASE_URL,{schema:process.env.CORRESPONDENCE_PG_SCHEMA,poolMax:2});
try {
  if(['revalidate','configure-verification'].includes(mode)) {
    if(!requestFile||!key)throw new Error('persisted request JSON file and command key required');
    const bytes=await readFile(requestFile);if(bytes.length>8192)throw new Error('bounded maintenance request required');
    const body=JSON.parse(bytes.toString('utf8'));
    const result=mode==='revalidate'?await store.requestRevalidation(projectId,body,key):await store.configureVerification(projectId,body,key);
    console.log(JSON.stringify(result));
  } else {
    const recovered=await recoverPool(store,projectId);
    if(mode==='dispatch'&&!recovered.blocked){
      const {assignment}=await store.reserve(projectId);
      if(assignment){await supervise(store,projectId,assignment.id);await store.reconcile(projectId,assignment.id);}
      recovered.actions.push(await recoverPool(store,projectId));
    }
    console.log(JSON.stringify(recovered));
  }
}catch(error){console.error(JSON.stringify({error:error.code??'worker_failed',nextAction:error.nextAction??'Retain reservation and inspect owned supervisor evidence.'}));process.exitCode=1;}
finally{await store.close();}
