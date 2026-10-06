// Disposable production-shaped build, inside the received missing-utilities VM namespace.
import {runBounded} from '../../foundry/bounded-child.mjs';
import {npmCli} from '../../foundry/activation/receiving-100502/namespace.mjs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const cwd=process.argv[2];
if(!cwd?.startsWith('/tmp/sds-runtime-layout-')||path.basename(cwd)!=='build')throw new Error('disposable_build_required');
const result=await runBounded(process.execPath,[await npmCli(),'run','build:managed-foundry'],{cwd,
 env:{PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C',LC_ALL:'C',FOUNDRY_CPYTHON_TARBALL:process.env.FOUNDRY_CPYTHON_TARBALL},
 capture:true,stdoutLimit:1000000,outputLimit:2000000,timeoutMs:180000});
const records=result.stdout.split('\n').filter(s=>s.startsWith('{')).map(s=>{try{return JSON.parse(s);}catch{return null;}}).filter(Boolean);
const materializer=records.find(r=>r.layout),probe=records.find(r=>r.referenceRuntime!==undefined);
process.stdout.write(JSON.stringify({code:result.code,reason:result.reason,exited:result.exited,drained:result.drained,
 materializer,probe,stdoutSha256:createHash('sha256').update(result.stdout).digest('hex')})+'\n');
process.exitCode=result.reason?1:result.code??1;
