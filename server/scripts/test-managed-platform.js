import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runBounded } from "../foundry/bounded-child.mjs";
import { collectProbe } from "../foundry/managed-node-probe.mjs";
import { withoutHostUtilities } from "../foundry/activation/receiving-100502/namespace.mjs";
import { limitedPythonLaunch, launcherPins } from "../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/src/launch.mjs";
import { DEFAULT_LIMITS, CAPS } from "../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/src/contracts.mjs";
import { python, superviseProcess, installation } from "../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/src/supervisor.mjs";
import { packageModule, bindingFor } from "../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/example/package.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const execution = path.join(root, "vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution");
const launcher = path.join(execution, "src/launcher.py");
const isolated = async fn => { const dir=await mkdtemp(path.join(tmpdir(),"sds-platform-test-100502-")); try { return await fn(dir); } finally { await rm(dir,{recursive:true,force:true}); } };
async function limitedCode(code, options = {}) {
  const plan = limitedPythonLaunch(python, DEFAULT_LIMITS, ["-c", code]);
  return runBounded(plan.command, plan.args, { env: { LANG:"C", LC_ALL:"C" }, capture:true, timeoutMs:5000, ...options });
}
const alive = pid => { try { const s=fs.readFileSync(`/proc/${pid}/stat`,"utf8"); return s.slice(s.lastIndexOf(") ")+2)[0]!=="Z"; } catch { return false; } };

test("fresh bundled runtime invokes real/changed/useful-negative input without system Python or prlimit", async () => {
  const result = await withoutHostUtilities(["server/scripts/fixtures/managed-platform-invocation.mjs"], { fresh:true });
  assert.equal(result.reason,null); assert.equal(result.code,0);
  const receipt=JSON.parse(result.stdout);
  assert.equal(receipt.ok,true); assert.equal(receipt.runs.length,3);
  assert.equal(receipt.probe.launcherIdentityStable,true);
  assert.equal(receipt.runtime.pins.launcher.id,launcherPins().id);
});

test("OS limits and original PID exist at the first target instruction, before stdin/Wasmtime", async () => {
  const result = await limitedCode("import os,resource,json,sys;print(json.dumps({'pid':os.getpid(),'limits':[resource.getrlimit(k) for k in [resource.RLIMIT_AS,resource.RLIMIT_CPU,resource.RLIMIT_STACK,resource.RLIMIT_FSIZE,resource.RLIMIT_NOFILE,resource.RLIMIT_CORE]],'wasmtimeLoaded':'wasmtime' in sys.modules,'input':sys.stdin.readline().strip()}))", { input:"fixture\n" });
  assert.equal(result.code,0); assert.equal(result.reason,null);
  const observed=JSON.parse(result.stdout);
  assert.equal(observed.pid,result.pid); assert.equal(observed.wasmtimeLoaded,false); assert.equal(observed.input,"fixture");
  assert.deepEqual(observed.limits,[536870912,2,8388608,1048576,32,0].map(n=>[n,n]));
  assert.equal(fs.existsSync(`/proc/${result.pid}`),false);
});

test("actual kernel address-space, file-size and descriptor limits refuse excess", async () => isolated(async dir => {
  const code = `import os,resource,json,signal\nsignal.signal(signal.SIGXFSZ,signal.SIG_IGN)\nrefused=[]\ntry: b=bytearray(600*1024*1024)\nexcept MemoryError: refused.append('memory')\ntry:\n f=open(${JSON.stringify(path.join(dir,"limited-file"))},'wb',buffering=0);f.write(b'x'*(2*1024*1024));f.write(b'x')\nexcept OSError: refused.append('file')\nhandles=[]\ntry:\n while True: handles.append(open('/dev/null','rb'))\nexcept OSError: refused.append('fds')\nprint(json.dumps(refused))`;
  const result=await limitedCode(code); assert.equal(result.code,0); assert.equal(result.reason,null);
  assert.deepEqual(JSON.parse(result.stdout),["memory","file","fds"]);
  assert.ok(fs.statSync(path.join(dir,"limited-file")).size<=DEFAULT_LIMITS.fileBytes);
}));

