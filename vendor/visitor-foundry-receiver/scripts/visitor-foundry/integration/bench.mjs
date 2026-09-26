import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import { boot,project,checkpointed,submit,recipe,request,path,ok } from './tests/helpers.mjs';
import { IntegrationStore } from './src/store.mjs';
import { supervise } from './src/supervisor.mjs';
const hosts=[await boot(),await boot()];
const store=new IntegrationStore(process.env.VF04_TEST_DATABASE_URL,{schema:process.env.VF04_TEST_SCHEMA,poolMax:2});
const report={purpose:'owner_qa',offeredIs:'simultaneous HTTP admission requests, not people or demand',
  resources:{node:process.version,cpu:os.cpus()[0].model,cpus:os.cpus().length,totalMemory:os.totalmem(),
    hosts:hosts.map(h=>h.pid),perHostPools:{base:1,cells:2,foundry:2},pgMaxConnections:24,pgSharedBuffersMiB:32},
  runs:[],actualCost:null,limits:'short loopback bursts; no sustained throughput, WAN, demand or economic inference'};
try {
  for(const offered of [1,8,32,128]) for(const pattern of ['scoped','single-budget','semantic-duplicate']) {
    const projects=[];for(let i=0;i<(pattern==='scoped'?Math.min(8,offered):1);i++)projects.push(await project(hosts[i%2]));
    const prepared=[];
    for(let i=0;i<(pattern==='semantic-duplicate'?1:offered);i++){
      const p=projects[i%projects.length];const artifact={...recipe,maxRangeLength:16+Math.floor(i/projects.length)};
      const s=await submit(hosts[i%2],p,await checkpointed(hosts[i%2],p,artifact),artifact);
      prepared.push({p,body:s.body});
    }
    const start=performance.now(),cpuStart=process.cpuUsage();
    const results=await Promise.all(Array.from({length:offered},async(_,i)=>{
      const {p,body}=prepared[pattern==='semantic-duplicate'?0:i];const t=performance.now();
      const r=await request(hosts[i%2],`${path(p)}/candidates`,{token:p.writer.token,body,timeout:20000});
      return {status:r.status,code:r.body.error?.code??(r.body.duplicate?'duplicate':'admitted'),ms:performance.now()-t,candidateId:r.body.candidateId};
    }));
    const elapsedMs=performance.now()-start;const durations=results.map(r=>r.ms).sort((a,b)=>a-b);
    const counts={};for(const r of results)counts[r.code]=(counts[r.code]??0)+1;
    assert.equal(counts.outcome_unknown??0,0);
    assert.equal(counts.admitted,pattern==='semantic-duplicate'?1:pattern==='single-budget'?Math.min(offered,16):offered);
    if(pattern==='single-budget')assert.equal(counts.backlog_full??0,Math.max(0,offered-16));
    // Every enrolled tenant gets a first FIFO assignment. A second dispatch in
    // any one tenant is refused while its real subprocess reservation is held.
    const assignments=await Promise.all(projects.map((p,i)=>hosts[i%2].rpc('reserve',p.projectId)));
    const fifo=[];
    for(let i=0;i<projects.length;i++){
      const p=projects[i];
      const first=await store.db.tx(c=>c.query("SELECT response_json->'command'->'payload'->>'id' AS id FROM correspondence_idempotency WHERE project_id=$1 AND scope='vf04:transition' AND response_json->'command'->>'type'='submit' ORDER BY (response_json->>'revision')::integer LIMIT 1",[p.projectId]));
      assert.equal(assignments[i].assignment.candidateId,first.rows[0].id);fifo.push(true);
      await assert.rejects(hosts[i%2].rpc('reserve',p.projectId),/physical_reservation_held/);
    }
    await Promise.all(projects.map(async(p,i)=>{
      await supervise(store,p.projectId,assignments[i].assignment.id);
      const outcome=await hosts[i%2].rpc('reconcile',p.projectId,assignments[i].assignment.id);assert.equal(outcome.stage,'accepted');
      await hosts[i%2].rpc('publish',p.projectId,assignments[i].assignment.candidateId);
    }));
    const processCpu=process.cpuUsage(cpuStart);
    const record={offered,pattern,tenants:projects.length,counts,elapsedMs,p50Ms:durations[Math.ceil(offered*.5)-1],p95Ms:durations[Math.ceil(offered*.95)-1],maxMs:durations.at(-1),
      firstRoundServed:projects.length,fifoWithinEachBudget:fifo.every(Boolean),maxReservationsPerBudget:1,chargedAttemptCaps:projects.length,
      measuredHarnessCpuMs:(processCpu.user+processCpu.system)/1000,actualVerificationSpend:null};
    report.runs.push(record);console.log(JSON.stringify(record));
  }
  report.hostMemory=await Promise.all(hosts.map(async h=>({pid:h.pid,status:(await readFile(`/proc/${h.pid}/status`,'utf8')).split('\n').filter(l=>/^Vm(HWM|RSS):/.test(l))})));
}finally{
  await writeFile(process.env.VF04_EVIDENCE_DIR ? `${process.env.VF04_EVIDENCE_DIR}/capacity.json` : new URL('./evidence/capacity.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
  await Promise.all(hosts.map(h=>h.stop()));await store.close();
}
