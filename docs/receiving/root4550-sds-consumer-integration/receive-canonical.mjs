#!/usr/bin/env node
// Uses the exact model-free Pilot 14761c91 source-stage/admit implementation.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {stageReleaseSource,admitReleaseSource} from './frozen-hostinger-release-source.mjs';
const [baseline,candidate,workspace,out]=process.argv.slice(2),receipts=[];
for(const [name,sourceCheckout] of [['baseline',baseline],['candidate',candidate]]) {
 const commit=execFileSync('git',['-C',sourceCheckout,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
 if(name==='baseline')assert.equal(commit,'79fbd37d31aabdc790248443c576a2f0017e55f0');
 const options={manifest:{repository:'epistemedeus/samedaydesk',commit,neomorphicCommit:'a0c97a594cebe73236e95caa6c4028bb36a60be9',neomorphicDeskCommit:'0cebdb9a77c5bda9b2fb811f6efd1dfe35e75556'},
  sdsRoot:path.join(workspace,'canonical-'+name),sourceCheckout,reuseSource:sourceCheckout,dependenciesRoot:sourceCheckout,entryClosure:true,signal:AbortSignal.timeout(120000)};
 const staged=await stageReleaseSource(options),readback=await admitReleaseSource(options);
 assert.equal(staged.memberDigest,readback.memberDigest);assert.equal(readback.dependenciesCompatible,true);assert.equal(readback.providerMutated,false);assert.equal(readback.qualificationIssued,false);
 receipts.push({name,staged,readback});
}
assert.notEqual(receipts[0].readback.memberDigest,receipts[1].readback.memberDigest);
await writeFile(path.join(out,'canonical-source-admission.json'),JSON.stringify({schema:'root4550.canonical-source-admission.v1',receipts,intendedClosureDelta:true,installed:false},null,2)+'\n');
console.log(JSON.stringify({passed:true,receipts:receipts.map(x=>({name:x.name,commit:x.readback.sourceCommit,memberDigest:x.readback.memberDigest,files:x.readback.files,bytes:x.readback.bytes,dependenciesCompatible:x.readback.dependenciesCompatible,providerMutated:x.readback.providerMutated,qualificationIssued:x.readback.qualificationIssued}))}));
