#!/usr/bin/env node
// Emits a reviewable, source-bound machine capability; never installs it.
import {open} from 'node:fs/promises';
import {installedSourceSha256,hostSourceSha256} from '../src/native-debt.mjs';
const args=process.argv.slice(2),get=name=>{const i=args.indexOf('--'+name);return i<0?undefined:args[i+1];};
const origin=get('origin'),tenant=get('tenant'),sds=get('sds-root'),out=get('out'),money=get('money')||'unfunded';
const url=new URL(origin);
if(url.protocol!=='https:'||url.origin!==origin||!/^[-a-z0-9_]{3,64}$/.test(tenant)||!sds?.startsWith('/')||!out?.startsWith('/')||!['unfunded','sandbox'].includes(money))throw Error('machine_profile_arguments_refused');
const value={schema:'pilot.machine-market.capability.v1',profile:'machine-market',origin,tenant,
 sourceSha256:installedSourceSha256(),hostSha256:hostSourceSha256(sds),discovery:'qualified-source',money};
const file=await open(out,'wx',0o600);try{await file.writeFile(JSON.stringify(value,null,2)+'\n');await file.sync();}finally{await file.close();}
console.log(JSON.stringify({file:out,...value,installed:false,signerAuthority:false}));
