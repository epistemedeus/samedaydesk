import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { wasm, wat, execute, limits, packaged, realModule } from './helpers.mjs';
import { invoke, superviseProcess } from '../src/supervisor.mjs';
import { bindingFor, cases } from '../example/package.mjs';
const dead = o => { assert.equal(o.termination.exited,true); assert.throws(()=>process.kill(o.processIdentity.pid,0), /ESRCH/); };

test('real C transformation on frozen unseen cases; fresh guest and process each time', async () => {
  const artifact=packaged(); const pids=new Set();
  for(const c of cases) {
    const r=await invoke({artifact,moduleBytes:realModule,input:c.input,binding:bindingFor(artifact)});
    assert.equal(r.observation.status,'ok',JSON.stringify(r.observation)); assert.deepEqual(r.output,c.expected);
    dead(r.observation);pids.add(r.observation.processIdentity.pid);
    assert.ok(r.observation.usage.fuelUsed>0);assert.ok(r.observation.usage.peakRssBytes>0);
  }
  assert.equal(pids.size,cases.length);
});
test('opaque byte ABI preserves input including zero bytes',async()=>{
  const m=wasm('local.get 1 i64.extend_i32_u i64.const 32 i64.shl local.get 0 i64.extend_i32_u i64.or');
  const input=Buffer.from([0,255,100,0]);const r=await execute(m,{input});assert.deepEqual(r.output,input);dead(r.observation);
});
test('truncated/malformed/native/AOT/text inputs never compile as submitted native code',async()=>{
  const good=wasm();
  for(const m of [good.subarray(0,good.length-1), Buffer.from('not wasm........'), Buffer.from('(module)')]) {
    const r=await execute(m);assert.equal(r.observation.status,'error');dead(r.observation);
  }
});
test('all host imports, WASI env/filesystem and socket access are refused',async()=>{
  for(const [mod,name] of [['wasi_snapshot_preview1','environ_get'],['wasi_snapshot_preview1','path_open'],['env','fetch'],['env','sock_open']]) {
    const m=wasm('i64.const 0',`(import "${mod}" "${name}" (func))`);
    const r=await execute(m);assert.equal(r.observation.code,'imports_forbidden');dead(r.observation);
  }
});
test('unsupported features and mutable/unbounded resources are explicit admission failures',async()=>{
  for(const [mem,extra] of [
    ['(memory (export "memory") 1 2)',''],['(memory (export "memory") 1)',''],
    ['(memory (export "memory") 1 1 shared)',''],['(memory (export "memory") i64 1 1)',''],
    ['(memory (export "memory") 1 1) (memory 1 1)',''],
    ['(memory (export "memory") 1 1)','(table 1 2 funcref)'],
    ['(memory (export "memory") 1 1)','(table 129 129 funcref)']]) {
    const r=await execute(wasm('i64.const 0',extra,mem));assert.equal(r.observation.status,'error');dead(r.observation);
  }
  const simd=wasm('v128.const i32x4 0 0 0 0 drop i64.const 0');
  assert.equal((await execute(simd)).observation.status,'error');
});
test('fuel covers infinite transform and start function during instantiation',async()=>{
  const loop='(loop $loop br $loop)';
  for(const m of [wasm(`${loop} i64.const 0`),wasm('i64.const 0',`(func $start ${loop}) (start $start)`)]) {
    const r=await execute(m,{limits:limits({fuel:1000})});assert.match(r.observation.code,/OUT_OF_FUEL/);dead(r.observation);
  }
});
test('fixed memory/table grow cannot exceed deterministic capacity',async()=>{
  const m=wasm('i32.const 0 i32.const 1 memory.grow i32.store i64.const 17179869184');
  assert.deepEqual((await execute(m)).output,Buffer.from([255,255,255,255]));
  const t=wasm('i32.const 0 ref.null func i32.const 1 table.grow 0 i32.store i64.const 17179869184','(table 1 1 funcref)');
  assert.deepEqual((await execute(t)).output,Buffer.from([255,255,255,255]));
  const r=await execute(wasm('i64.const 0','','(memory (export "memory") 5 5)'));assert.equal(r.observation.code,'fixed_resource_limit');
});
test('output/input pointers and unsigned lengths are checked without truncation',async()=>{
  for(const [body,alloc,code] of [
    ['i64.const 8589934591','i32.const 4096','output_pointer'],
    ['i64.const -1','i32.const 4096','output_size'],
    ['i64.const 281479271677951','i32.const 4096','output_size'],
    ['i64.const 0','i32.const -1','input_pointer'],
    ['i64.const 0','i32.const 65535','input_pointer']]) {
    const r=await execute(wasm(body,'',undefined,alloc));assert.equal(r.observation.code,code);dead(r.observation);
  }
});
test('traps, stack exhaustion and malformed JSON output cannot pass',async()=>{
  const trap=await execute(wasm('unreachable'));assert.match(trap.observation.code,/UNREACHABLE/);dead(trap.observation);
  const stack=await execute(wasm('call $r i64.const 0','(func $r call $r)'));assert.match(stack.observation.code,/STACK_OVERFLOW/);dead(stack.observation);
  const r=await execute(wasm(),{output:{encoding:'json',shape:{type:'object',required:[],properties:{}}}});
  assert.equal(r.observation.status,'invalid_output');assert.equal(r.output,null);
});
test('global guest state never persists across invocations',async()=>{
  const m=wasm('global.get $g i32.const 1 i32.add global.set $g i32.const 0 global.get $g i32.store i64.const 17179869184','(global $g (mut i32) (i32.const 0))');
  const a=await execute(m),b=await execute(m);assert.deepEqual(a.output,b.output);assert.equal(a.output.readUInt32LE(),1);assert.notEqual(a.observation.processIdentity.pid,b.observation.processIdentity.pid);
});
test('parent environment/private sentinel are absent; only explicit guest input enters memory',async()=>{
  const sentinel='VF08_PRIVATE_SENTINEL_NEVER_SHARE';const path=new URL('../.build/private-sentinel',import.meta.url);
  writeFileSync(path,sentinel);process.env.VF08_PRIVATE_SENTINEL=sentinel;
  try {
    let environment;
    const r=await execute(wasm(),{onSpawn: id=>{environment=readFileSync(`/proc/${id.pid}/environ`).toString();}});
    assert.equal(r.observation.status,'ok');assert.ok(!environment.includes(sentinel));assert.ok(!JSON.stringify(r).includes(sentinel));
  } finally {delete process.env.VF08_PRIVATE_SENTINEL;unlinkSync(path);}
});
test('bounded compilation timeout and address-space failure witness actual child exit',async()=>{
  const m=wat(`(module (memory (export "memory") 1 1) (func (export "alloc") (param i32) (result i32) i32.const 0) (func (export "transform") (param i32 i32) (result i64) i64.const 0) ${'(func i32.const 1 drop)'.repeat(15000)})`);
  const timed=await execute(m,{limits:limits({compileMs:100})});assert.equal(timed.observation.status,'compile_timeout');assert.equal(timed.observation.phasesObserved[0]?.phase,'compile');dead(timed.observation);
  const resource=await execute(wasm(),{limits:limits({addressSpaceBytes:16777216})});assert.notEqual(resource.observation.status,'ok');dead(resource.observation);
});
test('cancellation kills a real child and waits for exit; pre-abort never launches',async()=>{
  const controller=new AbortController();let pid;
  const r=await execute(wasm(),{signal:controller.signal,onSpawn: id=>{pid=id.pid;controller.abort();}});
  assert.ok(pid);assert.equal(r.observation.status,'cancelled');dead(r.observation);
  const pre=new AbortController();pre.abort();const b=await execute(wasm(),{signal:pre.signal});assert.equal(b.observation.termination.noLaunch,true);
});
test('result without exit times out; an unwitnessed kill remains unknown',async()=>{
  const common={payload:{},limits:limits({compileMs:1000,wallMs:80}),exitGraceMs:100};
  const result=await superviseProcess({...common,launch:()=>spawn(process.execPath,['-e','console.log(JSON.stringify({result:{status:"ok",output:""}}));setInterval(()=>{},1000)'],{stdio:['pipe','pipe','pipe']})});
  assert.equal(result.status,'wall_timeout');assert.equal(result.termination.exited,true);
  let child;
  try {
    const uncertain=await superviseProcess({...common,launch:()=>{child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:['pipe','pipe','pipe']});child.kill=()=>false;return child;}});
    assert.equal(uncertain.status,'unknown');assert.equal(uncertain.termination.exited,false);process.kill(child.pid,0);
  } finally {if(child) {child.ref();const exit=new Promise(r=>child.once('exit',r));process.kill(child.pid,'SIGKILL');await exit;}}
});
test('wrong export signatures, JSON shape and invalid UTF-8 outputs fail closed',async()=>{
  const bad=wat('(module (memory (export "memory") 1 1) (func (export "alloc") (param i64) (result i32) i32.const 0) (func (export "transform") (param i32 i32) (result i64) i64.const 0))');
  assert.equal((await execute(bad)).observation.code,'alloc_signature');
  for(const byte of ['\\ff','0']) {
    const r=await execute(wasm('i64.const 4294967296',`(data (i32.const 0) "${byte}")`),{output:{encoding:'json',shape:{type:'object',required:[],properties:{}}}});
    assert.equal(r.observation.status,'invalid_output');
  }
});
test('launch-identity commit failure prevents guest execution and still witnesses exit',async()=>{
  const r=await execute(wasm(),{onSpawn:()=>{throw new Error('durable identity write failed');}});
  assert.equal(r.observation.status,'launch_gate_failed');assert.equal(r.observation.phasesObserved.length,0);dead(r.observation);
});
test('module byte bound is enforced before spawning',async()=>{
  await assert.rejects(execute(Buffer.alloc(262145)),/module size/);
});
