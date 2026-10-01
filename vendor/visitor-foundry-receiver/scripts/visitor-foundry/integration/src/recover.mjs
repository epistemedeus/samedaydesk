import { supervise } from './supervisor.mjs';

/** One bounded recovery pass in one enrolled budget. No heartbeat/PID timeout
 * releases live/uncertain work. Multiple processes can call it: durable claim CAS
 * admits only one subprocess. Do not pass a client-selected database or project. */
export async function recoverPool(store, projectId) {
  await store.markUnknown(projectId);
  const attempts=await store.db.tx(async c=>(await c.query("SELECT * FROM correspondence_vf04_attempts WHERE project_id=$1 AND state<>'reconciled' ORDER BY id LIMIT 1",[projectId])).rows);
  const result={projectId,actions:[],blocked:null};
  for(const a of attempts){
    if(a.termination?.exited) {result.actions.push(await store.reconcile(projectId,a.id));}
    else if(a.children?.length===a.assignment.requiredChecks.length&&a.children.every(x=>x.sample?.observation?.termination?.exited||x.sample?.observation?.termination?.noLaunch)){await store.recoverPortableAttempt(projectId,a.id);result.actions.push(await store.reconcile(projectId,a.id));}
    else if(a.state==='unknown' && a.supervisor===null) result.actions.push(await store.reconcileUnlaunched(projectId,a.id));
    else if(a.state==='reserved') {
      try {await supervise(store,projectId,a.id);result.actions.push(await store.reconcile(projectId,a.id));}
      catch(error){if(error.code!=='attempt_already_claimed')throw error;result.blocked='another_supervisor_claimed';}
    }else result.blocked='termination_or_outcome_unknown';
  }
  const invocations=await store.db.tx(async c=>(await c.query("SELECT task_id,state FROM correspondence_vf04_invocations WHERE project_id=$1 AND state<>'completed' LIMIT 1",[projectId])).rows);
  for(const i of invocations){if(i.state==='reserved'){try{result.actions.push(await store.reconcileUnlaunchedInvocation(projectId,i.task_id));}catch{result.blocked='invocation_termination_or_outcome_unknown';}}else result.blocked='invocation_termination_or_outcome_unknown';}
  const publications=await store.db.tx(async c=>(await c.query("SELECT p.candidate_id,p.generation FROM correspondence_vf04_publications p JOIN correspondence_vf04_candidates c ON c.project_id=p.project_id AND c.id=p.candidate_id AND c.generation=p.generation WHERE p.project_id=$1 AND p.state='pending' ORDER BY p.candidate_id LIMIT 16",[projectId])).rows);
  for(const p of publications)result.actions.push(await store.publish(projectId,p.candidate_id,p.generation));
  return result;
}
