// Disposable VM harness only. Root privileges change this child identity, never
// product/runtime permissions or any running provider process.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
let input='',bytes=0;
for await(const b of process.stdin){bytes+=b.length;if(bytes>16384)process.exit(91);input+=b;}
const {cwd,node,env}=JSON.parse(input);
if(process.getuid()!==0||!cwd.startsWith('/tmp/sds-runtime-layout-')||!node.startsWith('/tmp/sds-runtime-layout-'))process.exit(92);
const child=spawn(node,['--import',cwd+'/server/scripts/fixtures/hosted-startup-preload.mjs','server/index.js'],{cwd,env,uid:65534,gid:65534,stdio:['ignore','pipe','pipe','ipc']});
const closed=once(child,'close');let output=0;
for(const s of [child.stdout,child.stderr])s.on('data',b=>{output+=b.length;if(output>200000)child.kill('SIGKILL');});
child.once('message',v=>process.stdout.write(JSON.stringify({port:v.port,servingUid:65534,servingGid:65534})+'\n'));
let stopping=false,timer;
function stop(){if(stopping)return;stopping=true;child.kill('SIGTERM');timer=setTimeout(()=>child.kill('SIGKILL'),6500);}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
const lifetime=setTimeout(stop,180000);
const [code,signal]=await closed;clearTimeout(timer);clearTimeout(lifetime);
let gone=false;try{process.kill(child.pid,0);}catch(e){gone=e.code==='ESRCH';}
process.stdout.write(JSON.stringify({code,signal,gone})+'\n');process.exitCode=code===0&&signal===null&&gone?0:1;
