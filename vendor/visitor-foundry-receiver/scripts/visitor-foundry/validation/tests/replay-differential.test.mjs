import test from 'node:test';
import assert from 'node:assert/strict';
// Receive VF11/32b43dde scenarios against the actual current receiver. Compare
// ordinary rollback-preserving dispatch with the private fresh replay factory.
import * as current from '../src/index.mjs';
import * as fixtures from '../fixtures/example-config.mjs';
import {trace,bind,referenceReplay,scenarios,ok} from '../fixtures/replay-scenarios.mjs';
const base={...current,fixtures},changed={...base};
function compare(t){const entries=bind(t.entries,t.h.handles),reference=referenceReplay(base,t.config,entries);assert.equal(reference.failure,null);
  const replay=changed.ValidationService.replay(t.config,entries);
  assert.deepEqual(replay.snapshot(),reference.service.snapshot());assert.deepEqual(replay.snapshot(),t.state);
  assert.deepEqual(reference.responses,t.entries.map(e=>e.response));return {entries,replay,reference:reference.service};}
for(const [name,build] of Object.entries(scenarios))test(`canonical ${name}: every response and complete retained state`,()=>{compare(trace(base,build));});
function rejected(t,entries){const bound=bind(entries,t.h.handles),reference=referenceReplay(base,t.config,bound);assert.ok(reference.failure);
  let exposed;assert.throws(()=>{exposed=changed.ValidationService.replay(t.config,bound);},e=>{
    assert.equal(e.replayIndex,reference.failure.index);
    assert.equal(e.replayCode??e.code??e.message,reference.failure.code);
    assert.equal('replayResult' in e,false);assert.equal('service' in e,false);return true;});assert.equal(exposed,undefined);
  // A failed factory yields no reusable accumulator. A separate valid replay
  // remains usable and starts from fresh constructor authority, never a snapshot.
  const prefix=entries.slice(0,reference.failure.index);
  const clean=changed.ValidationService.replay(t.config,bind(prefix,t.h.handles));
  assert.deepEqual(clean.snapshot(),referenceReplay(base,t.config,bind(prefix,t.h.handles)).service.snapshot());
}
test('duplicate ID conflict, permission refusal, invalid middle command and regressed clock fail at the same prefix',()=>{
  const t=trace(base,scenarios.generations);
  for(const mutate of [
    e=>{e[3].command.id=e[0].command.id;e[3].actor=e[0].actor;},
    e=>{e[1].actor='contributor';},
    e=>{e[2].command.payload.extra='invalid';},
    e=>{e[2].at='2026-09-25T00:00:00.000Z';},
    e=>{e[2].actor=null;},
  ]){const entries=structuredClone(t.entries);mutate(entries);rejected(t,entries);}
});
test('every recorded response is checked, including duplicate and renewal replies',()=>{
  for(const build of [scenarios.duplicates,scenarios.generations]){const t=trace(base,build);
    for(let i=0;i<t.entries.length;i++){const entries=structuredClone(t.entries);entries[i].response.revision+=1;rejected(t,entries);}}
});
test('partial reducer mutation then refusal never escapes; live dispatch rollback is unchanged',()=>{
  // submit(supersedes) invalidates old/dependent records BEFORE #room refuses.
  const t=trace(base,(h,f)=>{h.accept();ok(h.command('contributor','submit',f.candidate('queued')));},{limits:{maxOutstanding:1,maxPerScope:1}});
  const {replay,reference}=compare(t),before=replay.snapshot();
  const command={schema:base.schemaId('validation_command'),id:'command:partial',expectedRevision:before.revision,type:'submit',
    payload:base.fixtures.candidate('correction',{capability:{...base.fixtures.candidate().capability,revision:'fixture:v2'},supersedes:'candidate:a'})};
  const expected=reference.dispatch(t.h.handles.contributor,command);assert.equal(expected.code,'backlog_full');
  assert.deepEqual(replay.dispatch(t.h.handles.contributor,command),expected);assert.deepEqual(replay.snapshot(),before);assert.deepEqual(reference.snapshot(),before);
  rejected(t,[...t.entries,{actor:'contributor',at:t.h.now(),command,response:expected}]);
  assert.deepEqual(replay.snapshot(),before,'failed separate replay cannot mutate a live service');
});
test('unexpected exception after charging/assignment mutation discards the private accumulator',()=>{
  // Valid year 9999 + a reservation crossing year 10000 makes the final
  // Assignment timestamp validation fail AFTER charges; original returns refusal.
  const t=trace(base,(h,f)=>{h.setTime('9999-12-31T23:59:59.999Z');ok(h.command('contributor','submit',f.candidate()));});
  const command={schema:base.schemaId('validation_command'),id:'command:overflow',expectedRevision:1,type:'assign',payload:{}};
  const response=t.h.service.dispatch(t.h.handles.operator,command);assert.equal(response.ok,false);
  rejected(t,t.entries);
  // Throw from canonical structuredClone on an event AFTER #apply returned.
  const good=trace(base,scenarios.generations),entry=good.entries[0],original=globalThis.structuredClone;
  for(const engine of [base,changed]){let exposed;
    globalThis.structuredClone=value=>{if(value?.code==='queued')throw new Error('injected:event-persistence');return original(value);};
    try{if(engine===base){const r=referenceReplay(engine,good.config,bind([entry],good.h.handles));assert.equal(r.failure.code,'injected:event-persistence');assert.equal(r.service.snapshot().revision,0);}
      else assert.throws(()=>{exposed=engine.ValidationService.replay(good.config,bind([entry],good.h.handles));},e=>e.message==='injected:event-persistence'&&e.replayIndex===0);
      assert.equal(exposed,undefined);
    }finally{globalThis.structuredClone=original;}}
  compare(good);
});
test('serialized input/result/snapshot mutation cannot change authoritative state or charge repeated replies',()=>{
  const t=trace(base,scenarios.generations),{entries,replay}=compare(t),before=replay.snapshot();
  entries[0].command.payload.claimed.summary='mutated';entries[0].response.result.stage='accepted';t.config.policies[0].revision='mutated';
  const external=replay.snapshot();external.charged.costUnits='0';assert.deepEqual(replay.snapshot(),before);
  const duplicate=structuredClone(t.entries[0].command);duplicate.expectedRevision=0;
  const result=replay.dispatch(t.h.handles.contributor,duplicate);assert.equal(result.duplicate,true);result.result.stage='forged';assert.deepEqual(replay.snapshot(),before);
});
test('budgets, generation fences and cross-scope authority survive replay refusal',()=>{
  const budget=trace(base,h=>h.accept(),{limits:{maxCost:{currency:'USD_MICROS',units:'1000'}}});
  const cmd={schema:base.schemaId('validation_command'),id:'command:budget',expectedRevision:3,type:'revalidate',payload:{candidateId:'candidate:a',expectedGeneration:1,reason:'renew'}};
  const entries=[...budget.entries,{actor:'operator',at:budget.h.now(),command:cmd,response:{}}];rejected(budget,entries);
  const t=trace(base,scenarios.generations),bad=structuredClone(t.entries);bad[4].command.payload.expectedGeneration=8;rejected(t,bad);
  const foreign=structuredClone(t.entries);foreign[0].command.payload.scope='scope:foreign';rejected(t,foreign);
});
test('fresh factory restores live clock and public dispatch cannot enable mutation mode',()=>{
  const t=trace(base,h=>h.accept()),{replay}=compare(t);t.h.advance(60000);
  const command={schema:base.schemaId('validation_command'),id:'command:live-clock',expectedRevision:t.state.revision,type:'expire',payload:{}};
  const reference=t.h.service.dispatch(t.h.handles.operator,command);
  assert.deepEqual(replay.dispatch(t.h.handles.operator,command,true),reference);
  assert.deepEqual(replay.snapshot(),t.h.service.snapshot());assert.equal(replay.snapshot().lastTime,t.h.now());
  const before=replay.snapshot(),bad={...command,id:'command:forged-mode',type:'invalidate',payload:{scope:'scope:demo',target:'candidate',candidateId:'candidate:a',receiptId:null,dependency:null,reason:'forged',evidence:{ref:'fixture:x',revision:'fixture:x'}},expectedRevision:before.revision};
  assert.equal(replay.dispatch(t.h.handles.contributor,bad,true).code,'forbidden');assert.deepEqual(replay.snapshot(),before);
});
test('empty replay is a fresh canonical service; capacity and forged serialized handles refuse',()=>{
  const t=trace(base,()=>{}),service=changed.ValidationService.replay(t.config,[]);assert.deepEqual(service.snapshot(),t.state);
  assert.throws(()=>changed.ValidationService.replay({...t.config,limits:{...t.config.limits,maxCommands:1}},[{},{}]),/journal_capacity/);
  const accepted=trace(base,h=>h.accept()),entries=bind(accepted.entries,accepted.h.handles);entries[0].handle=JSON.parse(JSON.stringify(entries[0].handle));
  assert.throws(()=>changed.ValidationService.replay(accepted.config,entries),e=>e.replayIndex===0&&e.replayCode==='unauthenticated');
});
