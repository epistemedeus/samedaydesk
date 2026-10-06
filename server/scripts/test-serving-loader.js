import assert from "node:assert/strict";
import {spawn,spawnSync} from "node:child_process";
import {once} from "node:events";
import {fileURLToPath} from "node:url";
import path from "node:path";
import test from "node:test";

const root=fileURLToPath(new URL("../../",import.meta.url));
const preload=path.join(root,"server/scripts/fixtures/hosted-startup-preload.mjs");
const env={PATH:process.env.PATH||"/usr/bin:/bin",LANG:"C",LC_ALL:"C",NODE_ENV:"test",PORT:"0"};

test("artifact pins are synchronously requireable without the installer graph",()=>{
 const result=spawnSync(process.execPath,["-e","const p=require('./server/foundry/runtime-artifacts.mjs');console.log(JSON.stringify(p));"],
  {cwd:root,env,encoding:"utf8",timeout:10000,maxBuffer:16384});
 assert.equal(result.status,0,result.stderr);
 const p=JSON.parse(result.stdout.trim());
 assert.deepEqual(Object.keys(p).sort(),["CPYTHON_SHA256","CPYTHON_URL","WHEEL_SHA256","WHEEL_URL"]);
 assert.equal(p.CPYTHON_SHA256,"731af898886c5f821890dc901eca3c651cca8e51fa7308c159d12a1194aeac91");
 assert.equal(p.WHEEL_SHA256,"94f0288f9e1c33924995a72bb769f4c4e2885002391589dd6992cdaa35d1990a");
});

test("the normal serving graph is synchronously requireable",()=>{
 const result=spawnSync(process.execPath,["-e","const m=require('./server/lib/correspondence-mount.js');if(typeof m.mountCorrespondence!=='function')process.exit(2);console.log('loaded');"],
  {cwd:root,env,encoding:"utf8",timeout:10000,maxBuffer:16384});
 assert.equal(result.status,0,result.stderr);
 assert.equal(result.stdout.trim(),"loaded");
});

for(const optIn of [false,true])test("CommonJS host loads real HTTP entry, opt-in "+optIn,{timeout:25000},async t=>{
 const child=spawn(process.execPath,["--import",preload,"-e","require('./server/index.js');"],
  {cwd:root,env:{...env,...(optIn?{FOUNDRY_HOST_OPT_IN:"1"}:{})},stdio:["ignore","pipe","pipe","ipc"]});
 let stderr="";
 child.stderr.on("data",data=>{stderr=(stderr+data).slice(-4096);});
 child.stdout.on("data",()=>{});
 t.after(async()=>{
  if(child.exitCode!==null||child.signalCode!==null)return;
  const closed=once(child,"close");
  child.kill("SIGTERM");
  const timer=setTimeout(()=>child.kill("SIGKILL"),4000);
  try{const [code,signal]=await closed;assert.equal(code,0,stderr);assert.equal(signal,null);}
  finally{clearTimeout(timer);}
 });
 const port=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error("CommonJS HTTP entry did not listen: "+stderr)),15000);
  const fail=(code)=>{clearTimeout(timer);reject(new Error("CommonJS HTTP entry exited "+code+": "+stderr));};
  child.once("error",error=>{clearTimeout(timer);reject(error);});
  child.once("exit",fail);
  child.once("message",message=>{clearTimeout(timer);child.off("exit",fail);resolve(message.port);});
 });
 assert.ok(Number.isInteger(port)&&port>0);
 const health=await fetch("http://127.0.0.1:"+port+"/api/health",{signal:AbortSignal.timeout(5000)});
 assert.equal(health.status,200);
 assert.equal((await health.json()).service,"samedaydesk");
 const correspondence=await fetch("http://127.0.0.1:"+port+"/api/correspondence/healthz",{signal:AbortSignal.timeout(5000)});
 assert.equal(correspondence.status,200);
 const received=await correspondence.json();
 assert.equal(received.enabled,false);
 assert.equal(received.reason,optIn?"invalid_config":"unconfigured");
});