test("actual kernel CPU limit terminates and reaps a spinning installed target", async () => {
  const result=await limitedCode("while True: pass");
  assert.equal(result.reason,null); assert.equal(result.signal,"SIGKILL"); assert.equal(result.exited,true);
  assert.equal(fs.existsSync(`/proc/${result.pid}`),false);
});

test("a lower inherited hard limit fails closed instead of silently substituting weaker limits", async () => {
  const plan=limitedPythonLaunch(python,DEFAULT_LIMITS,["-c","print('TARGET_EXECUTED')"]);
  const code=`import os,resource;resource.setrlimit(resource.RLIMIT_NOFILE,(16,16));os.execv(${JSON.stringify(python)},${JSON.stringify([python,...plan.args])})`;
  const result=await runBounded(python,["-I","-S","-c",code],{capture:true,timeoutMs:3000,env:{LANG:"C",LC_ALL:"C"}});
  assert.equal(result.code,2); assert.equal(JSON.parse(result.stdout).result.code,"launcher_limits_unavailable");
  assert.doesNotMatch(result.stdout,/TARGET_EXECUTED/);
});

for (const [name, injected, expected] of [
  ["missing resource", "sys.modules['resource']=types.SimpleNamespace()", "launcher_resource_unavailable"],
  ["failed setrlimit", "import resource;resource.setrlimit=lambda *a:(_ for _ in ()).throw(OSError('SECRET postgres://private'))", "launcher_limits_unavailable"],
  ["false enforcement", "import resource;resource.setrlimit=lambda *a:None;resource.getrlimit=lambda *a:(0,0)", "launcher_limits_unavailable"],
  ["failed exec", "sys.executable='/nonexistent/SECRET-python'", "launcher_exec_failed"],
]) test(`launcher ${name} is typed, secret-free and never executes the target`, async () => {
  const plan=limitedPythonLaunch(python,DEFAULT_LIMITS,["-c","print('TARGET_EXECUTED')"]);
  const code=`import sys,types,runpy;${injected};sys.argv=${JSON.stringify([launcher,...plan.args.slice(4)])};runpy.run_path(${JSON.stringify(launcher)},run_name='__main__')`;
  const result=await runBounded(python,["-I","-S","-c",code],{capture:true,timeoutMs:3000,env:{LANG:"C",LC_ALL:"C"}});
  assert.equal(result.code,2); assert.equal(JSON.parse(result.stdout).result.code,expected);
  assert.doesNotMatch(result.stdout,/SECRET|postgres|TARGET_EXECUTED/);
});

test("launcher bounds numeric arguments to sealed caps before executing a target", async () => {
  for(const values of [["536870913","2","8388608","1048576","32"],["536870912","-1","8388608","1048576","32"],["9".repeat(100),"2","8388608","1048576","32"]]) {
    const result=await runBounded(python,["-I","-S","-B",launcher,...values,"--","-c","print('TARGET_EXECUTED')"],{capture:true,timeoutMs:3000});
    assert.equal(result.code,2); assert.equal(JSON.parse(result.stdout).result.code,"launcher_arguments_invalid");
    assert.doesNotMatch(result.stdout,/TARGET_EXECUTED/);
  }
  assert.throws(()=>limitedPythonLaunch(python,{...DEFAULT_LIMITS,addressSpaceBytes:CAPS.addressSpaceBytes+1},["-c","pass"]));
});

test("cancellation kills the owned group, drains pipes and reaps the direct launcher/worker PID", async () => isolated(async dir => {
  const pidFile=path.join(dir,"descendant.pid");
  const script=`import subprocess,sys,time,json;child=subprocess.Popen([sys.executable,'-I','-c','import time;time.sleep(30)']);open(${JSON.stringify(pidFile)},'w').write(str(child.pid));print(json.dumps({'phase':'compile'}),flush=True);time.sleep(30)`;
  const plan=limitedPythonLaunch(python,DEFAULT_LIMITS,["-c",script]);
  const controller=new AbortController(); let timer;
  const observed=await superviseProcess({launch:()=>spawn(plan.command,plan.args,{env:{LANG:"C",LC_ALL:"C"},detached:true,stdio:["pipe","pipe","pipe"]}),payload:{},limits:DEFAULT_LIMITS,signal:controller.signal,onSpawn:()=>{timer=setTimeout(()=>controller.abort(),300)}});
  clearTimeout(timer); assert.equal(observed.status,"cancelled"); assert.equal(observed.termination.exited,true); assert.equal(observed.termination.drained,true);
  assert.equal(fs.existsSync(`/proc/${observed.processIdentity.pid}`),false);
  assert.equal(alive(Number(await readFile(pidFile,"utf8"))),false);
}));

