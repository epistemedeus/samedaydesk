#!/usr/bin/env node
import {readFile} from 'node:fs/promises';

/** Optional integration client. No signup, claim, proof upload, payout or outreach. */
const [action,...args]=process.argv.slice(2);
const options={};
for(let i=0;i<args.length;i+=2){if(!/^--[a-z-]+$/.test(args[i]??'')||args[i+1]===undefined||Object.hasOwn(options,args[i]))throw new Error('invalid arguments');options[args[i]]=args[i+1];}
try{
  if(!['read','report','approve','withdraw-summary'].includes(action))throw new Error('action');
  const origin=new URL(options['--origin']);
  if(origin.protocol!=='https:'||origin.origin!==options['--origin']||origin.username||origin.password)throw new Error('origin');
  const workId=options['--work'];if(!/^[A-Za-z][A-Za-z0-9_-]{11,95}$/.test(workId??''))throw new Error('work');
  const cookie=(await readFile(options['--cookie-file'],'utf8')).trim();
  if(cookie.length>4096||/[\r\n]/.test(cookie)||!cookie.startsWith('__Host-neo_contributor='))throw new Error('session');
  const route=action==='read'?'/v1/relationship/works/'+workId:action==='report'?'/v1/relationship/works/'+workId+'/'+options['--role']:
    action==='approve'?'/v1/review/summary':'/v1/review/summary/'+workId;
  if(action==='report'&&!['requester','contributor'].includes(options['--role']))throw new Error('role');
  const csrf=action==='read'?null:(await readFile(options['--csrf-file'],'utf8')).trim();
  if(csrf!==null&&!/^[a-f0-9]{64}$/.test(csrf))throw new Error('csrf');
  const key=options['--operation'];
  if(action==='report'&&!/^[A-Za-z0-9_:-]{8,128}$/.test(key??''))throw new Error('operation');
  const body=action==='read'?undefined:await readFile(options['--body-file'],'utf8');
  if(body!==undefined&&(Buffer.byteLength(body)>8192||!JSON.parse(body)))throw new Error('body');
  const response=await fetch(origin.origin+'/api/neomorphic-contributor-journey'+route,{redirect:'error',signal:AbortSignal.timeout(10000),
    method:action==='read'?'GET':action==='report'?'PUT':action==='approve'?'POST':'DELETE',
    headers:{cookie,...(csrf?{'x-cj-csrf':csrf,origin:origin.origin,'content-type':'application/json'}:{}),...(key?{'idempotency-key':key}:{})},body});
  const reader=response.body?.getReader();if(!reader)throw new Error('response');
  const chunks=[];let size=0;
  for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>32768){await reader.cancel();throw new Error('response');}chunks.push(chunk.value);}
  const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!response.ok||result.ok===false)throw new Error('refused');
  // This is a PRIVATE terminal receipt. It must not be pasted into a public share.
  process.stdout.write(JSON.stringify({privateOnly:true,status:response.status,result})+'\n');
}catch{
  process.stderr.write('relationship operation refused or unknown; use private readback before another write\n');process.exitCode=1;
}
