#!/usr/bin/env node
// Emits a reviewable, source-bound machine capability; never installs it.
import {open} from 'node:fs/promises';
import {installedSourceSha256,hostSourceSha256} from '../src/native-debt.mjs';
import {versionedSource} from '../runtime/agent-economy-rail/dist/index.js';
const args=process.argv.slice(2),get=name=>{const i=args.indexOf('--'+name);return i<0?undefined:args[i+1];};
const origin=get('origin'),tenant=get('tenant'),sds=get('sds-root'),out=get('out'),money=get('money')||'unfunded';
const url=new URL(origin);
if(url.protocol!=='https:'||url.origin!==origin||!/^[-a-z0-9_]{3,64}$/.test(tenant)||!sds?.startsWith('/')||!out?.startsWith('/')||!['unfunded','sandbox','qualified'].includes(money))throw Error('machine_profile_arguments_refused');
const value={schema:'pilot.machine-market.capability.v1',profile:'machine-market',origin,tenant,
 sourceSha256:installedSourceSha256(),hostSha256:hostSourceSha256(sds),discovery:'qualified-source',money};
if(money!=='sandbox')value.networkSource=versionedSource(get('network')||'eip155:8453');
if(money==='qualified'){
 const mode=get('network-class')||'public',forkId=get('fork-id');
 if(!['public','owned-fork'].includes(mode)||(mode==='owned-fork'&&!/^[-a-zA-Z0-9_.]{1,64}$/.test(forkId||'')))throw Error('machine_profile_arguments_refused');
 value.execution={class:mode,...(forkId?{forkId}:{})};
}
const file=await open(out,'wx',0o600);try{await file.writeFile(JSON.stringify(value,null,2)+'\n');await file.sync();}finally{await file.close();}
console.log(JSON.stringify({file:out,...value,installed:false,signerAuthority:false}));