test("launcher source change invalidates prior runtime pins before any worker spawn", async () => isolated(async dir => {
  const vf=path.join(dir,"visitor-foundry"); await mkdir(vf);
  for(const name of ["execution","capabilities"])await cp(path.join(root,"vendor/visitor-foundry-receiver/scripts/visitor-foundry",name),path.join(vf,name),{recursive:true,filter:file=>![".runtime",".python-standalone"].includes(path.basename(file))});
  await symlink(path.join(execution,".runtime"),path.join(vf,"execution/.runtime"));
  const copied=await import(pathToFileURL(path.join(vf,"execution/src/supervisor.mjs")));
  const moduleBytes=await readFile(path.join(execution,".build/structured-result.wasm"));
  const artifact=packageModule(moduleBytes,{sourceRevision:"1132af16054e4639e57827c7e521e2a9ff9f052e"});
  const binding=bindingFor(artifact,{runtimePin:copied.installation().runtimePin});
  const prior=binding.runtimePin; await writeFile(path.join(vf,"execution/src/launcher.py"),"# changed installed launcher\n");
  assert.notEqual(copied.installation().runtimePin,prior); let launched=false;
  await assert.rejects(copied.invoke({artifact,moduleBytes,binding,input:{content:[]},onSpawn:()=>{launched=true}}),/runtime binding mismatch/);
  assert.equal(launched,false);
  assert.notEqual(installation().runtimePin,JSON.parse(await readFile(path.join(root,"server/foundry/activation/receiving-100501/receipt.json"))).referenceRuntime.runtimePin);
}));

test("probe distinguishes unavailable interpreter from launcher enforcement and discards diagnostic secrets", async () => {
  const report=await collectProbe({pythonCommand:"/missing/system-python",referencePython:"/missing/SECRET-python",timeoutMs:100});
  assert.equal(report.ok,false); assert.equal(report.installedPython,false); assert.equal(report.osLimitsEnforced,false);
  assert.equal(report.referenceFailure,"spawn_failed"); assert.ok(report.unsupportedHostReasons.includes("installed_python_unavailable"));
  assert.doesNotMatch(JSON.stringify(report),/SECRET|\/missing/);
});

test("probe reports an installed interpreter separately from refused launcher enforcement", async () => isolated(async dir => {
  const wrapper=path.join(dir,"python-wrapper");
  await writeFile(wrapper,`#!/bin/sh\nulimit -n 16\nexec '${python.replaceAll("'","'\\''")}' "$@"\n`,{mode:0o700});
  const report=await collectProbe({referencePython:wrapper,timeoutMs:1000});
  assert.equal(report.installedPython,true); assert.equal(report.osLimitsEnforced,false); assert.equal(report.referenceExecution,false);
  assert.equal(report.referenceFailure,"launcher_limits_unavailable"); assert.ok(report.unsupportedHostReasons.includes("launcher_limits_unavailable"));
  assert.doesNotMatch(JSON.stringify(report),/python-wrapper|sds-platform-test/);
}));

test("pipe close without an exit witness cannot prove execution completion", async () => {
  const child=new EventEmitter(); child.pid=process.pid;
  child.stdin=new EventEmitter(); child.stdin.end=()=>{};
  child.stdout=new EventEmitter(); child.stderr=new EventEmitter();
  process.nextTick(()=>{child.emit("spawn");child.stdout.emit("data",Buffer.from('{"result":{"status":"ok"}}\n'));child.emit("close",0,null)});
  const observed=await superviseProcess({launch:()=>child,payload:{},limits:DEFAULT_LIMITS});
  assert.equal(observed.status,"unknown"); assert.equal(observed.termination.exited,false); assert.equal(observed.termination.drained,true);
});
